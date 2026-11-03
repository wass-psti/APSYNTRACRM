-- CP-BOARD-CONFIG01 v2: independent-focused synthetic security regression.
-- Disposable PostgreSQL only; tests are not genuine GoTrue HTTPS acceptance.
\set ON_ERROR_STOP on
DO $checks$
DECLARE
 board uuid:='30000000-0000-4000-8000-000000000001';
 foreign_board uuid:='30000000-0000-4000-8000-000000000002';
 status_column uuid; value_before jsonb; settings jsonb; payload jsonb;
BEGIN
 SELECT id INTO status_column FROM public.work_board_columns
  WHERE board_id=board AND column_key='custom:fixture-status';
 IF status_column IS NULL THEN RAISE EXCEPTION 'No status fixture'; END IF;
 payload:=jsonb_build_object('contract','m143-v1',
  'mappings',jsonb_build_array(jsonb_build_object('source','Item','action','item')),
  'rows',jsonb_build_array(jsonb_build_object('title','Example','values','{}'::jsonb)),
  'newColumns',jsonb_build_array(jsonb_build_object('source','Extra','name','Extra','type','text')),
  'group','{}'::jsonb,'matches','{}'::jsonb);
 SELECT value INTO value_before FROM public.work_board_item_values
  WHERE column_id=status_column;
 IF value_before IS NULL THEN RAISE EXCEPTION 'Status value fixture missing'; END IF;
 -- Editor keeps item permissions but cannot create schema inside privileged wizard.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
 IF NOT public.work_board_access(board,'edit') OR public.work_board_access(board,'manage') THEN
  RAISE EXCEPTION 'Editor role ceiling fixture invalid';
 END IF;
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,
   (SELECT updated_at FROM public.work_boards WHERE id=board),payload);
  RAISE EXCEPTION 'Editor wizard created schema columns';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_set_board_status_labels(status_column,
   '[{"id":"alpha","label":"Renamed"}]'::jsonb,NULL);
  RAISE EXCEPTION 'Editor changed status column labels';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Manager can perform a non-destructive label rename.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 PERFORM public.wm_set_board_status_labels(status_column,
   '[{"id":"alpha","label":"Renamed"}]'::jsonb,NULL);
 IF (SELECT value FROM public.work_board_item_values WHERE column_id=status_column)
    IS DISTINCT FROM value_before THEN
  RAISE EXCEPTION 'Non-destructive status label rename altered cell value';
 END IF;
 -- No removal of an option still referenced by any item.
 BEGIN
  PERFORM public.wm_set_board_status_labels(status_column,
   '[{"id":"beta","label":"Beta"}]'::jsonb,NULL);
  RAISE EXCEPTION 'Populated status label was removed';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF (SELECT value FROM public.work_board_item_values WHERE column_id=status_column)
    IS DISTINCT FROM value_before THEN
  RAISE EXCEPTION 'Failed status-label change removed persisted value';
 END IF;

 -- Cross-workspace access rejected on every new RPC.
 BEGIN
  PERFORM public.wm_board_ui_read(foreign_board);
  RAISE EXCEPTION 'Foreign board settings exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Revoked token is denied even if JWT sub is otherwise valid.
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000004',false);
 IF private.wm_board_config_session_active() THEN
  RAISE EXCEPTION 'Foreign user session accepted';
 END IF;
 BEGIN
  PERFORM public.wm_board_ui_read(board);
  RAISE EXCEPTION 'Foreign session read access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000001',false);
 UPDATE auth.sessions SET not_after=now()-interval '1 hour'
  WHERE id='70000000-0000-4000-8000-000000000001';
 IF private.wm_board_config_session_active() THEN
  RAISE EXCEPTION 'Expired session accepted';
 END IF;
 BEGIN
  PERFORM public.wm_board_ui_read(board);
  RAISE EXCEPTION 'Expired session settings accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
  WHERE id='70000000-0000-4000-8000-000000000001';
 IF NOT private.wm_board_config_session_active() THEN
  RAISE EXCEPTION 'Active manager session was not restored';
 END IF;
 -- Verify the entire signed legacy writer grant surface remains closed.
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
   ('wm_add_board_column','wm_add_board_column_at','wm_change_board_column_type',
    'wm_delete_board_column','wm_duplicate_board_column',
    'wm_move_board_column','wm_update_board_column')
   AND (has_function_privilege('authenticated',p.oid,'EXECUTE')
    OR has_function_privilege('anon',p.oid,'EXECUTE')))>0 THEN
  RAISE EXCEPTION 'Legacy schema-writer grant remains';
 END IF;
 RAISE NOTICE 'CP-BOARD-CONFIG01 v2 indirect, status, session, workspace PASS';
END $checks$;
