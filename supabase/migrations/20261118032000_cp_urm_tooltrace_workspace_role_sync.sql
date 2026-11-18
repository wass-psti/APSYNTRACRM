-- CP-URM-TOOLTRACE-01: CRM role management uses the domain's existing
-- workspace-scoped Tool Traceability memberships. No new tables or RLS policies.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';

CREATE OR REPLACE FUNCTION public.apsyntra_role_tooltrace_workspace_snapshot(
 p_workspace_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $rpc$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN pg_catalog.jsonb_build_object(
  'contract','cp-urm-tooltrace-workspace-v1',
  'workspaceId',p_workspace_id,
  'assignments',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'userId',m.user_id,'moduleId','tool-traceability',
    'role',m.role,'enabled',(m.enabled AND m.status='active'),
    'updatedAt',m.updated_at) ORDER BY m.user_id)
   FROM public.tool_traceability_memberships m
   JOIN public.workspace_members w ON w.user_id=m.user_id
    AND w.workspace_id=m.workspace_id AND w.active IS TRUE
   JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
   WHERE m.workspace_id=p_workspace_id
  ),'[]'::jsonb)
 );
END;
$rpc$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_tooltrace_workspace_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $rpc$
DECLARE
 v_actor uuid:=auth.uid();
 v_current public.tool_traceability_memberships%rowtype;
 v_result public.tool_traceability_memberships%rowtype;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR
   p_role NOT IN ('ADMIN','LOGISTICS','USER','VIEWER') OR
   p_role IS NULL OR p_enabled IS NULL OR
   EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
          WHERE b.user_id=p_target_user_id) THEN
  RAISE EXCEPTION 'Invalid, self, or protected role target' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.workspace_members w JOIN public.profiles p
    ON p.id=w.user_id AND p.status='active'
   WHERE w.workspace_id=p_workspace_id AND w.user_id=p_target_user_id AND w.active IS TRUE
 ) THEN RAISE EXCEPTION 'Target not in active workspace' USING ERRCODE='42501'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_workspace_id::text||':'||p_target_user_id::text||':tool-traceability',0));
 SELECT * INTO v_current FROM public.tool_traceability_memberships
 WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
 IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Tool Traceability assignment changed; refresh before retrying' USING ERRCODE='PT409';
 END IF;
 IF NOT p_enabled AND (v_current.user_id IS NULL OR NOT v_current.enabled) THEN
   RAISE EXCEPTION 'No enabled Tool Traceability role to revoke' USING ERRCODE='PT409';
 END IF;
 IF v_current.role='ADMIN' AND v_current.enabled AND v_current.status='active'
    AND (p_role<>'ADMIN' OR NOT p_enabled) AND
    (SELECT count(*) FROM public.tool_traceability_memberships m
       JOIN public.workspace_members w ON w.user_id=m.user_id
        AND w.workspace_id=m.workspace_id AND w.active IS TRUE
       WHERE m.workspace_id=p_workspace_id AND m.role='ADMIN'
       AND m.enabled IS TRUE AND m.status='active')<=1 THEN
   RAISE EXCEPTION 'Last active Tool Traceability administrator cannot be removed' USING ERRCODE='42501';
 END IF;

 INSERT INTO public.tool_traceability_memberships
 (workspace_id,user_id,role,enabled,status,assigned_by,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_role,p_enabled,
  CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,v_actor,pg_catalog.clock_timestamp())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET
  role=EXCLUDED.role,enabled=EXCLUDED.enabled,status=EXCLUDED.status,
  assigned_by=EXCLUDED.assigned_by,updated_at=pg_catalog.clock_timestamp()
 RETURNING * INTO v_result;
 INSERT INTO public.tool_traceability_activity
 (workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'membership',p_target_user_id::text,v_actor,'role_configured',
  pg_catalog.jsonb_build_object('role',v_result.role,'enabled',v_result.enabled,
  'previousRole',v_current.role,'previousEnabled',v_current.enabled,'source','CRM'));
 RETURN pg_catalog.jsonb_build_object(
  'effective',true,'workspaceId',p_workspace_id,'targetUserId',p_target_user_id,
  'moduleId','tool-traceability','role',v_result.role,
  'enabled',(v_result.enabled AND v_result.status='active'),
  'updatedAt',v_result.updated_at);
END;
$rpc$;
REVOKE ALL ON FUNCTION public.apsyntra_role_tooltrace_workspace_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apsyntra_role_tooltrace_workspace_set(uuid,uuid,text,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_tooltrace_workspace_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_tooltrace_workspace_set(uuid,uuid,text,boolean,timestamptz) TO authenticated;
COMMIT;
