-- CP-FRT-WF-05A: archive retrieval and soft recovery.
-- Reuses the existing FRT membership and General Manager role contracts.
-- No new tables, roles, RLS policies, approval stages or financial records.
BEGIN;

CREATE INDEX IF NOT EXISTS frt_requests_archived_company_idx
 ON public.frt_requests(workspace_id,company_id,archived_at DESC,id DESC)
 WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.frt_archive_list(
 p_workspace_id uuid,p_company text,p_search text DEFAULT '',p_limit integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_role text;
 v_company_id uuid;
 v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 v_role:=private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$'
    OR length(coalesce(p_search,''))>120
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Invalid FRT archive filters' USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_company_id
 FROM public.frt_companies
 WHERE workspace_id=p_workspace_id AND code=p_company;
 IF v_company_id IS NULL THEN
  RAISE EXCEPTION 'FRT company unavailable' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.archived_at DESC,q.request_id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT r.id AS request_id,r.voucher_no,r.title,r.status,r.liquidation_status,
   to_char(r.date_needed,'YYYY-MM-DD') AS date_needed,r.created_at,r.archived_at
  FROM public.frt_requests r
  WHERE r.workspace_id=p_workspace_id AND r.company_id=v_company_id
   AND r.archived_at IS NOT NULL
   AND (coalesce(p_search,'')='' OR r.title ILIKE '%'||p_search||'%'
    OR coalesce(r.voucher_no,'') ILIKE '%'||p_search||'%')
  ORDER BY r.archived_at DESC,r.id DESC
  LIMIT p_limit
 ) q;
 RETURN v_rows;
END
$fn$;

CREATE OR REPLACE FUNCTION public.frt_restore_request(
 p_workspace_id uuid,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_request public.frt_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') IS NOT TRUE THEN
  RAISE EXCEPTION 'FRT restore requires the existing General Manager role'
   USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_request
 FROM public.frt_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id
  AND archived_at IS NOT NULL
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Archived FRT request unavailable' USING ERRCODE='P0002';
 END IF;
 UPDATE public.frt_requests
 SET archived_at=NULL,updated_at=clock_timestamp()
 WHERE workspace_id=p_workspace_id AND id=p_request_id;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'REQUEST_RESTORED');
 RETURN jsonb_build_object('ok',true,'requestId',p_request_id,'archivedAt',null);
END
$fn$;

REVOKE ALL ON FUNCTION public.frt_archive_list(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_restore_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_archive_list(uuid,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_restore_request(uuid,uuid) TO authenticated;

COMMIT;
