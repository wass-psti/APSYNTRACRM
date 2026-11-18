-- CP-URM-SCOPED-02A: Fund Released Tracker workspace role integration.
-- Keep legacy global assignments as fallback until the workspace has an explicit
-- Fund Tracker membership; never migrate global grants across workspaces.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';

CREATE OR REPLACE FUNCTION public.apsyntra_role_frt_workspace_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $rpc$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN pg_catalog.jsonb_build_object(
  'contract','cp-urm-frt-workspace-v1','workspaceId',p_workspace_id,
  'assignments',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'userId',m.user_id,'moduleId','fund-released-tracker','role',m.role,
    'enabled',(m.enabled IS TRUE AND m.status='active'),
    'updatedAt',m.updated_at) ORDER BY m.user_id)
   FROM public.frt_memberships m
   JOIN public.workspace_members w ON w.user_id=m.user_id
    AND w.workspace_id=m.workspace_id AND w.active IS TRUE
   JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
   WHERE m.workspace_id=p_workspace_id
  ),'[]'::jsonb));
END;
$rpc$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_frt_workspace_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $rpc$
DECLARE
 v_actor uuid:=auth.uid();
 v_previous public.frt_memberships%rowtype;
 v_result public.frt_memberships%rowtype;
 v_change_id uuid;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR
    p_role IS NULL OR p_role NOT IN
      ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR') OR
    p_enabled IS NULL OR
    EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
      WHERE b.user_id=p_target_user_id) THEN
   RAISE EXCEPTION 'Invalid or protected Fund Tracker target' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members w
  JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
  WHERE w.workspace_id=p_workspace_id AND w.user_id=p_target_user_id
    AND w.active IS TRUE) THEN
  RAISE EXCEPTION 'Target is not active in the selected workspace' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_workspace_id::text||':frt:'||p_target_user_id::text,0));
 SELECT * INTO v_previous FROM public.frt_memberships
 WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
 IF v_previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Fund Tracker role changed; refresh before retrying' USING ERRCODE='PT409';
 END IF;
 IF NOT p_enabled AND v_previous.user_id IS NULL AND
   NOT EXISTS(SELECT 1 FROM public.module_role_assignments a
    WHERE a.user_id=p_target_user_id AND a.module_id='fund-released-tracker'
      AND a.enabled IS TRUE) THEN
  RAISE EXCEPTION 'No Fund Tracker role exists to revoke' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_role,p_enabled,
  CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,pg_catalog.clock_timestamp())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET
  role=EXCLUDED.role,enabled=EXCLUDED.enabled,status=EXCLUDED.status,
  updated_at=pg_catalog.clock_timestamp()
 RETURNING * INTO v_result;
 INSERT INTO public.apsyntra_role_change_requests(
  workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,
  CASE WHEN p_enabled THEN 'assignment.assign' ELSE 'assignment.revoke' END,
  pg_catalog.jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
    'resourceId','fund-released-tracker','source','frt_memberships',
    'previousRole',v_previous.role,'previousEnabled',v_previous.enabled,
    'result',pg_catalog.jsonb_build_object('role',v_result.role,
      'enabled',v_result.enabled,'updatedAt',v_result.updated_at)),
  'applied') RETURNING id INTO v_change_id;
 INSERT INTO public.apsyntra_role_change_audit(
  change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change_id,p_workspace_id,v_actor,'applied',
  pg_catalog.jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
   'resourceId','fund-released-tracker','before',v_previous.role,
   'after',v_result.role,'enabled',v_result.enabled,'source','frt_memberships'));
 RETURN pg_catalog.jsonb_build_object(
  'effective',true,'workspaceId',p_workspace_id,'targetUserId',p_target_user_id,
  'moduleId','fund-released-tracker','role',v_result.role,
  'enabled',(v_result.enabled AND v_result.status='active'),
  'updatedAt',v_result.updated_at,'changeId',v_change_id);
END;
$rpc$;

-- Prefer this workspace's explicit membership in genuine Fund Tracker workflow
-- authorization; retain the previous legacy role when no membership exists.
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $role$
 SELECT role_source.role
 FROM (
   SELECT CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER'
               WHEN m.user_id IS NOT NULL THEN
                 CASE WHEN m.enabled AND m.status='active' THEN m.role ELSE NULL END
               ELSE a.role END AS role
   FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
     AND wm.workspace_id=p_workspace_id AND wm.active=true
   LEFT JOIN public.frt_memberships m ON m.workspace_id=p_workspace_id
     AND m.user_id=p.id
   LEFT JOIN public.module_role_assignments a ON a.user_id=p.id
     AND a.module_id='fund-released-tracker' AND a.enabled=true
   WHERE p.id=(SELECT auth.uid()) AND p.status='active'
     AND (SELECT private.frt_signed_session_active())
     AND (p.platform_role='admin_general_manager' OR
       m.user_id IS NOT NULL OR
       a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
   LIMIT 1
 ) role_source
 WHERE role_source.role IS NOT NULL AND
  (public.apsyntra_crm_explicit_role(auth.uid(),p_workspace_id) IS NULL
   OR public.apsyntra_crm_module_role_rank(
        'fund-released-tracker',role_source.role)
      <= public.apsyntra_crm_role_rank(
        public.apsyntra_crm_effective_role(auth.uid(),p_workspace_id)));
$role$;

-- Align the common shell's effective-access projection with the same source,
-- but preserve legacy reads for users with no explicit FRT workspace membership.
DO $patch$
DECLARE before_sql text; after_sql text;
BEGIN
 before_sql:=pg_catalog.pg_get_functiondef(
  'public.apsyntra_crm_my_effective_access()'::regprocedure);
 IF position(
  'WHEN ''tool-traceability'' THEN traceability.role' IN before_sql)=0
 OR position(
  'LEFT JOIN public.tool_traceability_memberships traceability' IN before_sql)=0
 OR position(
  'public.apsyntra_crm_module_role_rank' IN before_sql)=0 THEN
  RAISE EXCEPTION 'CRM effective access projection changed: manual review required' USING ERRCODE='55000';
 END IF;
 after_sql:=pg_catalog.replace(before_sql,
  'WHEN ''tool-traceability'' THEN traceability.role',
  'WHEN ''tool-traceability'' THEN traceability.role'||
  E'\n        WHEN ''fund-released-tracker'' THEN CASE WHEN frt.user_id IS NOT NULL THEN'||
  E'\n          CASE WHEN frt.enabled IS TRUE AND frt.status = ''active'' THEN frt.role ELSE NULL END'||
  E'\n          ELSE assignment.role END');
 after_sql:=pg_catalog.replace(after_sql,
  'LEFT JOIN public.tool_traceability_memberships traceability',
  'LEFT JOIN public.frt_memberships frt'||
  E'\n      ON requested.id = ''fund-released-tracker'''||
  E'\n     AND frt.workspace_id = v_workspace'||
  E'\n     AND frt.user_id = v_actor'||
  E'\n    LEFT JOIN public.tool_traceability_memberships traceability');
 IF after_sql=before_sql OR position(
  'LEFT JOIN public.frt_memberships frt' IN after_sql)=0 THEN
  RAISE EXCEPTION 'CRM effective role patch invariant failed' USING ERRCODE='55000';
 END IF;
 EXECUTE after_sql;
END;
$patch$;
REVOKE ALL ON FUNCTION public.apsyntra_role_frt_workspace_snapshot(uuid)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apsyntra_role_frt_workspace_set(
 uuid,uuid,text,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_frt_workspace_snapshot(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_frt_workspace_set(
 uuid,uuid,text,boolean,timestamptz) TO authenticated;
COMMIT;
