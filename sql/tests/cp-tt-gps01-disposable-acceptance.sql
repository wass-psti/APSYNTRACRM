-- CP-TT-GPS01 disposable acceptance; never execute against production.
\set ON_ERROR_STOP on
DO $accept$
DECLARE
 board uuid:='30000000-0000-4000-8000-000000000001';
 actor uuid:='20000000-0000-4000-8000-000000000001';
 employee uuid:='20000000-0000-4000-8000-000000000002';
 foreign_actor uuid:='20000000-0000-4000-8000-000000000004';
 geo_in jsonb;geo_out jsonb;r jsonb;details jsonb;
 v_id text;v_item uuid;v_link private.tt_attendance_board_projection%ROWTYPE;
 v_snapshot jsonb;v_count bigint;v_audit bigint;
BEGIN
 geo_in:=jsonb_build_object(
  'status','captured','source','browser-geolocation',
  'latitude',10.123456,'longitude',123.987654,'accuracy',12.0,
  'capturedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 geo_out:=geo_in||jsonb_build_object('latitude',10.765432,'longitude',123.654321,'accuracy',8.5);

 PERFORM set_config('request.jwt.claim.sub',actor::text,false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 r:=public.timetracker_attendance_commit_v2(
  board,'clock-in',NULL,'Office-Base Duty','HR',geo_in,NULL);
 IF r->>'mode'<>'COMMITTED' OR r->>'action'<>'clock-in' THEN
  RAISE EXCEPTION 'Initial signed clock-in did not return committed receipt'; END IF;
 v_id:=r->>'recordId';
 SELECT * INTO v_link FROM private.tt_attendance_board_projection
  WHERE board_id=board AND record_id=v_id::uuid;
 IF v_link.board_item_id IS NULL OR v_link.clock_out_geo IS NOT NULL
  OR v_link.clock_in_geo->>'latitude'<>geo_in->>'latitude'
  OR v_link.employee_id<>actor OR v_link.source_revision<>1 THEN
  RAISE EXCEPTION 'Clock-in private linkage and GPS projection mismatch'; END IF;
 v_item:=v_link.board_item_id;
 IF (SELECT count(*) FROM public.work_board_item_values v WHERE v.item_id=v_item)<5 THEN
  RAISE EXCEPTION 'Attendance summary columns not projected'; END IF;
 IF EXISTS(SELECT 1 FROM public.work_board_item_values v WHERE v.item_id=v_item
  AND (v.value::text ILIKE '%latitude%' OR v.value::text ILIKE '%longitude%'
   OR v.value::text ILIKE '%10.123456%')) THEN
  RAISE EXCEPTION 'Sensitive location leaked to broad board cell values'; END IF;
 IF (SELECT created_by FROM public.work_board_items WHERE id=v_item)<>actor THEN
  RAISE EXCEPTION 'Projected item technical owner mismatch'; END IF;

 r:=public.timetracker_attendance_commit_v2(
  board,'clock-out',v_id,'Office-Base Duty','HR',geo_out,NULL);
 IF r->>'action'<>'clock-out' OR (r->>'revision')::bigint<>2 THEN
  RAISE EXCEPTION 'Clock-out commit receipt failed'; END IF;
 SELECT * INTO v_link FROM private.tt_attendance_board_projection
  WHERE board_id=board AND record_id=v_id::uuid;
 IF v_link.board_item_id<>v_item OR v_link.source_revision<>2
  OR v_link.clock_in_geo->>'latitude'<>geo_in->>'latitude'
  OR v_link.clock_out_geo->>'latitude'<>geo_out->>'latitude'
  OR v_link.clock_out_at IS NULL OR coalesce(v_link.credited_ms,0)<=0 THEN
  RAISE EXCEPTION 'Clock-out overwrote clock-in or created mismatched GPS linkage'; END IF;
 IF (SELECT count(*) FROM private.tt_attendance_board_projection WHERE board_id=board)<>1 THEN
  RAISE EXCEPTION 'Clock-out duplicated attendance board record'; END IF;

 SELECT record INTO details FROM public.tt_test_attendance_source WHERE employee_id=actor;
 IF private.tt_board_projection_upsert(
    board,'10000000-0000-4000-8000-000000000001',actor,details,2,'clock-out')
  <>v_item THEN RAISE EXCEPTION 'Idempotent re-projection changed linked item'; END IF;
 BEGIN
  PERFORM private.tt_board_projection_upsert(
   board,'10000000-0000-4000-8000-000000000001',actor,details,1,'clock-out');
  RAISE EXCEPTION 'Stale source revision accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;

 v_snapshot:=public.timetracker_board_private_snapshot(board,50);
 IF v_snapshot->>'scope'<>'AUTHORIZED_ATTENDANCE_BOARD'
  OR jsonb_array_length(v_snapshot->'rows')<>1
  OR v_snapshot#>>'{rows,0,recordId}'<>v_id
  OR v_snapshot#>>'{rows,0,clockInGps,latitude}'<>geo_in->>'latitude'
  OR v_snapshot#>>'{rows,0,clockOutGps,latitude}'<>geo_out->>'latitude' THEN
  RAISE EXCEPTION 'Restricted board GPS response does not match authoritative projection'; END IF;

 PERFORM set_config('request.jwt.claim.sub',employee::text,false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
 BEGIN
  PERFORM public.timetracker_board_private_snapshot(board,50);
  RAISE EXCEPTION 'Non-supervisor read employee GPS coordinates';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- A projection failure rolls back the raw authoritative source and mutation audit.
 SELECT count(*) INTO v_count FROM public.work_board_items;
 SELECT count(*) INTO v_audit FROM public.timetracker_attendance_mutation_audit;
 UPDATE public.work_board_columns SET name='Attendance Reference (drift)' WHERE board_id=board AND name='Attendance Ref';
 BEGIN
  PERFORM public.timetracker_attendance_commit_v2(
   board,'clock-in',NULL,'Office-Base Duty','HR',geo_in,NULL);
  RAISE EXCEPTION 'Schema drift allowed partially committed attendance';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.tt_test_attendance_source WHERE employee_id=employee)
  OR (SELECT count(*) FROM public.work_board_items)<>v_count
  OR (SELECT count(*) FROM public.timetracker_attendance_mutation_audit)<>v_audit THEN
  RAISE EXCEPTION 'Source write or audit survived failed projection'; END IF;

 PERFORM set_config('request.jwt.claim.sub',foreign_actor::text,false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000004',false);
 BEGIN
  PERFORM public.timetracker_board_private_snapshot(board,20);
  RAISE EXCEPTION 'Foreign workspace GPS read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub',actor::text,false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 UPDATE auth.sessions SET not_after=now()-interval '1 hour'
  WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.timetracker_board_private_snapshot(board,20);
  RAISE EXCEPTION 'Expired GoTrue session retained GPS read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
  WHERE id='70000000-0000-4000-8000-000000000001';
 IF has_table_privilege('authenticated','private.tt_attendance_board_projection','SELECT') OR
  has_function_privilege('anon','public.timetracker_board_private_snapshot(uuid,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Direct location access or anonymous RPC grant detected'; END IF;
 RAISE NOTICE 'CP-TT-GPS01 atomic projection, independent fixes, privacy, replay PASS';
END $accept$;
