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
  OR has_function_privilege('anon','public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)','EXECUTE')
  OR has_function_privilege('anon','public.timetracker_ot_decide_manual_duration(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','private.tt_duration_ot_worker_minutes(uuid,uuid,uuid,timestamptz,timestamptz,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.timetracker_ot_submit(uuid,date,time,time,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_submit_duration(uuid,date,integer,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_decide_duration(uuid,uuid,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_decide_manual_duration(uuid,uuid,text)','EXECUTE')
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
 emp constant uuid:=current_setting('apsyntra.test_emp')::uuid;
 hr constant uuid:=current_setting('apsyntra.test_hr')::uuid;
 ojt constant uuid:=current_setting('apsyntra.test_ojt')::uuid;
 emp_session constant uuid:=current_setting('apsyntra.test_emp_session')::uuid;
 hr_session constant uuid:=current_setting('apsyntra.test_hr_session')::uuid;
 ojt_session constant uuid:=current_setting('apsyntra.test_ojt_session')::uuid;
 rec_id constant uuid:='30000000-0000-4000-8000-000000000001';
 d date; started timestamptz; threshold timestamptz; end60 timestamptz;
 start_text text; end_text text; state jsonb; completed jsonb;
 receipt jsonb; snap jsonb; row_json jsonb; request_id uuid; self_id uuid;
 legacy_id uuid; system_admin_id uuid; manual_id uuid; credit jsonb;
