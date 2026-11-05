-- CP-WS-01B — review-only signed workspace discovery candidate.
-- DO NOT apply to production without separate authorization for the new
-- authenticated EXECUTE grant and verification of installed dependencies.
-- Requires cp-ws01b-lifecycle-contract-candidate.sql first; still no\n-- creation, switching or direct table grants.
BEGIN;

CREATE FUNCTION public.wm_ws01_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $ws01$
DECLARE
 v_actor uuid := auth.uid();
 v_current uuid;
 v_rows jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.wm_board_config_session_active()
  OR NOT EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.id=v_actor AND p.status='active'
  ) THEN
  RAISE EXCEPTION 'Signed workspace discovery denied' USING ERRCODE='42501';
 END IF;
 v_current := public.current_workspace_id(v_actor);
 IF v_current IS NULL THEN
  RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object(
   'id',w.id,'name',w.name,\n   'relation',coalesce(r.relation,'member'),\n   'privacy',coalesce(policy.privacy,'closed'),\n   'active',w.id=v_current)
  ORDER BY m.created_at,w.id),'[]'::jsonb)
 INTO v_rows
 FROM public.workspace_members m
 JOIN public.workspaces w ON w.id=m.workspace_id\n LEFT JOIN private.ws01_member_roles r ON\n  r.workspace_id=m.workspace_id AND r.user_id=m.user_id\n LEFT JOIN private.ws01_workspace_policy policy ON policy.workspace_id=w.id\n WHERE m.user_id=v_actor AND m.active IS TRUE;
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'userId',v_actor,
  'activeWorkspaceId',v_current,'rows',v_rows);
END
$ws01$;

REVOKE ALL ON FUNCTION public.wm_ws01_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wm_ws01_list() TO authenticated;

COMMIT;
