-- CP-FRT-FILING-01: request filing is independent of approval/liquidation.
-- Production installation is explicit; never install on an unrelated Supabase project.
DO $guard$
BEGIN
 IF to_regclass('public.frt_requests') IS NULL OR
    to_regprocedure('private.frt_has_membership(uuid)') IS NULL OR
    to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regprocedure('public.frt_create_request(uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'FRT_FILING_BACKEND_DEPENDENCY_MISSING'; END IF;
END $guard$;
ALTER TABLE public.frt_requests
 ADD COLUMN IF NOT EXISTS filing_status text NOT NULL DEFAULT 'NOT_FILED';
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='frt_requests' AND column_name='filing_status'
 AND (udt_name<>'text' OR is_nullable<>'NO')) THEN
 RAISE EXCEPTION 'FRT_FILING_COLUMN_DRIFT'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='frt_requests_filing_status_check'
 AND conrelid='public.frt_requests'::regclass) THEN
  ALTER TABLE public.frt_requests ADD CONSTRAINT frt_requests_filing_status_check
   CHECK (filing_status IN ('NOT_FILED','FILED'));
 END IF;
END $guard$;

-- Preserve the exact existing safe-list signature, role check, limit, and fields.
-- Add ONLY filing_status: never expose the financial/private request row.
CREATE OR REPLACE FUNCTION public.frt_board_list_safe(
 p_workspace_id uuid,p_company text,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_rows jsonb;
BEGIN
 IF private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' OR
    length(coalesce(p_search,''))>120 THEN
  RAISE EXCEPTION 'Invalid FRT list filters' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',q.id,'workspace_id',p_workspace_id,'company_code',p_company,
  'voucher_no',q.voucher_no,'title',q.title,
  'date_needed',q.date_needed,'status',q.status,
  'liquidation_status',q.liquidation_status,'filing_status',q.filing_status)
  ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT r.id,r.voucher_no,r.title,to_char(r.date_needed,'YYYY-MM-DD') date_needed,
         r.status,r.liquidation_status,r.filing_status,r.created_at
  FROM public.frt_requests AS r
  JOIN public.frt_companies AS c ON c.id=r.company_id
       AND c.workspace_id=r.workspace_id
  WHERE r.workspace_id=p_workspace_id AND c.code=p_company
   AND r.archived_at IS NULL
   AND (coalesce(p_search,'')='' OR r.title ILIKE '%'||p_search||'%'
        OR r.voucher_no ILIKE '%'||p_search||'%')
  ORDER BY r.created_at DESC,r.id DESC LIMIT 100
 ) AS q;
 RETURN v_rows;
END $fn$;

-- No additional role is invented: uses the same active FRT membership
-- required by frt_create_request and signed company isolation.
CREATE OR REPLACE FUNCTION public.frt_set_request_filing_status(
 p_workspace_id uuid,p_request_id uuid,p_company text,
 p_expected_status text,p_next_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_row public.frt_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'FRT_FILING_MEMBER_DENIED' USING ERRCODE='42501'; END IF;
 IF p_expected_status NOT IN ('NOT_FILED','FILED') OR
    p_next_status NOT IN ('NOT_FILED','FILED') OR
    p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'FRT_FILING_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF p_expected_status=p_next_status THEN
  RAISE EXCEPTION 'FRT_FILING_NO_CHANGE' USING ERRCODE='22023'; END IF;
 UPDATE public.frt_requests AS r
 SET filing_status=p_next_status,updated_at=clock_timestamp()
 WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id AND r.archived_at IS NULL
 AND r.filing_status=p_expected_status
 AND EXISTS (SELECT 1 FROM public.frt_companies c
   WHERE c.id=r.company_id AND c.workspace_id=p_workspace_id AND c.code=p_company)
 RETURNING r.* INTO v_row;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT_FILING_STALE_OR_UNAVAILABLE' USING ERRCODE='40001'; END IF;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES (p_workspace_id,p_request_id,auth.uid(),'REQUEST_FILING_STATUS_CHANGED',
  jsonb_build_object('fromStatus',p_expected_status,'toStatus',p_next_status));
 RETURN jsonb_build_object('ok',true,'requestId',p_request_id,
  'filingStatus',v_row.filing_status);
END $fn$;
REVOKE ALL ON FUNCTION public.frt_set_request_filing_status(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_set_request_filing_status(uuid,uuid,text,text,text)
 TO authenticated;
-- Existing safe-list executable grants and its original signature are unchanged.
