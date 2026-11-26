-- Disposable only. Apply sql/cp-tt-duration-overtime-staged.sql in a test
-- database with the current main migrations first. Never point at production.
BEGIN;
DO $test$
DECLARE
 v_owner constant uuid:='00000000-0000-4000-8000-000000000001';
 v_other constant uuid:='00000000-0000-4000-8000-000000000002';
 v_state jsonb;
 v_count integer;
 v_start timestamptz;
 v_base timestamptz;
 v_end timestamptz;
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable database required'; END IF;
 IF has_function_privilege('anon','public.timetracker_ot_submit_duration(uuid,date,integer,text)','EXECUTE')
  OR has_function_privilege('anon','public.timetracker_ot_decide_duration(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','private.tt_duration_ot_worker_minutes(uuid,uuid,uuid,timestamptz,timestamptz,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.timetracker_ot_submit(uuid,date,time,time,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_submit_duration(uuid,date,integer,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_decide_duration(uuid,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Duration OT ACL failed'; END IF;
 -- 8 AM PHT + regular paid 9 hours + unpaid lunch + 3 paid OT hours.
 v_start:='2026-11-26T00:00:00Z';
 v_base:=private.tt_auto_clockout_threshold(v_start);
 v_end:=private.tt_duration_ot_cutoff(v_start,v_base,180);
 IF v_base IS DISTINCT FROM '2026-11-26T10:00:00Z'::timestamptz
  OR v_end IS DISTINCT FROM '2026-11-26T13:00:00Z'::timestamptz
  OR private.tt_attendance_credited_ms(v_start,v_end)<>43200000
  OR private.tt_duration_ot_cutoff(v_start,v_base,0) IS DISTINCT FROM v_base
 THEN RAISE EXCEPTION 'Regular/extended cutoff mismatch'; END IF;
 -- 2 AM PHT: regular cutoff 11 AM; OT crosses unpaid noon lunch.
 v_start:='2026-11-25T18:00:00Z';
 v_base:=private.tt_auto_clockout_threshold(v_start);
 v_end:=private.tt_duration_ot_cutoff(v_start,v_base,180);
 IF v_base IS DISTINCT FROM '2026-11-26T03:00:00Z'::timestamptz
  OR v_end IS DISTINCT FROM '2026-11-26T07:00:00Z'::timestamptz
  OR private.tt_attendance_credited_ms(v_start,v_end)<>43200000
 THEN RAISE EXCEPTION 'Additional unpaid break calculation mismatch'; END IF;
 v_state:=jsonb_build_object('records',jsonb_build_array(
  jsonb_build_object('id','one','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-25T18:00:00Z'),'clockOut',NULL),
  jsonb_build_object('id','two','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-26T02:00:00Z'),
    'clockOut',jsonb_build_object('timestamp','2026-11-26T03:00:00Z')),
  jsonb_build_object('id','three','ownerId','cloud:'||v_other::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-25T18:00:00Z'),'clockOut',NULL),
  jsonb_build_object('id','four','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-27T02:00:00Z'),'clockOut',NULL)));
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_owner,'2026-11-26');
 IF v_count<>2 THEN RAISE EXCEPTION 'PHT owner/date matching or ambiguity detection failed'; END IF;
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_other,'2026-11-26');
 IF v_count<>1 THEN RAISE EXCEPTION 'Employee isolation failed'; END IF;
 RAISE NOTICE 'PASS: exact credited cutoffs, PHT date matching, ambiguity counting and RPC grants';
END;
$test$;

DO $rpc$
DECLARE
 ws constant uuid:='10000000-0000-4000-8000-000000000001';
 board constant uuid:='10000000-0000-4000-8000-000000000021';
 emp constant uuid:='10000000-0000-4000-8000-000000000011';
 hr constant uuid:='10000000-0000-4000-8000-000000000012';
 ojt constant uuid:='20000000-0000-4000-8000-000000000015';
 emp_session constant uuid:='10000000-0000-4000-8000-000000000031';
 hr_session constant uuid:='10000000-0000-4000-8000-000000000032';
 ojt_session constant uuid:='20000000-0000-4000-8000-000000000035';
 rec_id constant uuid:='30000000-0000-4000-8000-000000000001';
 d date; started timestamptz; threshold timestamptz; end60 timestamptz;
 start_text text; end_text text; state jsonb; completed jsonb;
 receipt jsonb; snap jsonb; request_id uuid; self_id uuid; credit jsonb;
