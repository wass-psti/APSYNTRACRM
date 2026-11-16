-- CP-FRT-WF-05A: signed activity, discussion readback and archive recovery.
-- Reuses the existing FRT membership and General Manager role contracts.
-- No new tables, roles, RLS policies, financial records or approval stages.
BEGIN;

CREATE OR REPLACE FUNCTION public.frt_activity_list(
 p_workspace_id uuid,p_company text,p_limit integer DEFAULT 1000
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
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'Invalid FRT activity filters' USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_company_id
 FROM public.frt_companies
 WHERE workspace_id=p_workspace_id AND code=p_company;
 IF v_company_id IS NULL THEN
  RAISE EXCEPTION 'FRT company unavailable' USING ERRCODE='42501';
 END IF;

 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT a.id,a.fund_request_id AS request_id,r.title AS request_title,
   r.voucher_no,a.action,
   coalesce(nullif(btrim(m.display_name),''),'Unknown user') AS actor_name,
   a.created_at,
   jsonb_strip_nulls(jsonb_build_object(
    'voucher',a.details->'voucher',
    'total',a.details->'total',
    'company',a.details->'company',
    'fromStatus',a.details->'fromStatus',
    'toStatus',a.details->'toStatus',
    'reference',a.details->'reference',
    'bankName',a.details->'bankName',
    'transactionReference',a.details->'transactionReference',
    'executedAt',a.details->'executedAt',
    'file',a.details->'file',
    'category',a.details->'category'
   )) AS details
  FROM public.frt_audit_logs a
  JOIN public.frt_requests r
   ON r.id=a.fund_request_id AND r.workspace_id=a.workspace_id
  JOIN public.frt_companies c
   ON c.id=r.company_id AND c.workspace_id=r.workspace_id
  LEFT JOIN public.frt_memberships m
   ON m.workspace_id=a.workspace_id AND m.user_id=a.user_id
  WHERE a.workspace_id=p_workspace_id AND c.id=v_company_id
   AND a.created_at>=now()-interval '30 days'
  ORDER BY a.created_at DESC,a.id DESC
  LIMIT p_limit
 ) q;
 RETURN v_rows;
END
$fn$;

CREATE OR REPLACE FUNCTION public.frt_request_comments_list(
 p_workspace_id uuid,p_request_id uuid,p_company text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_role text;
 v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 v_role:=private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.frt_requests r
  JOIN public.frt_companies c
   ON c.id=r.company_id AND c.workspace_id=r.workspace_id
  WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id AND c.code=p_company
 ) THEN
  RAISE EXCEPTION 'FRT request unavailable' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT c.id,c.body,c.created_at,
   coalesce(nullif(btrim(m.display_name),''),'Unknown user') AS author_name,
   c.user_id=auth.uid() AS is_mine
  FROM public.frt_comments c
  LEFT JOIN public.frt_memberships m
   ON m.workspace_id=c.workspace_id AND m.user_id=c.user_id
  WHERE c.workspace_id=p_workspace_id AND c.fund_request_id=p_request_id
  ORDER BY c.created_at DESC,c.id DESC
  LIMIT 500
 ) q;
 RETURN v_rows;
END
$fn$;

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
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.archived_at DESC,q.id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT r.id AS request_id,r.voucher_no,r.title,r.status,r.liquidation_status,
   to_char(r.date_needed,'YYYY-MM-DD') AS date_needed,r.created_at,r.archived_at
  FROM public.frt_requests r
  WHERE r.workspace_id=p_workspace_id AND r.company_id=v_company_id
   AND r.archived_at IS NOT NULL
   AND (coalesce(p_search,'')='' OR r.title ILIKE '%'||p_search||'%'
    OR r.voucher_no ILIKE '%'||p_search||'%')
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
 IF auth.uid() IS NULL OR NOT private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') THEN
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

-- Preserve the existing comment contract and return its generated ID for
-- reliable client readback; the existing membership and request checks remain.
CREATE OR REPLACE FUNCTION public.frt_add_comment(
 p_workspace_id uuid,p_request_id uuid,p_body text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
 v_comment_id uuid;
BEGIN
 IF NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'Active Fund Released Tracker membership is required';
 END IF;
 IF length(trim(coalesce(p_body,'')))<1 OR length(p_body)>4000 THEN
  RAISE EXCEPTION 'Invalid comment';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.frt_requests
  WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL
 ) THEN
  RAISE EXCEPTION 'Request not found';
 END IF;
 INSERT INTO public.frt_comments(workspace_id,fund_request_id,user_id,body)
 VALUES(p_workspace_id,p_request_id,auth.uid(),trim(p_body))
 RETURNING id INTO v_comment_id;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'COMMENT_ADDED');
 RETURN jsonb_build_object('ok',true,'commentId',v_comment_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.frt_activity_list(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_request_comments_list(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_archive_list(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_restore_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_activity_list(uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_request_comments_list(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_archive_list(uuid,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_restore_request(uuid,uuid) TO authenticated;

COMMIT;
