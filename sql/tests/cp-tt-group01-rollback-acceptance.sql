-- CP-TT-GROUP01 isolated grant-removal acceptance.
\set ON_ERROR_STOP on
DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
  'public.wm_managed_board_delete_empty_group(uuid,uuid,timestamp with time zone,text)',
  'EXECUTE')
 OR has_function_privilege('authenticated','public.wm_delete_board_group(uuid)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM public.work_board_items
  WHERE id='40000000-0000-4000-8000-000000000010')
 THEN
  RAISE EXCEPTION 'Managed group fail-closed rollback failed';
 END IF;
 RAISE NOTICE 'CP-TT-GROUP01 rollback remains fail-closed PASS';
END $verify$;
