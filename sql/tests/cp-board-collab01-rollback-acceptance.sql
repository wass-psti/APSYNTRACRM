-- CP-BOARD-COL01 fully disposable rollback verification.
\set ON_ERROR_STOP on
DO $rollback_acceptance$
DECLARE s record; f text;
BEGIN
 SELECT * INTO s FROM col01_rollback_state;
 f:=pg_get_functiondef('public.wm_add_board_member(uuid,text,text)'::regprocedure);
 IF md5(f)<>'0dde086a58def1dd5437b32264c0697a'
  OR to_regprocedure('public.wm_board_invitable_users(uuid,text)') IS NOT NULL
  OR to_regprocedure('public.wm_list_board_item_updates(uuid,integer)') IS NOT NULL
  OR to_regprocedure('public.wm_list_board_item_files(uuid,integer)') IS NOT NULL
  OR to_regprocedure('public.wm_list_board_events_page(uuid,bigint,integer)') IS NOT NULL
 THEN RAISE EXCEPTION 'COL01 rollback API restoration FAILED'; END IF;
 IF s.memberships<>(SELECT count(*) FROM public.work_board_members)
  OR s.events<>(SELECT count(*) FROM public.work_board_events)
  OR s.updates<>(SELECT count(*) FROM public.work_board_item_updates)
  OR s.files<>(SELECT count(*) FROM public.work_board_item_files)
 THEN RAISE EXCEPTION 'COL01 rollback changed membership, events, updates or files'; END IF;
 IF has_function_privilege('anon','public.wm_add_board_member(uuid,text,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.wm_add_board_member(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'COL01 rollback privilege mismatch'; END IF;
 RAISE NOTICE 'COL01 rollback function identity, grants and data integrity PASS';
END $rollback_acceptance$;