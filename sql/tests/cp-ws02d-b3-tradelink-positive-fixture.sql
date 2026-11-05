-- CP-WS-02D/B3 TradeLink original verification and synthetic workspace storage.
-- Disposable PG17 only. This fixture does not access production buckets.
\set ON_ERROR_STOP on
DO $pre$ BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regclass('public.tradelink_vendor_assets') IS NOT NULL
 OR to_regclass('public.tradelink_attachment_reconciliation') IS NOT NULL
 OR to_regprocedure('public.tradelink_reconciliation_verify_revision(text,bigint)') IS NOT NULL
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 THEN RAISE EXCEPTION 'TradeLink fixture collision or non-disposable database' USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TABLE public.tradelink_vendor_assets(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 vendor_id text NOT NULL,asset_kind text NOT NULL,
 image_data text,revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.profiles(id),
 PRIMARY KEY(workspace_id,vendor_id,asset_kind)
);
CREATE TABLE public.tradelink_attachment_reconciliation(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 storage_key text NOT NULL,
 attachment_id text NOT NULL,
 reported_by uuid REFERENCES public.profiles(id),
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 observed_revision bigint,observed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,storage_key)
);
CREATE TABLE public.tradelink_cleanup_reference_fences(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 storage_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 PRIMARY KEY(workspace_id,storage_key)
);
CREATE TABLE public.tradelink_attachment_cleanup_audit(
 request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 storage_key text NOT NULL,
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 expected_revision bigint,
 observed_revision bigint,
 assessment text,
 storage_object_present boolean,
 execution_status text NOT NULL DEFAULT 'blocked',
 requested_at timestamptz NOT NULL DEFAULT now()
);
-- Simulated storage bucket, never tied to Supabase production Storage.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.objects(
 bucket_id text NOT NULL,name text NOT NULL,
 PRIMARY KEY(bucket_id,name)
);
-- Original verified source, read-only catalog snapshot (not patched).
-- SHA fingerprint of production original MD5: fc911ce0107286ebea8f670d77f2629c
CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_verify_revision(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(decision text, current_revision bigint, storage_object_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 caller uuid := auth.uid(); ws uuid; payload jsonb; rev bigint;
 referenced boolean := false; manifest_valid boolean := false; present boolean := false; outcome text;
begin
 if caller is null or not public.has_module_access('tradelink',caller)
  or not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
  raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid reconciliation revision or workspace key' using errcode='22023';
 end if;
 perform 1 from public.tradelink_attachment_reconciliation c
  where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select e.value::jsonb,e.revision into payload,rev from public.module_state_entries e
  where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared'
  for share;
 if payload is not null and jsonb_typeof(payload)='object' then
   referenced := jsonb_path_exists(payload,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',p_storage_key));
   if jsonb_typeof(payload->'attachments')='array' then
    select not exists(
      select 1 from jsonb_array_elements(payload->'attachments') a
      where jsonb_typeof(a)<>'object' or nullif(btrim(a->>'id'),'') is null
      or nullif(btrim(a->>'documentId'),'') is null or nullif(btrim(a->>'storageKey'),'') is null
      or a->>'status' not in ('active','replaced','removed')
      or a->>'storageProvider' not in ('supabase-storage','local-disk','local-indexeddb')
      or (a->>'storageProvider'='supabase-storage' and left(a->>'storageKey',length(ws::text)+1)<>ws::text||'/'))
    and (select count(*)=count(distinct a->>'id') and count(*)=count(distinct a->>'storageKey')
       from jsonb_array_elements(payload->'attachments') a) into manifest_valid;
   end if;
 end if;
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into present;
 outcome := case
   when rev is null or rev<>p_expected_revision then 'stale-or-missing-revision'
   when referenced then 'referenced'
   when not manifest_valid then 'unverifiable'
   when not present then 'object-absent'
   else 'unreferenced-at-locked-revision'
 end;
 return query select outcome,rev,present;
end; $function$
;
REVOKE ALL ON FUNCTION public.tradelink_reconciliation_verify_revision(text,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tradelink_reconciliation_verify_revision(text,bigint)
 TO authenticated;
