CREATE TABLE IF NOT EXISTS public.tradelink_vendor_assets (
 workspace_id uuid NOT NULL,
 vendor_id text NOT NULL CHECK(length(vendor_id) BETWEEN 1 AND 120),
 asset_kind text NOT NULL CHECK(asset_kind IN ('logo','qr')),
 image_data text NOT NULL CHECK (length(image_data) <= 400000 AND image_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision >= 1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL,
 PRIMARY KEY(workspace_id,vendor_id,asset_kind)
);
ALTER TABLE public.tradelink_vendor_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tradelink_vendor_assets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.tradelink_asset_read(p_vendor_id text,p_kind text)
RETURNS TABLE(image_data text, revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public'
AS $$
DECLARE u uuid:=auth.uid();w uuid;
BEGIN
 IF u IS NULL OR NOT public.has_module_access('tradelink',u) THEN RAISE EXCEPTION 'TRADELINK_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active) THEN RAISE EXCEPTION 'TRADELINK_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_vendor_id IS NULL OR length(p_vendor_id) NOT BETWEEN 1 AND 120 OR p_kind NOT IN ('logo','qr') THEN RAISE EXCEPTION 'TRADELINK_ASSET_INVALID' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.image_data,a.revision FROM public.tradelink_vendor_assets a WHERE a.workspace_id=w AND a.vendor_id=p_vendor_id AND a.asset_kind=p_kind;
END $$;
CREATE OR REPLACE FUNCTION public.tradelink_asset_write(p_vendor_id text,p_kind text,p_image_data text,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public'
AS $$
DECLARE u uuid:=auth.uid();w uuid;r bigint;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('tradelink',u) THEN RAISE EXCEPTION 'TRADELINK_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active) THEN RAISE EXCEPTION 'TRADELINK_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_vendor_id IS NULL OR length(p_vendor_id) NOT BETWEEN 1 AND 120 OR p_kind NOT IN ('logo','qr') OR p_expected_revision IS NULL OR p_expected_revision<0
 OR (p_image_data IS NOT NULL AND (length(p_image_data)>400000 OR p_image_data !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'))
 THEN RAISE EXCEPTION 'TRADELINK_ASSET_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||'/'||p_vendor_id||'/'||p_kind,0));
 SELECT a.revision INTO r FROM public.tradelink_vendor_assets a WHERE a.workspace_id=w AND a.vendor_id=p_vendor_id AND a.asset_kind=p_kind FOR UPDATE;
 IF coalesce(r,0)<>p_expected_revision THEN RAISE EXCEPTION 'TRADELINK_ASSET_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF p_image_data IS NULL THEN
  DELETE FROM public.tradelink_vendor_assets WHERE workspace_id=w AND vendor_id=p_vendor_id AND asset_kind=p_kind;
  RETURN 0;
 END IF;
 INSERT INTO public.tradelink_vendor_assets(workspace_id,vendor_id,asset_kind,image_data,revision,updated_by)
 VALUES(w,p_vendor_id,p_kind,p_image_data,p_expected_revision+1,u)
 ON CONFLICT(workspace_id,vendor_id,asset_kind) DO UPDATE
 SET image_data=excluded.image_data,revision=excluded.revision,updated_by=u,updated_at=now();
 RETURN p_expected_revision+1;
END $$;
REVOKE ALL ON FUNCTION public.tradelink_asset_read(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tradelink_asset_write(text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradelink_asset_read(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tradelink_asset_write(text,text,text,bigint) TO authenticated;;
