-- Runs only after the BIMP02 disposable setup and signed sessions are installed.
\set ON_ERROR_STOP on
DO $cp_bimp14$
DECLARE
 board uuid := '30000000-0000-4000-8000-000000000003';
 foreign_board uuid := '30000000-0000-4000-8000-000000000002';
 grp uuid := '60000000-0000-4000-8000-000000000001';
 owner_id uuid := '20000000-0000-4000-8000-000000000001';
 owner_session uuid := '70000000-0000-4000-8000-000000000001';
 editor_id uuid := '20000000-0000-4000-8000-000000000002';
 editor_session uuid := '70000000-0000-4000-8000-000000000002';
 viewer_id uuid := '20000000-0000-4000-8000-000000000003';
 viewer_session uuid := '70000000-0000-4000-8000-000000000003';
 ref_col uuid := '65000000-0000-4000-8000-000000000002';
 expected_at timestamptz;
 payload jsonb;
 receipt jsonb;
 big_ref text := 'https://example.invalid/reference/' || repeat('Z',7200);
 imported_item_id uuid;
 got jsonb;
BEGIN
 IF has_table_privilege('authenticated',
    'public.work_board_import_extended_refs','select') OR
    has_table_privilege('anon','public.work_board_import_extended_refs','select') THEN
   RAISE EXCEPTION 'Extended references must not grant direct table reads';
 END IF;
 IF has_function_privilege('anon',
  'public.wm_import_board_wizard_extended_atomic(uuid,timestamptz,jsonb)','execute')
 OR NOT has_function_privilege('authenticated',
  'public.wm_import_board_wizard_extended_atomic(uuid,timestamptz,jsonb)','execute') THEN
  RAISE EXCEPTION 'Extended import RPC grants are not scoped to authenticated';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',owner_session::text,false);
 SELECT updated_at INTO expected_at FROM public.work_boards WHERE id=board;
 payload:=jsonb_build_object(
  'contract','m143-v2','group',jsonb_build_object('action','existing','groupId',grp),
  'matches',jsonb_build_object('behavior','add-new'),
  'mappings',jsonb_build_array(
   jsonb_build_object('source','Name','action','item'),
   jsonb_build_object('source','Legacy Ref','action','existing','columnId',ref_col)),
  'newColumns','[]'::jsonb,
  'rows',jsonb_build_array(jsonb_build_object('title','Extended reference QA',
   'values',jsonb_build_object('Legacy Ref',
    jsonb_build_object('__aps_extended_ref_v1',big_ref)))));
 receipt:=public.wm_import_board_wizard_extended_atomic(board,expected_at,payload);
 IF receipt->>'created'<>'1' THEN RAISE EXCEPTION 'Extended reference import receipt mismatch: %',receipt; END IF;
 SELECT i.id INTO imported_item_id FROM public.work_board_items i
  WHERE i.board_id=board AND i.title='Extended reference QA';
 IF imported_item_id IS NULL OR
    (SELECT r.content FROM public.work_board_import_extended_refs r
       WHERE r.item_id=imported_item_id AND r.column_id=ref_col) IS DISTINCT FROM big_ref THEN
  RAISE EXCEPTION 'Extended reference content did not persist exactly';
 END IF;
 got:=public.wm_import_extended_refs_read(board);
 IF jsonb_array_length(got)<>1 OR
    got->0->>'value' IS DISTINCT FROM big_ref THEN
  RAISE EXCEPTION 'Signed extended reference readback lost content';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',viewer_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',viewer_session::text,false);
 BEGIN
  PERFORM public.wm_import_extended_refs_read(foreign_board);
  RAISE EXCEPTION 'UNEXPECTED: foreign read was authorized';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.wm_import_board_wizard_extended_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'UNEXPECTED: viewer import succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- A previously revoked/expired signed session cannot invoke m143-v2.
 PERFORM set_config('request.jwt.claim.sub',editor_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',editor_session::text,false);
 BEGIN
  PERFORM public.wm_import_board_wizard_extended_atomic(board,expected_at,payload);
  RAISE EXCEPTION 'UNEXPECTED: revoked extended import succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- A subsequent ordinary edit supersedes the auxiliary reference exactly.
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',owner_session::text,false);
 PERFORM public.wm_set_board_cell(imported_item_id,ref_col,to_jsonb('short replacement'::text));
 IF EXISTS (SELECT 1 FROM public.work_board_import_extended_refs r
   WHERE r.item_id=imported_item_id AND r.column_id=ref_col) OR
   (SELECT v.value#>>'{}' FROM public.work_board_item_values v
    WHERE v.item_id=imported_item_id AND v.column_id=ref_col)
     IS DISTINCT FROM 'short replacement' THEN
  RAISE EXCEPTION 'Normal cell edit failed to retire superseded extended content';
 END IF;
 RAISE NOTICE 'CP-BIMP-14 7200+ character persistence, signed read/denial, and subsequent edit cleanup PASS';
END $cp_bimp14$;
