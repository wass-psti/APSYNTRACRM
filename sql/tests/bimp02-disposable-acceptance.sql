-- BIMP-02: transactional signed-claim simulation against disposable PostgreSQL 17 only.
-- Not proof of a real browser's Supabase Auth session.
\set ON_ERROR_STOP on
DO $bimp02$
DECLARE
 board uuid := '30000000-0000-4000-8000-000000000003';
 foreign_board uuid := '30000000-0000-4000-8000-000000000002';
 grp uuid := '60000000-0000-4000-8000-000000000001';
 amount uuid := '65000000-0000-4000-8000-000000000001';
 owner_id uuid := '20000000-0000-4000-8000-000000000001';
 editor_id uuid := '20000000-0000-4000-8000-000000000002';
 viewer_id uuid := '20000000-0000-4000-8000-000000000003';
 owner_session uuid := '70000000-0000-4000-8000-000000000001';
 editor_session uuid := '70000000-0000-4000-8000-000000000002';
 viewer_session uuid := '70000000-0000-4000-8000-000000000003';
 expected_at timestamptz;
 payload jsonb;
 receipt jsonb;
 item_id uuid;
 flag_col uuid;
 item_at timestamptz;
 before_count int;
 before_cols int;
 before_events int;
BEGIN
 IF has_function_privilege('anon',
 'public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb)','execute')
 OR NOT has_function_privilege('authenticated',
 'public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb)','execute')
 THEN RAISE EXCEPTION 'BIMP02 import RPC grants do not match authenticated-only contract'; END IF;

 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',owner_session::text,false);

 -- First import: manager explicitly approves a new checkbox column.
 SELECT updated_at INTO expected_at FROM public.work_boards WHERE id=board;
 payload:=jsonb_build_object(
 'contract','m143-v1','group',jsonb_build_object('action','existing','groupId',grp),
 'matches',jsonb_build_object('behavior','add-new'),
 'mappings',jsonb_build_array(
 jsonb_build_object('source','Name','action','item'),
 jsonb_build_object('source','Amount','action','existing','columnId',amount),
 jsonb_build_object('source','Flag','action','create','name','Flag','columnType','checkbox')),
 'newColumns',jsonb_build_array(
 jsonb_build_object('source','Flag','name','Flag','type','checkbox','config','{}'::jsonb)),
 'rows',jsonb_build_array(
 jsonb_build_object('title','Import Alpha','values',jsonb_build_object('Amount',20,'Flag',true)),
 jsonb_build_object('title','Import Beta','values',jsonb_build_object('Amount',30,'Flag',false))));
 receipt:=public.wm_import_board_wizard_atomic(board,expected_at,payload);
 IF receipt->>'created'<>'2' OR receipt->>'columnsCreated'<>'1'
 THEN RAISE EXCEPTION 'Import receipt mismatch for first atomic insert: %',receipt; END IF;
 SELECT id INTO flag_col FROM public.work_board_columns WHERE board_id=board AND name='Flag';
 IF flag_col IS NULL OR
 (SELECT count(*) FROM public.work_board_items WHERE board_id=board AND group_id=grp
 AND title IN ('Import Alpha','Import Beta'))<>2 OR
 (SELECT count(*) FROM public.work_board_item_values WHERE column_id=flag_col)<>2
 THEN RAISE EXCEPTION 'Read-after-write/reload persistence mismatch'; END IF;
 IF (SELECT count(*) FROM public.work_board_events WHERE board_id=board
 AND event_type='items.imported.wizard')<>1
 THEN RAISE EXCEPTION 'Atomic import audit evidence missing'; END IF;
 RAISE NOTICE 'BIMP02 manager insert, typed cells, persistence and audit PASS';

 -- No new columns: signed editor must be allowed to skip existing matches.
 PERFORM set_config('request.jwt.claim.sub',editor_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',editor_session::text,false);
 SELECT updated_at INTO expected_at FROM public.work_boards WHERE id=board;
 payload:=jsonb_build_object(
 'contract','m143-v1','group',jsonb_build_object('action','existing','groupId',grp),
 'matches',jsonb_build_object('behavior','skip','matchColumnId','item'),
 'mappings',jsonb_build_array(
 jsonb_build_object('source','Name','action','item'),
 jsonb_build_object('source','Amount','action','existing','columnId',amount)),
 'newColumns','[]'::jsonb,
 'rows',jsonb_build_array(
 jsonb_build_object('title','Import Alpha','values',jsonb_build_object('Amount',999)),
 jsonb_build_object('title','Import Gamma','values',jsonb_build_object('Amount',40))));
 receipt:=public.wm_import_board_wizard_atomic(board,expected_at,payload);
 IF receipt->>'created'<>'1' OR receipt->>'skipped'<>'1' OR
 (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>3
 THEN RAISE EXCEPTION 'Duplicate skip receipt or write failed: %',receipt; END IF;
 SELECT id,updated_at INTO item_id,item_at FROM public.work_board_items
 WHERE board_id=board AND title='Import Alpha';
 IF (SELECT value FROM public.work_board_item_values WHERE item_id=bimp02.item_id
 AND column_id=amount)<>'20'::jsonb
 THEN RAISE EXCEPTION 'Skipped match overwrote existing value'; END IF;
 RAISE NOTICE 'BIMP02 signed editor skip/preserve PASS';

 -- Update mode changes one existing item with optimistic item revision.
 SELECT updated_at INTO expected_at FROM public.work_boards WHERE id=board;
 payload:=jsonb_build_object(
 'contract','m143-v1','group',jsonb_build_object('action','existing','groupId',grp),
 'matches',jsonb_build_object('behavior','update','matchColumnId','item'),
 'mappings',jsonb_build_array(
 jsonb_build_object('source','Name','action','item'),
 jsonb_build_object('source','Amount','action','existing','columnId',amount)),
 'newColumns','[]'::jsonb,
 'rows',jsonb_build_array(jsonb_build_object('title','Import Alpha',
 'expected_item_updated_at',item_at,'values',jsonb_build_object('Amount',44))));
 receipt:=public.wm_import_board_wizard_atomic(board,expected_at,payload);
 IF receipt->>'updated'<>'1' OR (SELECT value FROM public.work_board_item_values
 WHERE item_id=bimp02.item_id AND column_id=amount)<>'44'::jsonb
 THEN RAISE EXCEPTION 'Signed update mode did not persist: %',receipt; END IF;
 RAISE NOTICE 'BIMP02 signed editor update/CAS PASS';

 -- A stale board revision is a hard deny and cannot alter items or audit.
 before_events:=(SELECT count(*) FROM public.work_board_events WHERE board_id=board);
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 stale board update was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_events WHERE board_id=board)<>before_events
 THEN RAISE EXCEPTION 'CAS-denied import emitted audit records'; END IF;

 -- Manager-only schema creation: editor must not get implicit manage rights.
 before_cols:=(SELECT count(*) FROM public.work_board_columns WHERE board_id=board);
 SELECT updated_at INTO expected_at FROM public.work_boards WHERE id=board;
 payload:=jsonb_build_object(
 'contract','m143-v1','group',jsonb_build_object('action','existing','groupId',grp),
 'matches',jsonb_build_object('behavior','add-new'),
 'mappings',jsonb_build_array(
 jsonb_build_object('source','Name','action','item'),
 jsonb_build_object('source','Secret Flag','action','create','name','Secret Flag','columnType','checkbox')),
 'newColumns',jsonb_build_array(
 jsonb_build_object('source','Secret Flag','name','Secret Flag','type','checkbox','config','{}'::jsonb)),
 'rows',jsonb_build_array(
 jsonb_build_object('title','Denied Editor Row','values',jsonb_build_object('Secret Flag',true))));
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 editor created a schema column';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_columns WHERE board_id=board)<>before_cols
 THEN RAISE EXCEPTION 'Denied schema creation changed board columns'; END IF;
 RAISE NOTICE 'BIMP02 denied editor schema creation PASS';

 -- Viewer and foreign users cannot import into the ordinary board.
 payload:=jsonb_set(payload,'{newColumns}','[]'::jsonb);
 payload:=jsonb_set(payload,'{mappings}',
 jsonb_build_array(jsonb_build_object('source','Name','action','item')));
 payload:=jsonb_set(payload,'{rows}',
 jsonb_build_array(jsonb_build_object('title','Forbidden Row','values','{}'::jsonb)));
 PERFORM set_config('request.jwt.claim.sub',viewer_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',viewer_session::text,false);
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 viewer import was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',owner_session::text,false);
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(foreign_board,
   (SELECT updated_at FROM public.work_boards WHERE id=foreign_board),payload);
  RAISE EXCEPTION 'BIMP02 foreign-workspace import was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'BIMP02 viewer and foreign workspace denial PASS';

 -- Revoked and expired sessions must deny even ROW-ONLY imports.
 before_count:=(SELECT count(*) FROM public.work_board_items WHERE board_id=board);
 PERFORM set_config('request.jwt.claim.sub',editor_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',editor_session::text,false);
 DELETE FROM auth.sessions WHERE id=editor_session;
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 REVOKED SESSION IMPORT ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO auth.sessions(id,user_id,not_after)
 VALUES(editor_session,editor_id,clock_timestamp()-interval '1 minute');
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 EXPIRED SESSION IMPORT ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>before_count
 THEN RAISE EXCEPTION 'Revoked/expired import mutated records'; END IF;
 RAISE NOTICE 'BIMP02 revoked/expired session denial PASS';

 -- No auth and anonymous roles must remain excluded.
 PERFORM set_config('request.jwt.claim.sub','',false);
 PERFORM set_config('request.jwt.claim.session_id','',false);
 BEGIN
  PERFORM public.wm_import_board_wizard_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'BIMP02 no-auth import was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>3
 OR (SELECT count(*) FROM public.work_board_events WHERE board_id=board AND
 event_type='items.imported.wizard')<>3
 THEN RAISE EXCEPTION 'Denied calls corrupted ordinary board or audit'; END IF;
 RAISE NOTICE 'BIMP-02 disposable signed-claim simulation PASS; real Supabase Auth/browser acceptance remains separate';
END $bimp02$;
