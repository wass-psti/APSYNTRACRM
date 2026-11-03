\set ON_ERROR_STOP on
DO $check$
BEGIN
 IF has_function_privilege('authenticated',
  'public.wm_board_bulk_mutate(uuid,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.wm_board_group_cas(uuid,uuid,timestamptz,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.wm_delete_board_group(uuid)','EXECUTE')
 OR (SELECT count(*) FROM public.work_board_items)<>4
 THEN RAISE EXCEPTION 'Fail-closed lifecycle rollback or item integrity failed'; END IF;
 RAISE NOTICE 'CP-BOARD-BULK02 fail-closed rollback PASS';
END $check$;
