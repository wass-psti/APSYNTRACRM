-- CP-BOARD-COL-DELETE: disposable PostgreSQL ONLY.
-- Test caller-role grants and signed GoTrue-shaped context with SET ROLE.
-- Synthetic auth.sessions data; NOT genuine browser acceptance.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF current_database()<>'postgres'
 OR to_regprocedure('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)') IS NULL
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id) THEN
  RAISE EXCEPTION 'Role acceptance requires disposable and default-off recovery'
   USING ERRCODE='42501';
 END IF;
 IF NOT has_function_privilege('authenticated',
  'public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.wm_list_recoverable_board_columns(uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_table_privilege('authenticated',
  'private.wm_recoverable_column_activation','SELECT')
 OR has_table_privilege('authenticated',
  'private.wm_recoverable_deleted_cells','SELECT') THEN
  RAISE EXCEPTION 'Unexpected new recovery role grants' USING ERRCODE='42501';
 END IF;
END $preflight$;
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '70000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $signed$
DECLARE
 v_board uuid:='30000000-0000-4000-8000-000000000001';
BEGIN
 IF NOT private.wm_board_config_session_active() THEN
  RAISE EXCEPTION 'Synthetic caller has no registered session' USING ERRCODE='P9999';
 END IF;
 IF NOT public.work_board_access(v_board,'manage') THEN
  RAISE EXCEPTION 'Synthetic caller missing original board ACL' USING ERRCODE='P9999';
 END IF;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
    v_board,NULL::uuid,now(),0,'DELETE synthetic');
  RAISE EXCEPTION 'Default-off delete bypass under authenticated role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_DELETE_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(
    v_board,'11111111-1111-4111-8111-111111111111',now());
  RAISE EXCEPTION 'Default-off restore bypass under authenticated role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_RESTORE_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns(v_board);
  RAISE EXCEPTION 'Default-off list bypass under authenticated role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_RECOVERY_LIST_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
END $signed$;
RESET ROLE;
DO $preserved$
BEGIN
 IF (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>0
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>0
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id) THEN
  RAISE EXCEPTION 'Denied authenticated role mutated data' USING ERRCODE='P9999';
 END IF;
END $preserved$;
ROLLBACK;
DO $done$
BEGIN
 RAISE NOTICE 'CP-BOARD-COL-DELETE synthetic authenticated-role default-off checks PASS';
END $done$;
