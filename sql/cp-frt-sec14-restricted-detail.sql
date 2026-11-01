-- CP-FRT-SEC14: additive restricted-field FRT detail RPC.
-- No production finance records are updated by this function.
-- Does not modify legacy frt_get_request; migration/legacy grant retirement is separate.
BEGIN;
CREATE OR REPLACE FUNCTION public.frt_get_request_restricted(
 p_workspace_id uuid, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
 v_role text;
 v_result jsonb;
BEGIN
 IF p_workspace_id IS NULL OR p_request_id IS NULL THEN
   RAISE EXCEPTION 'FRT request scope required' USING ERRCODE='22023';
 END IF;
 -- Authoritative signed-session resolver installed by CI07. Deny if absent,
 -- revoked, expired, wrong workspace or without active FRT module role.
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
   RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
  'id',r.id, 'workspace_id',r.workspace_id, 'company_code',c.code,
  'voucher_no',r.voucher_no, 'title',r.title,
  'date_needed',to_char(r.date_needed,'YYYY-MM-DD'),
  'status',r.status, 'liquidation_status',r.liquidation_status,
  'finance_approved_at',r.finance_approved_at,
  'transfer_confirmed_at',r.transfer_confirmed_at,
  'closed_at',r.closed_at, 'archived_at',r.archived_at
 ) INTO v_result
 FROM public.frt_requests r
 JOIN public.frt_companies c ON c.id=r.company_id
   AND c.workspace_id=r.workspace_id
 WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id
   AND r.archived_at IS NULL;
 IF v_result IS NULL THEN
   RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002';
 END IF;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.frt_get_request_restricted(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.frt_get_request_restricted(uuid,uuid) TO authenticated;
COMMIT;
