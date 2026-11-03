-- CP-BOARD-MENU01: synthetic signed-session, CAS, lifecycle and rollback checks.
\set ON_ERROR_STOP on
DO $tests$
DECLARE
 board uuid:='30000000-0000-4000-8000-000000000001';
 app_board uuid:='30000000-0000-4000-8000-000000000003';
 qa_board uuid:='30000000-0000-4000-8000-000000000004';
 foreign_board uuid:='30000000-0000-4000-8000-000000000002';
 owner_id uuid:='20000000-0000-4000-8000-000000000001';
 editor_id uuid:='20000000-0000-4000-8000-000000000002';
 foreign_id uuid:='20000000-0000-4000-8000-000000000004';
 original_time timestamptz; updated_time timestamptz;
 receipt jsonb; item_count integer; event_count integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000001',false);

 IF (SELECT count(*) FROM private.wm_board_protected_ids)<>2 OR
  NOT private.wm_board_is_protected(app_board) OR
  NOT private.wm_board_is_protected(qa_board) OR
  private.wm_board_is_protected(board) THEN
  RAISE EXCEPTION 'Protected module/QA snapshot invalid'; END IF;
 SELECT updated_at INTO original_time FROM public.work_boards WHERE id=board;
 SELECT count(*) INTO item_count FROM public.work_board_items WHERE board_id=board;
 SELECT count(*) INTO event_count FROM public.work_board_events WHERE board_id=board;

 receipt:=public.wm_board_card_mutate(board,original_time,'edit','Renamed Board',
  'Updated note',NULL);
 IF receipt->>'action'<>'edit' OR receipt->>'status'<>'active'
  OR (SELECT name FROM public.work_boards WHERE id=board)<>'Renamed Board'
  OR (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>item_count
  OR (SELECT count(*) FROM public.work_board_events WHERE board_id=board)<>event_count+1 THEN
  RAISE EXCEPTION 'Managed edit or audit failed'; END IF;
 updated_time:=(receipt->>'updatedAt')::timestamptz;

 BEGIN
  PERFORM public.wm_board_card_mutate(board,original_time,'edit','Stale Board',
   'Stale data',NULL);
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_card_mutate(board,updated_time,'edit','Second Board',
   'Name collision',NULL);
  RAISE EXCEPTION 'Duplicate name accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;

 BEGIN
  PERFORM public.wm_board_card_mutate(board,updated_time,'trash',NULL,NULL,'Incorrect');
  RAISE EXCEPTION 'Mismatched delete confirmation accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 receipt:=public.wm_board_card_mutate(board,updated_time,'trash',NULL,NULL,'Renamed Board');
 IF receipt->>'status'<>'trashed' OR
  (SELECT status FROM public.work_boards WHERE id=board)<>'trashed' OR
  (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>item_count
 THEN RAISE EXCEPTION 'Recoverable trash changed board records'; END IF;
 SELECT updated_at INTO updated_time FROM public.work_boards WHERE id=board;
 receipt:=public.wm_board_card_mutate(board,updated_time,'restore',NULL,NULL,NULL);
 IF receipt->>'status'<>'active' OR
  (SELECT trashed_at FROM public.work_boards WHERE id=board) IS NOT NULL OR
  (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>item_count THEN
  RAISE EXCEPTION 'Restore lost board data'; END IF;

 FOR updated_time IN SELECT updated_at FROM public.work_boards WHERE id=app_board LOOP
  BEGIN
   PERFORM public.wm_board_card_mutate(app_board,updated_time,'trash',NULL,NULL,
    'TimeTracker Attendance');
   RAISE EXCEPTION 'Module board trash permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 SELECT updated_at INTO updated_time FROM public.work_boards WHERE id=qa_board;
 BEGIN
  PERFORM public.wm_board_card_mutate(qa_board,updated_time,'edit','Renamed QA','',NULL);
  RAISE EXCEPTION 'QA board edit permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_update_board(app_board,'Renamed TimeTracker','');
  RAISE EXCEPTION 'Legacy writer bypassed module protection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_set_board_status(qa_board,'trashed');
  RAISE EXCEPTION 'Legacy status setter bypassed QA protection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub',editor_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000002',false);
 SELECT updated_at INTO updated_time FROM public.work_boards WHERE id=board;
 BEGIN
  PERFORM public.wm_board_card_mutate(board,updated_time,'edit','Editor name','',NULL);
  RAISE EXCEPTION 'Editor modified board configuration';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_update_board(board,'Legacy editor bypass','');
  RAISE EXCEPTION 'Editor used legacy board update';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub',foreign_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000004',false);
 BEGIN
  PERFORM public.wm_board_card_mutate(board,updated_time,'trash',NULL,NULL,'Renamed Board');
  RAISE EXCEPTION 'Cross-workspace board mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',
  '70000000-0000-4000-8000-000000000001',false);
 UPDATE auth.sessions SET not_after=now()-interval '1 hour'
  WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_board_card_mutate(board,updated_time,'edit','Expired name','',NULL);
  RAISE EXCEPTION 'Expired signed session changed board';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
  WHERE id='70000000-0000-4000-8000-000000000001';

 IF has_function_privilege('authenticated',
   'public.wm_delete_board_permanently(uuid)','EXECUTE')
  OR has_function_privilege('anon',
   'public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)','EXECUTE')
  OR has_table_privilege('authenticated','private.wm_board_protected_ids','SELECT') THEN
  RAISE EXCEPTION 'Unsafe board grants remain'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.work_board_events WHERE board_id=board
  AND event_type='board.trashed') OR
  NOT EXISTS (SELECT 1 FROM public.work_board_events WHERE board_id=board
  AND event_type='board.restored') THEN
  RAISE EXCEPTION 'Lifecycle audit trail missing'; END IF;

 RAISE NOTICE 'CP-BOARD-MENU01 edit/CAS/soft-delete/restore/RBAC/legacy-denial PASS';
END $tests$;
