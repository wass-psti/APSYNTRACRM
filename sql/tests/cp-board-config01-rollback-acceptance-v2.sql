-- CP-BOARD-CONFIG01 v2 disposable rollback acceptance.
\set ON_ERROR_STOP on
DO $test$
DECLARE v_board uuid:='30000000-0000-4000-8000-000000000001';
 v_rows bigint; v_settings jsonb;
BEGIN
 IF to_regclass('public.wm_board_ui_settings') IS NULL THEN
  RAISE EXCEPTION 'Settings table removed during fail-closed rollback';
 END IF;
 SELECT count(*) INTO v_rows FROM public.wm_board_ui_settings WHERE board_id=v_board;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Persisted settings were lost during rollback'; END IF;
 IF has_function_privilege('authenticated','public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_delete_board_column(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_add_board_column(uuid,text,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Unsafe signed writer still executable'; END IF;
 IF NOT has_function_privilege('authenticated','public.wm_board_ui_read(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Viewer settings-read compatibility lost'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.work_board_columns WHERE column_key='col_seeded')
 OR NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE id='40000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Preexisting primary board schema or items lost'; END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 v_settings:=public.wm_board_ui_read(v_board);
 IF v_settings->>'primary_label'<>'Work item' THEN
  RAISE EXCEPTION 'Saved primary display label was lost'; END IF;
 RAISE NOTICE 'CP-BOARD-CONFIG01 v2 data-preserving, fail-closed rollback PASS';
END $test$;
