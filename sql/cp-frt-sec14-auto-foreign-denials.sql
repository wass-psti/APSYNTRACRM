-- CP-FRT-SEC14 automated foreign-scope denial probe (STAGED, NOT DEPLOYED).
-- Read-only and caller-bound. No workspace identifier is returned.
BEGIN;
CREATE OR REPLACE FUNCTION public.frt_sec14_auto_foreign_denials(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE target_workspace uuid; dashboard_result text := 'BLOCKED'; list_result text := 'BLOCKED';
BEGIN
 IF (SELECT auth.uid()) IS NULL
    OR public.apsyntra_role_is_bootstrap() IS DISTINCT FROM false
    OR private.frt_current_role(p_workspace_id) IS NULL
 THEN
   RAISE EXCEPTION 'Signed nonbootstrap FRT access required' USING ERRCODE='42501';
 END IF;
 -- The caller must also be eligible for the safe read API. A missing or
 -- revoked own-workspace grant cannot masquerade as a foreign denial.
 IF NOT pg_catalog.has_function_privilege('authenticated',
    'public.frt_board_dashboard_safe(uuid,text)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated',
    'public.frt_board_list_safe(uuid,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Restricted read grants unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM public.frt_board_dashboard_safe(p_workspace_id,'WAO');
 PERFORM public.frt_board_list_safe(p_workspace_id,'WAO','');
 SELECT w.id INTO target_workspace
 FROM public.workspaces w
 WHERE w.id<>p_workspace_id AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id=w.id AND m.user_id=(SELECT auth.uid()) AND m.active
 )
 ORDER BY w.id LIMIT 1;
 IF target_workspace IS NULL THEN
   RETURN jsonb_build_object('status','PENDING','reason','NO_INDEPENDENT_FOREIGN_WORKSPACE',
     'foreignWorkspaceExistence','NOT_VERIFIED','dashboard','PENDING','list','PENDING');
 END IF;
 BEGIN
   PERFORM public.frt_board_dashboard_safe(target_workspace,'WAO');
   dashboard_result := 'FAIL';
 EXCEPTION WHEN insufficient_privilege THEN dashboard_result := 'PASS';
 END;
 BEGIN
   PERFORM public.frt_board_list_safe(target_workspace,'WAO','');
   list_result := 'FAIL';
 EXCEPTION WHEN insufficient_privilege THEN list_result := 'PASS';
 END;
 RETURN jsonb_build_object('status',CASE WHEN dashboard_result='PASS' AND list_result='PASS' THEN 'PASS' ELSE 'FAIL' END,
  'reason',CASE WHEN dashboard_result='PASS' AND list_result='PASS' THEN 'FOREIGN_WORKSPACE_DENIAL_VERIFIED' ELSE 'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED' END,
  'foreignWorkspaceExistence','VERIFIED','dashboard',dashboard_result,'list',list_result);
END $$;
REVOKE ALL ON FUNCTION public.frt_sec14_auto_foreign_denials(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_sec14_auto_foreign_denials(uuid) TO authenticated;
COMMIT;