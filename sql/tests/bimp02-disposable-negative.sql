-- BIMP-02 disposable-only negative data-integrity acceptance.
-- Execute after bimp02-disposable-acceptance.sql. No production writes.
\set ON_ERROR_STOP on
DO $negative$
DECLARE
  board uuid:='30000000-0000-4000-8000-000000000003';
  grp uuid:='60000000-0000-4000-8000-000000000001';
  amount uuid:='65000000-0000-4000-8000-000000000001';
  owner_id uuid:='20000000-0000-4000-8000-000000000001';
  owner_session uuid:='70000000-0000-4000-8000-000000000001';
  prior_revision timestamptz;
  request jsonb;
  response jsonb;
  n_rows integer;
  n_columns integer;
  n_events integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
  PERFORM set_config('request.jwt.claim.session_id',owner_session::text,false);
  IF NOT private.wm_board_config_session_active() THEN
    RAISE EXCEPTION 'Fixture owner session not active';
  END IF;
  SELECT updated_at INTO prior_revision FROM public.work_boards WHERE id=board;
  SELECT count(*) INTO n_rows FROM public.work_board_items WHERE board_id=board;
  SELECT count(*) INTO n_columns FROM public.work_board_columns WHERE board_id=board;
  SELECT count(*) INTO n_events FROM public.work_board_events WHERE board_id=board;
  request:=jsonb_build_object('contract','m143-v1',
    'group',jsonb_build_object('action','existing','groupId',grp),
    'matches',jsonb_build_object('behavior','add-new'),
    'mappings',jsonb_build_array(
      jsonb_build_object('source','Name','action','item'),
      jsonb_build_object('source','Amount','action','existing','columnId',amount)),
    'newColumns','[]'::jsonb,
    'rows',jsonb_build_array(
      '{"title":"BIMP02 transient valid","values":{"Amount":7}}'::jsonb,
      '{"title":"BIMP02 transient invalid","values":{"Amount":"not-a-number"}}'::jsonb));
  denied:=false;
  BEGIN
    PERFORM public.wm_import_board_wizard_atomic(board,prior_revision,request);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Malformed later row did not fail the entire transaction';
  END IF;
  IF (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>n_rows
    OR (SELECT count(*) FROM public.work_board_columns WHERE board_id=board)<>n_columns
    OR (SELECT count(*) FROM public.work_board_events WHERE board_id=board)<>n_events
    OR EXISTS(SELECT 1 FROM public.work_board_items
      WHERE board_id=board AND title LIKE 'BIMP02 transient%') THEN
    RAISE EXCEPTION 'Partial rollback did not preserve row/schema/audit integrity';
  END IF;
  IF (SELECT updated_at FROM public.work_boards WHERE id=board) IS DISTINCT FROM prior_revision THEN
    RAISE EXCEPTION 'Rejected import updated board revision';
  END IF;

  -- The previous preview cannot be submitted again after its first commit.
  request:=jsonb_set(request,'{rows}',jsonb_build_array(
    '{"title":"BIMP02 exactly once","values":{"Amount":18}}'::jsonb));
  response:=public.wm_import_board_wizard_atomic(board,prior_revision,request);
  IF response->>'created'<>'1' THEN
    RAISE EXCEPTION 'Valid import was not committed';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.wm_import_board_wizard_atomic(board,prior_revision,request);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true;
  END;
  IF NOT denied OR
    (SELECT count(*) FROM public.work_board_items WHERE board_id=board
      AND title='BIMP02 exactly once')<>1 THEN
    RAISE EXCEPTION 'Duplicate submission bypassed board revision CAS';
  END IF;
  RAISE NOTICE 'BIMP-02 rollback and same-preview replay denial PASS';
END $negative$;