BEGIN
 d:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 started:=date_trunc('milliseconds',GREATEST(clock_timestamp()-INTERVAL '30 minutes',
  d::timestamp AT TIME ZONE 'Asia/Manila'));
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
  PERFORM public.timetracker_ot_submit_duration(board,d+1,45,'Invalid 45-minute OT increment');
  RAISE EXCEPTION 'Employee OT accepted a non-half-hour duration';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
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

 -- A legacy time-range request remains in storage, but approvers now receive it
 -- in the same workspace queue and the snapshot no longer returns its clock times.
 INSERT INTO public.timetracker_ot_requests(workspace_id,owner_id,ot_date,start_time,end_time,
  duration_minutes,reason,submitted_by,submission_source,ot_policy)
 VALUES(ws,emp,d,'08:00','10:00',120,'Legacy pending OT for approver visibility',
  emp,'employee','legacy-range') RETURNING id INTO legacy_id;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text)::text,true);
 snap:=public.timetracker_ot_snapshot(board);
 IF snap->>'scope'<>'AUTHORIZED_WORKSPACE_TEAM'
  OR snap->>'durationOtHrApprover'<>'true' OR snap->>'durationOtApprover'<>'true'
  OR jsonb_array_length(snap->'rows')<>2 THEN
  RAISE EXCEPTION 'HR pending review snapshot invalid: %',snap; END IF;
 SELECT value INTO row_json FROM jsonb_array_elements(snap->'rows') value
 WHERE value->>'id'=request_id::text;
 IF row_json IS NULL OR row_json->>'canReviewOt'<>'true'
  OR row_json->>'canReviewDuration'<>'true'
  OR row_json ? 'start' OR row_json ? 'end' THEN
  RAISE EXCEPTION 'HR duration request visibility/capability/time redaction failed: %',row_json; END IF;
 SELECT value INTO row_json FROM jsonb_array_elements(snap->'rows') value
 WHERE value->>'id'=legacy_id::text;
 IF row_json IS NULL OR row_json->>'canReviewOt'<>'true'
  OR row_json ? 'start' OR row_json ? 'end' THEN
  RAISE EXCEPTION 'HR legacy request visibility/capability/time redaction failed: %',row_json; END IF;
 receipt:=public.timetracker_ot_decide(board,legacy_id,'Approved');
 IF receipt->>'status'<>'Approved' OR receipt->>'decidedBy'<>hr::text THEN
  RAISE EXCEPTION 'HR legacy OT approval failed: %',receipt; END IF;

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
 SELECT value INTO row_json FROM jsonb_array_elements(snap->'rows') value
 WHERE value->>'id'=request_id::text;
 IF row_json#>>'{attendanceCredit,actualMinutes}'<>'60'
  OR row_json#>>'{attendanceCredit,payableMinutes}'<>'60'
  OR row_json->>'canReviewOt'<>'false' THEN
  RAISE EXCEPTION 'Signed HR history/payable credit mismatch: %',row_json; END IF;

 -- An HR user cannot approve their own duration request.
 receipt:=public.timetracker_ot_submit_duration(board,d+1,60,'Additional planned inspection work');
 self_id:=(receipt->>'id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_decide_duration(board,self_id,'Approved');
  RAISE EXCEPTION 'HR self-approval unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- A workspace System Admin (not only a bootstrap identity) may review duration OT.
 UPDATE public.module_role_assignments SET role='System Admin'
 WHERE user_id=hr AND module_id='time-tracker';
 IF private.tt_role_in_workspace(hr,ws) IS DISTINCT FROM 'System Admin' THEN
  RAISE EXCEPTION 'System Admin workspace role resolution failed'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',emp::text,'session_id',emp_session::text)::text,true);
 receipt:=public.timetracker_ot_submit_duration(board,d+2,90,'Additional engineering inspection work');
 system_admin_id:=(receipt->>'id')::uuid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text)::text,true);
 snap:=public.timetracker_ot_snapshot(board);
 IF snap->>'durationOtApprover'<>'true' OR snap->>'durationOtHrApprover'<>'false'
  OR snap->>'scope'<>'AUTHORIZED_WORKSPACE_TEAM' THEN
  RAISE EXCEPTION 'System Admin signed OT scope invalid: %',snap; END IF;
 SELECT value INTO row_json FROM jsonb_array_elements(snap->'rows') value
 WHERE value->>'id'=system_admin_id::text;
 IF row_json IS NULL OR row_json->>'canReviewOt'<>'true' THEN
  RAISE EXCEPTION 'System Admin cannot see/review employee pending OT: %',row_json; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.list_module_directory('time-tracker') u WHERE u.id=emp) THEN
  RAISE EXCEPTION 'System Admin directory did not return active employee'; END IF;
 receipt:=public.timetracker_ot_decide_duration(board,system_admin_id,'Approved');
 IF receipt->>'status'<>'Approved' OR receipt->>'decidedBy'<>hr::text THEN
  RAISE EXCEPTION 'System Admin duration approval failed: %',receipt; END IF;

 -- Administrative historical entry also uses hours only; database clock fields stay NULL.
 receipt:=public.timetracker_ot_submit_manual_duration(board,emp,d-1,120,
  'Historical engineering work entered by the System Admin');
 manual_id:=(receipt->>'id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_submit_manual_duration(board,emp,d-2,45,
   'Invalid historical 45-minute manual overtime increment');
  RAISE EXCEPTION 'Manual OT accepted a non-half-hour duration';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 IF receipt->>'otPolicy'<>'manual-duration-v1' OR receipt->>'durationMinutes'<>'120' THEN
  RAISE EXCEPTION 'Manual duration receipt invalid: %',receipt; END IF;
 snap:=public.timetracker_ot_snapshot(board);
 SELECT value INTO row_json FROM jsonb_array_elements(snap->'rows') value
 WHERE value->>'id'=manual_id::text;
 IF row_json IS NULL OR row_json->>'canReviewOt'<>'true'
  OR row_json ? 'start' OR row_json ? 'end' THEN
  RAISE EXCEPTION 'Manual duration request snapshot invalid: %',row_json; END IF;
 receipt:=public.timetracker_ot_decide_manual_duration(board,manual_id,'Approved');
 IF receipt->>'status'<>'Approved' OR receipt->>'otPolicy'<>'manual-duration-v1' THEN
  RAISE EXCEPTION 'System Admin manual duration approval failed: %',receipt; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.timetracker_ot_requests r
  WHERE r.id=manual_id AND r.start_time IS NULL AND r.end_time IS NULL
   AND r.duration_minutes=120 AND r.ot_policy='manual-duration-v1') THEN
  RAISE EXCEPTION 'Manual duration entry persisted invented clock times'; END IF;
 IF private.tt_duration_ot_worker_minutes(ws,emp,manual_id,started,threshold,state)<>0 THEN
  RAISE EXCEPTION 'Historical manual-duration OT incorrectly entered the attendance cutoff worker'; END IF;

 UPDATE public.module_role_assignments SET role='OJT' WHERE user_id=ojt AND module_id='time-tracker';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ojt::text,'session_id',ojt_session::text)::text,true);
 snap:=public.timetracker_ot_snapshot(board);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'rows') value WHERE value->>'id'=manual_id::text) THEN
  RAISE EXCEPTION 'Non-approver OJT user can see another employee manual OT history'; END IF;
 BEGIN
  PERFORM public.timetracker_ot_submit_duration(board,d,60,
   'OJT duration request should be rejected');
  RAISE EXCEPTION 'OJT duration OT unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: employee filing, HR/System Admin review, legacy visibility, manual duration, no self-approval, OJT isolation, scheduler allocation and payable OT';
