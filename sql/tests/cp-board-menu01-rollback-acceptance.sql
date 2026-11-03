\set ON_ERROR_STOP on
DO $accept$
BEGIN
 IF (SELECT count(*) FROM private.wm_board_protected_ids)<>2 OR
  (SELECT name FROM public.work_boards
    WHERE id='30000000-0000-4000-8000-000000000001')<>'Renamed Board'
 OR (SELECT count(*) FROM public.work_board_items
    WHERE board_id='30000000-0000-4000-8000-000000000001')<>1
 OR has_function_privilege('authenticated',
  'public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Board lifecycle recovery discarded records or left unsafe grants'; END IF;
 RAISE NOTICE 'CP-BOARD-MENU01 fail-closed, data-preserving rollback PASS';
END $accept$;
