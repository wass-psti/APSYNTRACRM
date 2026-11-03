\set ON_ERROR_STOP on
DO $check$
BEGIN
 IF to_regclass('public.wm_board_ui_settings') IS NOT NULL OR
    to_regprocedure('public.wm_board_ui_read(uuid)') IS NOT NULL OR
    to_regprocedure('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NOT NULL THEN
  RAISE EXCEPTION 'Candidate objects remain after guarded rollback';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.work_board_columns WHERE column_key='col_seeded') OR
    NOT EXISTS (SELECT 1 FROM public.work_board_columns WHERE system_key='title') OR
    NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE id='40000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Rollback unexpectedly removed domain schema or items';
 END IF;
 IF NOT has_function_privilege('authenticated','public.wm_delete_board_column(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.wm_delete_board_column(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Original executable grant state not restored';
 END IF;
 RAISE NOTICE 'CP-BOARD-CONFIG01 disposable rollback PASS';
END $check$;
