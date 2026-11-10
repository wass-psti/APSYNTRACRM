-- Disposable PG17 signed member switch, stale/foreign denial and round-trip.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF NOT has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags WHERE id AND selection_enabled)
 THEN RAISE EXCEPTION 'Atomic installation did not activate scoped selector'; END IF;
END $preflight$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',false);
DO $first$
DECLARE receipt jsonb;
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
    '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Unexpected baseline workspace'; END IF;
 receipt:=public.wm_ws01_select(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001');
 IF receipt->>'switched'<>'true' OR
    receipt->>'workspaceId'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Selector rejected valid multi-workspace membership'; END IF;
END $first$;
DO $verify$
DECLARE receipt jsonb; catalog jsonb;
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
    '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Active server workspace was not changed'; END IF;
 catalog:=public.wm_ws01_list();
 IF catalog->>'activeWorkspaceId'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Signed workspace catalog remained stale'; END IF;
 BEGIN
  PERFORM public.wm_ws01_select(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Stale CAS was permitted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_select(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'Foreign workspace permitted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 receipt:=public.wm_ws01_select(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002');
 IF receipt->>'switched'<>'true'
 THEN RAISE EXCEPTION 'Return to original workspace failed'; END IF;
END $verify$;
DO $returned$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
    '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Return to original workspace did not persist'; END IF;
END $returned$;
RESET ROLE;
