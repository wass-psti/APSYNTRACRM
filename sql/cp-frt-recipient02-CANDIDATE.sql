-- CP-FRT-RECIPIENT-02. Additive candidate, NOT installed in production until review.
-- One authoritative workspace/company-scoped address book; no new CRM roles.
DO $prereq$
BEGIN
 IF to_regclass('public.frt_companies') IS NULL OR
    to_regprocedure('private.frt_has_membership(uuid)') IS NULL OR
    to_regclass('storage.objects') IS NULL THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_DEPENDENCY_MISSING'; END IF;
END $prereq$;
CREATE TABLE IF NOT EXISTS public.frt_saved_recipients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 company_id uuid NOT NULL,
 created_by uuid NOT NULL,
 recipient_name text NOT NULL CHECK(length(btrim(recipient_name)) BETWEEN 1 AND 180),
 account_name text NOT NULL CHECK(length(btrim(account_name)) BETWEEN 1 AND 180),
 bank_name text NOT NULL CHECK(length(btrim(bank_name)) BETWEEN 1 AND 180),
 account_number text NOT NULL CHECK(length(btrim(account_number)) BETWEEN 1 AND 180),
 qr_object_path text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT frt_saved_recipient_company_fk FOREIGN KEY(company_id)
  REFERENCES public.frt_companies(id),
 CONSTRAINT frt_saved_recipient_qr_path CHECK(qr_object_path IS NULL OR length(qr_object_path)<=250),
 CONSTRAINT frt_saved_recipient_company_unique UNIQUE(workspace_id,id,company_id)
);
CREATE INDEX IF NOT EXISTS frt_saved_recipients_workspace_company_idx
 ON public.frt_saved_recipients(workspace_id,company_id,created_at DESC);
ALTER TABLE public.frt_saved_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_saved_recipients FROM PUBLIC,anon,authenticated;
-- Functions reuse the existing signed active-member check, never expose the table.
CREATE OR REPLACE FUNCTION public.frt_list_saved_recipients(
 p_workspace_id uuid,p_company text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_BAD_COMPANY' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'recipientName',r.recipient_name,'accountName',r.account_name,
  'bankName',r.bank_name,'accountNumber',r.account_number,
  'qrPath',r.qr_object_path,'updatedAt',r.updated_at)
  ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_rows
 FROM (SELECT sr.* FROM public.frt_saved_recipients sr
  JOIN public.frt_companies c ON c.id=sr.company_id AND c.workspace_id=sr.workspace_id
  WHERE sr.workspace_id=p_workspace_id AND c.code=p_company
   AND sr.created_by=auth.uid()
  ORDER BY sr.created_at DESC,sr.id DESC LIMIT 200) r;
 RETURN v_rows;
END $fn$;
CREATE OR REPLACE FUNCTION public.frt_save_recipient(
 p_workspace_id uuid,p_company text,p_recipient_name text,p_account_name text,
 p_bank_name text,p_account_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_company uuid;v_row public.frt_saved_recipients%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' OR
  p_recipient_name IS NULL OR length(btrim(p_recipient_name)) NOT BETWEEN 1 AND 180 OR
  p_account_name IS NULL OR length(btrim(p_account_name)) NOT BETWEEN 1 AND 180 OR
  p_bank_name IS NULL OR length(btrim(p_bank_name)) NOT BETWEEN 1 AND 180 OR
  p_account_number IS NULL OR length(btrim(p_account_number)) NOT BETWEEN 1 AND 180 THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_company FROM public.frt_companies
  WHERE workspace_id=p_workspace_id AND code=p_company;
 IF v_company IS NULL THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_COMPANY_UNKNOWN' USING ERRCODE='22023'; END IF;
 INSERT INTO public.frt_saved_recipients(workspace_id,company_id,created_by,
  recipient_name,account_name,bank_name,account_number)
 VALUES(p_workspace_id,v_company,auth.uid(),btrim(p_recipient_name),btrim(p_account_name),
  btrim(p_bank_name),btrim(p_account_number)) RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'qrPath',NULL,'saved',true);
END $fn$;
CREATE OR REPLACE FUNCTION public.frt_set_recipient_qr(
 p_workspace_id uuid,p_company text,p_recipient_id uuid,
 p_expected_path text,p_next_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_row public.frt_saved_recipients%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' OR
  p_next_path IS NULL OR length(p_next_path)>250 OR
  p_next_path !~ ('^'||p_workspace_id::text||'/recipients/'||p_recipient_id::text||'/[0-9a-f-]{36}[.](png|jpg|webp)$') THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_QR_INVALID_PATH' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='frt-attachments'
  AND o.name=p_next_path AND o.owner_id=auth.uid()::text
  AND o.metadata->>'mimetype' IN ('image/png','image/jpeg','image/webp')) THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_QR_BINARY_MISSING' USING ERRCODE='22023'; END IF;
 UPDATE public.frt_saved_recipients r SET qr_object_path=p_next_path,updated_at=now()
 WHERE r.id=p_recipient_id AND r.workspace_id=p_workspace_id
 AND r.created_by=auth.uid() AND r.qr_object_path IS NOT DISTINCT FROM p_expected_path
 AND EXISTS (SELECT 1 FROM public.frt_companies c WHERE c.id=r.company_id
  AND c.workspace_id=p_workspace_id AND c.code=p_company)
 RETURNING r.* INTO v_row;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT_RECIPIENT_QR_STALE_OR_DENIED' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('id',v_row.id,'qrPath',v_row.qr_object_path,'saved',true);
END $fn$;
REVOKE ALL ON FUNCTION public.frt_list_saved_recipients(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_save_recipient(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_set_recipient_qr(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_list_saved_recipients(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_save_recipient(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_set_recipient_qr(uuid,text,uuid,text,text) TO authenticated;
-- Reuse existing PRIVATE bucket and its existing workspace-scoped membership policies.
-- Do not add bucket policies, create new buckets, or grant direct access to recipient table.
