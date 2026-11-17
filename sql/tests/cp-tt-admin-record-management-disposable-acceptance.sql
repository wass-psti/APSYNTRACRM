-- CP-TT-FM1-ARM-01: atomic individual/bulk edit and delete acceptance.
-- Disposable PostgreSQL 17 only. All synthetic changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('app.tt_admin_test_role','System Admin',true);

DO $accept$
DECLARE
  v_board uuid:='30000000-0000-4000-8000-000000000001';
  v_workspace uuid:='10000000-0000-4000-8000-000000000001';
  v_admin uuid:='20000000-0000-4000-8000-000000000001';
  v_employee uuid:='20000000-0000-4000-8000-000000000002';
  v_a text:='50000000-0000-4000-8000-000000000001';
  v_b text:='50000000-0000-4000-8000-000000000002';
  v_c text:='50000000-0000-4000-8000-000000000003';
  v_snapshot jsonb;
  v_receipt jsonb;
  v_state jsonb;
  v_record jsonb;
  v_count integer;
BEGIN
  v_snapshot:=public.timetracker_attendance_admin_snapshot(v_board,ARRAY[v_a,v_b,v_c]);
  IF v_snapshot->>'mode'<>'ACTIVE' OR v_snapshot->>'contract'<>'tt-attendance-admin-1'
     OR v_snapshot->>'actorId'<>v_admin::text OR v_snapshot->>'workspaceId'<>v_workspace::text
     OR pg_catalog.jsonb_array_length(v_snapshot->'records')<>3
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_snapshot->'directory') d
       WHERE d->>'id'=v_employee::text) THEN
    RAISE EXCEPTION 'FAIL: signed System Admin snapshot or employee directory is incomplete';
  END IF;

  -- Individual edit: employee, both timestamps, both GPS fixes, location,
  -- department, status and manual credited working duration.
  v_receipt:=public.timetracker_attendance_admin_mutate(v_board,'edit',ARRAY[v_a],
    pg_catalog.jsonb_build_object(
      'employeeId',v_admin::text,
      'location','Local Field Works',
      'department','Engineering',
      'clockInAt','2026-11-14T01:00:00Z',
      'clockInGeo',pg_catalog.jsonb_build_object('latitude',10.4,'longitude',123.8,'accuracy',9),
      'clockOutAt','2026-11-14T10:00:00Z',
      'clockOutGeo',pg_catalog.jsonb_build_object('latitude',10.41,'longitude',123.81,'accuracy',10),
      'status','Completed','creditedMsOverride',28800000
    ),'Corrected synthetic test record',1);
  IF v_receipt->>'mode'<>'COMMITTED' OR (v_receipt->>'changedCount')::integer<>1
     OR (v_receipt->>'revision')::bigint<>2 THEN
    RAISE EXCEPTION 'FAIL: individual attendance edit receipt is invalid';
  END IF;
  SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  SELECT r.value INTO v_record FROM pg_catalog.jsonb_array_elements(v_state->'records') r(value)
  WHERE r.value->>'id'=v_a;
  IF v_record->>'ownerId'<>'cloud:'||v_admin::text
     OR v_record#>>'{clockIn,location}'<>'Local Field Works'
     OR v_record#>>'{clockIn,department}'<>'Engineering'
     OR v_record#>>'{clockIn,timestamp}'<>'2026-11-14T01:00:00+00:00'
     OR v_record#>>'{clockOut,timestamp}'<>'2026-11-14T10:00:00+00:00'
     OR v_record#>>'{clockIn,geo,source}'<>'administrative-correction'
     OR v_record#>>'{clockOut,geo,source}'<>'administrative-correction'
     OR v_record->>'creditedMsOverride'<>'28800000' THEN
    RAISE EXCEPTION 'FAIL: individual attendance correction did not persist all requested fields';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p
    WHERE p.board_id=v_board AND p.record_id=v_a::uuid AND p.employee_id=v_admin
      AND p.clock_in_at='2026-11-14T01:00:00Z'::timestamptz
      AND p.clock_out_at='2026-11-14T10:00:00Z'::timestamptz
      AND p.credited_ms=28800000)
    OR NOT EXISTS(SELECT 1 FROM public.work_board_item_values v
      JOIN public.work_board_columns c ON c.id=v.column_id
      WHERE v.item_id='60000000-0000-4000-8000-000000000001'
        AND c.name='Attendance Status' AND v.value=(SELECT pg_catalog.to_jsonb(label->>'id')
          FROM pg_catalog.jsonb_array_elements(c.config->'labels') label
          WHERE label->>'name'='Done' LIMIT 1)) THEN
    RAISE EXCEPTION 'FAIL: individual edit did not reconcile private projection and board values';
  END IF;

  -- Bulk edit changes only the supplied fields across both selected records.
  v_receipt:=public.timetracker_attendance_admin_mutate(v_board,'bulk-edit',ARRAY[v_b,v_c],
    pg_catalog.jsonb_build_object('location','Out of Town Assignment',
      'department','Finance and Accounting'),'Bulk location/department correction',2);
  IF v_receipt->>'mode'<>'COMMITTED' OR (v_receipt->>'changedCount')::integer<>2
     OR (v_receipt->>'revision')::bigint<>3 THEN
    RAISE EXCEPTION 'FAIL: bulk attendance edit receipt is invalid';
  END IF;
  SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(v_state->'records') r(value)
      WHERE r.value->>'id'=ANY(ARRAY[v_b,v_c])
        AND r.value#>>'{clockIn,location}'='Out of Town Assignment'
        AND r.value#>>'{clockOut,location}'='Out of Town Assignment'
        AND r.value#>>'{clockIn,department}'='Finance and Accounting'
        AND r.value#>>'{clockOut,department}'='Finance and Accounting')<>2 THEN
    RAISE EXCEPTION 'FAIL: bulk edit did not apply consistently to every selected record';
  END IF;
  IF (SELECT count(*) FROM private.tt_attendance_board_projection p
      WHERE p.board_id=v_board AND p.record_id=ANY(ARRAY[v_b,v_c]::uuid[])
        AND p.clock_in_location='Out of Town Assignment'
        AND p.clock_out_location='Out of Town Assignment')<>2 THEN
    RAISE EXCEPTION 'FAIL: bulk edit did not reconcile linked attendance projections';
  END IF;

  -- A stale editor cannot overwrite a newer revision.
  BEGIN
    PERFORM public.timetracker_attendance_admin_mutate(v_board,'delete',ARRAY[v_a],'{}'::jsonb,'',1);
    RAISE EXCEPTION 'FAIL: stale attendance revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  -- Existing signed System Admin gate remains the sole role check.
  PERFORM pg_catalog.set_config('app.tt_admin_test_role','Employee',true);
  BEGIN
    PERFORM public.timetracker_attendance_admin_snapshot(v_board,ARRAY[v_a]);
    RAISE EXCEPTION 'FAIL: non-System Admin read the management snapshot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.timetracker_attendance_admin_mutate(v_board,'delete',ARRAY[v_a],'{}'::jsonb,'',3);
    RAISE EXCEPTION 'FAIL: non-System Admin mutated attendance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('app.tt_admin_test_role','System Admin',true);

  -- Individual deletion removes the source record and its linked projection item.
  v_receipt:=public.timetracker_attendance_admin_mutate(v_board,'delete',ARRAY[v_a],'{}'::jsonb,'Remove test record',3);
  IF (v_receipt->>'deletedCount')::integer<>1 OR (v_receipt->>'revision')::bigint<>4 THEN
    RAISE EXCEPTION 'FAIL: individual deletion receipt is invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM private.tt_attendance_board_projection WHERE board_id=v_board AND record_id=v_a::uuid)
     OR EXISTS(SELECT 1 FROM public.work_board_items WHERE id='60000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: individual deletion left a linked board projection';
  END IF;

  -- Bulk deletion removes both selected source records and linked board items.
  v_receipt:=public.timetracker_attendance_admin_mutate(v_board,'bulk-delete',ARRAY[v_b,v_c],'{}'::jsonb,'Remove selected test records',4);
  IF (v_receipt->>'deletedCount')::integer<>2 OR (v_receipt->>'revision')::bigint<>5 THEN
    RAISE EXCEPTION 'FAIL: bulk deletion receipt is invalid';
  END IF;
  SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  IF pg_catalog.jsonb_array_length(v_state->'records')<>0
     OR EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p WHERE p.board_id=v_board
       AND p.record_id=ANY(ARRAY[v_a,v_b,v_c]::uuid[]))
     OR EXISTS(SELECT 1 FROM public.work_board_items i WHERE i.id=ANY(ARRAY[
       '60000000-0000-4000-8000-000000000001'::uuid,
       '60000000-0000-4000-8000-000000000002'::uuid,
       '60000000-0000-4000-8000-000000000003'::uuid])) THEN
    RAISE EXCEPTION 'FAIL: bulk deletion did not remove all selected source/projection rows';
  END IF;

  SELECT count(*) INTO v_count FROM private.tt_attendance_admin_audit
  WHERE workspace_id=v_workspace AND board_id=v_board AND actor_id=v_admin;
  IF v_count<>4 THEN RAISE EXCEPTION 'FAIL: administrative audit cardinality is %, expected 4',v_count; END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
      WHERE c.oid='private.tt_attendance_admin_audit'::regclass)
     OR has_table_privilege('authenticated','private.tt_attendance_admin_audit','SELECT')
     OR has_table_privilege('authenticated','private.tt_attendance_admin_audit','INSERT') THEN
    RAISE EXCEPTION 'FAIL: private administrative audit table exposure is incorrect';
  END IF;
  BEGIN
    UPDATE private.tt_attendance_admin_audit SET reason='tampered'
    WHERE audit_id=(SELECT min(audit_id) FROM private.tt_attendance_admin_audit);
    RAISE EXCEPTION 'FAIL: administrative audit update was allowed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM private.tt_attendance_admin_audit
    WHERE audit_id=(SELECT min(audit_id) FROM private.tt_attendance_admin_audit);
    RAISE EXCEPTION 'FAIL: administrative audit deletion was allowed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.module_state_entries
    WHERE workspace_id=v_workspace AND module_id='time-tracker'
      AND state_key='timetracker.attendance.v1.backup' AND scope='shared' AND owner_key='*') THEN
    RAISE EXCEPTION 'FAIL: rolling attendance recovery copy was not maintained';
  END IF;
  IF NOT has_function_privilege('authenticated',
      'public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint)','EXECUTE')
     OR has_function_privilege('anon',
      'public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: attendance management RPC execute grants are invalid';
  END IF;
END;
$accept$;

ROLLBACK;
\echo 'CP-TT-FM1-ARM-01 PASS: System Admin snapshot, individual/bulk edit, employee/time/GPS/status/duration corrections, CAS conflict, role denial, individual/bulk deletion, projections and immutable audit.'