END;
$rpc$;
ROLLBACK;

BEGIN;
DO $worker_acceptance$
DECLARE
 ws constant uuid:='10000000-0000-4000-8000-000000000001';
 board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 emp constant uuid:=current_setting('apsyntra.test_emp')::uuid;
 hr constant uuid:=current_setting('apsyntra.test_hr')::uuid;
 epoch constant uuid:='40000000-0000-4000-8000-000000000001';
 rec_id constant uuid:='40000000-0000-4000-8000-000000000002';
 case_name text; phase integer; started timestamptz; base timestamptz; extended timestamptz;
 now_at timestamptz; d date; expected timestamptz; req_id uuid; state jsonb; actual jsonb;
 out_at timestamptz; result jsonb; session_status text; current_cutoff timestamptz; req_status text;
 rev bigint; audit_count integer; source text; expected_reason text; approved_at timestamptz;
BEGIN
 -- Use relative timestamps on a fresh, rollback-only fixture. Never wait nine hours.
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable database required'; END IF;
 now_at:=date_trunc('milliseconds',clock_timestamp());
 UPDATE private.tt_auto_clockout_config SET activated_at=now_at-INTERVAL '2 days'
  WHERE config_key='default';
 -- Each scenario gets its own employee work date/record via subtransaction rollback.
 FOREACH case_name IN ARRAY ARRAY['regular','pending','rejected','withdrawn','approved-active',
  'approved-due','prefiled-manual','late','stale-epoch','historical','corrected'] LOOP
  BEGIN
   started:=now_at-CASE WHEN case_name='approved-active' THEN INTERVAL '10 hours 30 minutes'
      WHEN case_name='prefiled-manual' THEN INTERVAL '2 hours'
      ELSE INTERVAL '17 hours' END;
   base:=private.tt_auto_clockout_threshold(started);
   extended:=private.tt_duration_ot_cutoff(started,base,180);
   d:=(started AT TIME ZONE 'Asia/Manila')::date;
   source:=CASE WHEN case_name IN ('prefiled-manual','historical','corrected')
     THEN 'admin-manual-clockin' ELSE 'browser' END;
   state:=jsonb_build_object('version',1,'records',jsonb_build_array(jsonb_build_object(
    'id',rec_id::text,'ownerId','cloud:'||emp::text,
    'clockIn',jsonb_build_object('timestamp',started,'geo',jsonb_build_object('source',source)),
    'clockOut',CASE WHEN case_name='historical' THEN jsonb_build_object('timestamp',base,
       'manualMethod','standard-shift') ELSE NULL END)));
   INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by)
    VALUES(ws,'time-tracker','timetracker.attendance.v1','shared','*',state::text,1,emp);
   INSERT INTO private.tt_auto_clockout_sessions(workspace_id,board_id,record_id,employee_id,status,
      clock_in_at,threshold_at,enrollment_epoch,enrollment_clock_in_at)
    VALUES(ws,board,rec_id,emp,'MONITORING',
     CASE WHEN case_name='corrected' THEN started+INTERVAL '1 hour' ELSE started END,
     CASE WHEN case_name='corrected' THEN private.tt_auto_clockout_threshold(started+INTERVAL '1 hour') ELSE base END,
     CASE WHEN case_name='stale-epoch' THEN '40000000-0000-4000-8000-000000000003'::uuid ELSE epoch END,
     started);
   req_status:=CASE case_name WHEN 'regular' THEN NULL WHEN 'pending' THEN 'Submitted'
    WHEN 'rejected' THEN 'Rejected' WHEN 'withdrawn' THEN 'Withdrawn' WHEN 'corrected' THEN NULL ELSE 'Approved' END;
   IF req_status IS NOT NULL THEN
    approved_at:=CASE WHEN case_name='late' THEN base+INTERVAL '1 minute' ELSE started-INTERVAL '1 minute' END;
    INSERT INTO public.timetracker_ot_requests(workspace_id,owner_id,ot_date,duration_minutes,
     reason,status,submitted_at,submitted_by,submission_source,ot_policy,decided_by,decided_at,
     attendance_record_id,attendance_clock_in_at)
    VALUES(ws,emp,d,180,'Disposable scheduler test only',req_status,started-INTERVAL '2 minutes',
     emp,'employee','duration-v1',CASE WHEN req_status='Submitted' THEN NULL ELSE hr END,
     CASE WHEN req_status='Submitted' THEN NULL ELSE approved_at END,
     NULL,NULL)
    RETURNING id INTO req_id;
   END IF;
   result:=private.tt_process_auto_clockouts();
   SELECT value::jsonb,revision INTO actual,rev FROM public.module_state_entries
    WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
     AND scope='shared' AND owner_key='*';
   SELECT status,overtime_cutoff_at INTO session_status,current_cutoff
    FROM private.tt_auto_clockout_sessions WHERE board_id=board AND record_id=rec_id;
   out_at:=(actual#>>'{records,0,clockOut,timestamp}')::timestamptz;
   SELECT count(*) INTO audit_count FROM public.timetracker_attendance_mutation_audit
    WHERE workspace_id=ws AND record_id=rec_id::text;
   IF result->>'failed'<>'0' THEN
    RAISE EXCEPTION 'Real worker failed (%): % / %',case_name,result,
     (SELECT last_error FROM private.tt_auto_clockout_sessions WHERE board_id=board AND record_id=rec_id); END IF;
   IF case_name IN ('approved-active','prefiled-manual') THEN
    IF out_at IS NOT NULL OR rev<>1 OR audit_count<>0 OR current_cutoff IS DISTINCT FROM extended
     OR session_status IS DISTINCT FROM (CASE WHEN case_name='approved-active' THEN 'OVERTIME' ELSE 'MONITORING' END)
     OR (SELECT attendance_record_id FROM public.timetracker_ot_requests WHERE id=req_id) IS DISTINCT FROM rec_id
    THEN RAISE EXCEPTION 'Extended active allocation failed (%): %, %, %',case_name,result,session_status,current_cutoff; END IF;
   ELSIF case_name IN ('stale-epoch','historical') THEN
    IF actual IS DISTINCT FROM state OR rev<>1 OR audit_count<>0
    THEN RAISE EXCEPTION 'Historical/stale-epoch record was modified (%)',case_name; END IF;
   ELSE
    expected:=CASE WHEN case_name='approved-due' THEN extended ELSE base END;
    expected_reason:=CASE WHEN case_name='approved-due' THEN 'approved_overtime_ended'
     ELSE 'nine_hour_threshold_grace_expired' END;
    IF out_at IS DISTINCT FROM expected OR rev<>2 OR audit_count<>1 OR session_status<>'COMPLETED'
     OR actual#>>'{records,0,clockOut,reason}' IS DISTINCT FROM expected_reason
    THEN RAISE EXCEPTION 'Real worker completion failed (%): %, %, %',case_name,result,session_status,actual; END IF;
    -- Repeat cycle: no duplicate canonical update or audit.
    PERFORM private.tt_process_auto_clockouts();
    IF (SELECT revision FROM public.module_state_entries WHERE workspace_id=ws AND module_id='time-tracker'
       AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*')<>2
     OR (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
       WHERE workspace_id=ws AND record_id=rec_id::text)<>1
    THEN RAISE EXCEPTION 'Duplicate completion (%)',case_name; END IF;
   END IF;
   RAISE NOTICE 'PASS: production worker source / %',case_name;
   -- Roll back each scenario without deleting immutable audit records.
   RAISE EXCEPTION USING ERRCODE='PT999',MESSAGE='rollback test case';
  EXCEPTION WHEN SQLSTATE 'PT999' THEN NULL;
  END;
 END LOOP;
 UPDATE private.tt_auto_clockout_config SET activated_at='infinity' WHERE config_key='default';
 result:=private.tt_process_auto_clockouts();
 IF result->>'suspended'<>'true' THEN RAISE EXCEPTION 'Worker suspension guard failed'; END IF;
 RAISE NOTICE 'PASS: current-main worker source, canonical closure, revisions, approval gating and suspension';
END;
$worker_acceptance$;

ROLLBACK;