BEGIN
 d:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 started:=GREATEST(clock_timestamp()-INTERVAL '30 minutes',
  (d::timestamp+TIME '00:00:01') AT TIME ZONE 'Asia/Manila');
 threshold:=private.tt_auto_clockout_threshold(started);
 IF clock_timestamp()>=threshold THEN RAISE EXCEPTION 'Open fixture is already past cutoff'; END IF;
 start_text:=pg_catalog.to_char(started AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 state:=jsonb_build_object('records',jsonb_build_array(jsonb_build_object(
  'id',rec_id::text,'ownerId','cloud:'||emp::text,
  'clockIn',jsonb_build_object('timestamp',start_text),'clockOut',NULL)));
 INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by)
 VALUES(ws,'time-tracker','timetracker.attendance.v1','shared','*',state::text,1,emp);

 UPDATE public.module_role_assignments SET role='Employee' WHERE user_id=emp AND module_id='time-tracker';
 UPDATE public.module_role_assignments SET role='HR' WHERE user_id=hr AND module_id='time-tracker';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',emp::text,'session_id',emp_session::text)::text,true);
 receipt:=public.timetracker_ot_submit_duration(board,d,180,'Additional planned inspection work');
 IF receipt->>'status'<>'Submitted' OR receipt->>'otPolicy'<>'duration-v1'
  OR receipt->>'ownerId'<>'cloud:'||emp::text OR (receipt->>'durationMinutes')::int<>180
 THEN RAISE EXCEPTION 'Signed duration submission receipt invalid: %',receipt; END IF;
 request_id:=(receipt->>'id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_submit_duration(board,d,60,'Duplicate planned inspection work');
  RAISE EXCEPTION 'Duplicate active request unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_decide_duration(board,request_id,'Approved');
  RAISE EXCEPTION 'Employee self-review unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text)::text,true);
 snap:=public.timetracker_ot_snapshot(board);
 IF snap->>'scope'<>'AUTHORIZED_WORKSPACE_TEAM' OR snap->>'durationOtHrApprover'<>'true'
  OR jsonb_array_length(snap->'rows')<>1 OR snap#>>'{rows,0,canReviewDuration}'<>'true'
 THEN RAISE EXCEPTION 'HR pending review snapshot invalid: %',snap; END IF;
 receipt:=public.timetracker_ot_decide_duration(board,request_id,'Approved');
 IF receipt->>'status'<>'Approved' OR receipt->>'attendanceRecordId'<>rec_id::text
 THEN RAISE EXCEPTION 'HR approval failed to bind attendance: %',receipt; END IF;

 IF private.tt_duration_ot_worker_minutes(ws,emp,rec_id,started,threshold,state)<>180
  OR private.tt_duration_ot_worker_minutes(ws,emp,'30000000-0000-4000-8000-000000000002',started,threshold,state)<>0
 THEN RAISE EXCEPTION 'Worker allocation or exact-record isolation failed'; END IF;

 end60:=private.tt_duration_ot_cutoff(started,threshold,60);
 end_text:=pg_catalog.to_char(end60 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 completed:=jsonb_set(state,'{records,0,clockOut}',jsonb_build_object('timestamp',end_text),true);
 credit:=private.tt_duration_ot_completed_credit(completed,emp,d,rec_id,started,180,
  (SELECT decided_at FROM public.timetracker_ot_requests WHERE id=request_id));
 IF credit->>'actualMinutes'<>'60' OR credit->>'payableMinutes'<>'60'
 THEN RAISE EXCEPTION 'Payable OT must be capped to actual completed work: %',credit; END IF;
 UPDATE public.module_state_entries SET value=completed::text
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*';
 snap:=public.timetracker_ot_snapshot(board);
 IF snap#>>'{rows,0,attendanceCredit,actualMinutes}'<>'60'
  OR snap#>>'{rows,0,attendanceCredit,payableMinutes}'<>'60'
  OR snap#>>'{rows,0,canReviewDuration}'<>'false'
 THEN RAISE EXCEPTION 'Signed HR history/payable credit mismatch: %',snap; END IF;

 receipt:=public.timetracker_ot_submit_duration(board,d+1,60,'Additional planned inspection work');
 self_id:=(receipt->>'id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_decide_duration(board,self_id,'Approved');
  RAISE EXCEPTION 'HR self-approval unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 UPDATE public.module_role_assignments SET role='OJT' WHERE user_id=ojt AND module_id='time-tracker';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ojt::text,'session_id',ojt_session::text)::text,true);
 BEGIN
  PERFORM public.timetracker_ot_submit_duration('20000000-0000-4000-8000-000000000022',d,60,
   'OJT duration request should be rejected');
  RAISE EXCEPTION 'OJT duration OT unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: signed filing, HR review, no self-approval, OJT isolation, scheduler allocation and payable OT';
END;
$rpc$;

ROLLBACK;
