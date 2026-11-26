-- CP-TT-ADMIN-MANUAL-ATTENDANCE-HYBRID
-- PostgreSQL 17 disposable integration acceptance only.
-- Requires the complete fixture/migration chain from
-- cp-tt-admin-manual-attendance-hybrid.yml. Every write is rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $acceptance$
DECLARE
 v_board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_workspace constant uuid:='10000000-0000-4000-8000-000000000001';
 v_admin constant uuid:='20000000-0000-4000-8000-000000000001';
 v_admin_session constant uuid:='22000000-0000-4000-8000-000000000002';
 v_employee_a constant uuid:='21000000-0000-4000-8000-000000000001';
 v_employee_b constant uuid:='21000000-0000-4000-8000-000000000002';
 v_employee_c constant uuid:='21000000-0000-4000-8000-000000000003';
 v_today date;
 v_hist_day date;
 v_actual_day date;
 v_later_day date;
 v_now timestamptz;
 v_day_start timestamptz;
 v_live_clock_in timestamptz;
 v_hist_clock_in timestamptz;
 v_hist_clock_out timestamptz;
 v_actual_clock_in timestamptz;
 v_actual_clock_out timestamptz;
 v_later_clock_in timestamptz;
 v_later_clock_out timestamptz;
 v_revision bigint;
 v_hist_base_revision bigint;
 v_live_receipt jsonb;
 v_hist_receipt jsonb;
 v_replay_receipt jsonb;
 v_actual_receipt jsonb;
 v_later_receipt jsonb;
 v_capability jsonb;
 v_state jsonb;
 v_live_before jsonb;
 v_live_after jsonb;
 v_hist_record jsonb;
 v_actual_record jsonb;
 v_later_record jsonb;
 v_queue_before jsonb;
 v_queue_after jsonb;
 v_ojt_before jsonb;
 v_ojt_after jsonb;
 v_live_id uuid;
 v_hist_id uuid;
 v_actual_id uuid;
 v_later_id uuid;
 v_request uuid:=pg_catalog.gen_random_uuid();
 v_duplicate_rejected boolean:=false;
 v_active_duplicate_rejected boolean:=false;
 v_unauthorized_rejected boolean:=false;
 v_future_rejected boolean:=false;
 v_today_historical_rejected boolean:=false;
 v_bad_clockout_rejected boolean:=false;
 v_suspended_active_rejected boolean:=false;
 v_expected_method text;
BEGIN
 IF pg_catalog.current_setting('server_version_num')::integer<170000 THEN
  RAISE EXCEPTION 'PostgreSQL 17 or later is required';
 END IF;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
  OR private.tt_admin_manual_clockin_ready() IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Disposable scheduler must begin suspended with active manual clock-in blocked';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='tt-ojt-auto-clockout-9h' AND active) THEN
  RAISE EXCEPTION 'Independent OJT scheduler fixture is missing';
 END IF;
 SELECT pg_catalog.to_jsonb(j) INTO v_ojt_before FROM cron.job j
 WHERE j.jobname='tt-ojt-auto-clockout-9h';

 v_now:=pg_catalog.clock_timestamp();
 v_today:=(v_now AT TIME ZONE 'Asia/Manila')::date;
 v_day_start:=v_today::timestamp AT TIME ZONE 'Asia/Manila';
 v_live_clock_in:=GREATEST(v_day_start,v_now-INTERVAL '20 minutes');

 -- Activation is operator-only and reviews zero pre-existing open sessions.
 PERFORM private.tt_activate_isolated_auto_clockout(v_today,0);
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active'
  OR private.tt_admin_manual_clockin_ready() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Regular scheduler did not enter active mode';
 END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',v_admin_session::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claims',
  pg_catalog.jsonb_build_object('sub',v_admin::text,'session_id',v_admin_session::text,
   'role','authenticated')::text,true);
 PERFORM pg_catalog.set_config('app.tt_admin_test_role','System Admin',true);

 v_capability:=public.timetracker_attendance_admin_create_capability(v_board);
 IF v_capability->>'contract' IS DISTINCT FROM 'tt-admin-attendance-capability-3'
  OR v_capability->>'activeReady' IS DISTINCT FROM 'true'
  OR v_capability->>'historicalReady' IS DISTINCT FROM 'true'
  OR v_capability->>'schedulerMode' IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Version 3 capability did not report active and historical readiness: %',v_capability;
 END IF;

 -- TODAY: create a normal employee-owned ACTIVE session using the existing
 -- signed create RPC. It must not fabricate a clock-out or GPS coordinates.
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_live_receipt:=public.timetracker_attendance_admin_create(
  v_board,v_employee_a,v_live_clock_in,'Office-Base Duty',NULL,
  'Missed clock-in; manager verified attendance',v_revision);
 IF v_live_receipt->>'mode' IS DISTINCT FROM 'COMMITTED'
  OR v_live_receipt->>'employeeId' IS DISTINCT FROM v_employee_a::text THEN
  RAISE EXCEPTION 'Current-day manual clock-in did not commit: %',v_live_receipt;
 END IF;
 v_live_id:=(v_live_receipt->>'recordId')::uuid;

 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 SELECT r INTO v_live_before FROM pg_catalog.jsonb_array_elements(v_state->'records') r
 WHERE r->>'id'=v_live_id::text;
 IF v_live_before->>'ownerId'<>'cloud:'||v_employee_a::text
  OR v_live_before->'clockOut' IS DISTINCT FROM 'null'::jsonb
  OR v_live_before#>>'{clockIn,geo,status}' IS DISTINCT FROM 'not_captured'
  OR v_live_before#>>'{clockIn,geo,source}' IS DISTINCT FROM 'admin-manual-clockin'
  OR (v_live_before#>'{clockIn,geo}') ?| ARRAY['latitude','longitude','accuracy'] THEN
  RAISE EXCEPTION 'Current-day manual clock-in did not create a clean employee-owned open session';
 END IF;

 -- The live session must be enrolled only by the existing asynchronous
 -- reconciler, with the exact standard threshold and activation epoch.
 PERFORM private.tt_reconcile_auto_clockout_sessions();
 SELECT pg_catalog.to_jsonb(q) INTO v_queue_before
 FROM private.tt_auto_clockout_sessions q
 WHERE q.workspace_id=v_workspace AND q.board_id=v_board
  AND q.record_id=v_live_id AND q.employee_id=v_employee_a;
 IF v_queue_before IS NULL
  OR v_queue_before->>'status' NOT IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
  OR (v_queue_before->>'clock_in_at')::timestamptz IS DISTINCT FROM v_live_clock_in
  OR (v_queue_before->>'threshold_at')::timestamptz
      IS DISTINCT FROM private.tt_auto_clockout_threshold(v_live_clock_in)
  OR v_queue_before->>'enrollment_epoch' IS NULL
  OR (v_queue_before->>'enrollment_clock_in_at')::timestamptz IS DISTINCT FROM v_live_clock_in THEN
  RAISE EXCEPTION 'Manual active session was not enrolled in the regular 30-second reconciler';
 END IF;

 -- A second current-day entry for the same employee/date must be rejected.
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 BEGIN
  PERFORM public.timetracker_attendance_admin_create(
   v_board,v_employee_a,v_live_clock_in+INTERVAL '1 minute','Office-Base Duty',NULL,
   'Duplicate same-day attempt',v_revision);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  v_active_duplicate_rejected:=true;
 END;
 IF NOT v_active_duplicate_rejected THEN
  RAISE EXCEPTION 'Duplicate same-day active manual clock-in was not rejected';
 END IF;

 -- THREE DAYS AGO: default hybrid mode calculates the same nine-credited-hour
 -- threshold used by the worker. The result is COMPLETED and never queued.
 v_hist_day:=v_today-3;
 v_hist_clock_in:=(v_hist_day+TIME '08:00') AT TIME ZONE 'Asia/Manila';
 v_hist_clock_out:=private.tt_auto_clockout_threshold(v_hist_clock_in);
 IF v_hist_clock_out IS DISTINCT FROM
    ((v_hist_day+TIME '18:00') AT TIME ZONE 'Asia/Manila') THEN
  RAISE EXCEPTION 'Standard historical cutoff no longer represents nine credited hours with lunch excluded: %',
   v_hist_clock_out;
 END IF;
 SELECT revision INTO v_hist_base_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_hist_receipt:=public.timetracker_attendance_admin_create_historical(
  v_board,v_employee_a,v_hist_day,v_hist_clock_in,NULL,'standard',
  'Office-Base Duty',NULL,'HR correction: employee missed clock-in',v_hist_base_revision,v_request);
 IF v_hist_receipt->>'mode' IS DISTINCT FROM 'COMMITTED'
  OR v_hist_receipt->>'clockOutMethod' IS DISTINCT FROM 'standard_nine_credited_hours' THEN
  RAISE EXCEPTION 'Standard historical correction did not commit: %',v_hist_receipt;
 END IF;
 v_hist_id:=(v_hist_receipt->>'recordId')::uuid;
 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 SELECT r INTO v_hist_record FROM pg_catalog.jsonb_array_elements(v_state->'records') r
 WHERE r->>'id'=v_hist_id::text;
 IF v_hist_record IS NULL
  OR v_hist_record->>'ownerId'<>'cloud:'||v_employee_a::text
  OR v_hist_record->'clockOut' IS NULL OR v_hist_record->'clockOut'='null'::jsonb
  OR (v_hist_record#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM v_hist_clock_out
  OR v_hist_record#>>'{clockOut,manualMethod}' IS DISTINCT FROM 'standard_nine_credited_hours'
  OR v_hist_record#>>'{clockOut,manualMethodLabel}' IS DISTINCT FROM 'System-calculated standard (9 credited hours)'
  OR v_hist_record#>>'{clockOut,reason}' IS DISTINCT FROM 'admin_manual_clock_out'
  OR v_hist_record#>>'{clockIn,geo,status}' IS DISTINCT FROM 'not_captured'
  OR v_hist_record#>>'{clockOut,geo,status}' IS DISTINCT FROM 'not_captured'
  OR (v_hist_record#>'{clockIn,geo}') ?| ARRAY['latitude','longitude','accuracy']
  OR (v_hist_record#>'{clockOut,geo}') ?| ARRAY['latitude','longitude','accuracy'] THEN
  RAISE EXCEPTION 'Historical standard record is incomplete or fabricated';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM private.tt_attendance_admin_audit a
  WHERE a.mutation_id=v_request AND a.actor_id=v_admin AND a.workspace_id=v_workspace
   AND a.board_id=v_board AND a.action='create' AND a.record_ids=ARRAY[v_hist_id::text]
   AND a.reason='HR correction: employee missed clock-in'
 ) THEN
  RAISE EXCEPTION 'Historical creation is missing its immutable actor/reason audit';
 END IF;
 IF EXISTS (SELECT 1 FROM private.tt_auto_clockout_sessions q
  WHERE q.workspace_id=v_workspace AND q.board_id=v_board AND q.record_id=v_hist_id) THEN
  RAISE EXCEPTION 'Completed historical record was enrolled in the live scheduler queue';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM private.tt_attendance_board_projection p
  WHERE p.board_id=v_board AND p.record_id=v_hist_id) THEN
  RAISE EXCEPTION 'Historical completed record was not projected to the HR attendance board';
 END IF;

 -- The historical append must leave the employee's current active Clock record
 -- byte-for-byte unchanged and must not mutate its scheduler enrollment.
 SELECT r INTO v_live_after FROM pg_catalog.jsonb_array_elements(v_state->'records') r
 WHERE r->>'id'=v_live_id::text;
 SELECT pg_catalog.to_jsonb(q) INTO v_queue_after
 FROM private.tt_auto_clockout_sessions q
 WHERE q.workspace_id=v_workspace AND q.board_id=v_board
  AND q.record_id=v_live_id AND q.employee_id=v_employee_a;
 IF v_live_after IS DISTINCT FROM v_live_before
  OR v_queue_after IS DISTINCT FROM v_queue_before THEN
  RAISE EXCEPTION 'Historical correction modified the employee current Clock or its scheduler enrollment';
 END IF;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active'
  OR private.tt_admin_manual_clockin_ready() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Historical correction changed the regular scheduler state';
 END IF;

 -- A network retry with the same request UUID is idempotent, even though the
 -- attendance revision has advanced since the original commit.
 v_replay_receipt:=public.timetracker_attendance_admin_create_historical(
  v_board,v_employee_a,v_hist_day,v_hist_clock_in,NULL,'standard',
  'Office-Base Duty',NULL,'HR correction: employee missed clock-in',v_hist_base_revision,v_request);
 IF v_replay_receipt->>'replayed' IS DISTINCT FROM 'true'
  OR v_replay_receipt->>'recordId' IS DISTINCT FROM v_hist_id::text
  OR v_replay_receipt->>'revision' IS DISTINCT FROM v_hist_receipt->>'revision' THEN
  RAISE EXCEPTION 'Historical request replay was not idempotent: %',v_replay_receipt;
 END IF;

 -- Same employee/date with a different request ID is a duplicate, not a second
 -- historical session.
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_historical(
   v_board,v_employee_a,v_hist_day,v_hist_clock_in,NULL,'standard',
   'Office-Base Duty',NULL,'Duplicate historical attempt',v_revision,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  v_duplicate_rejected:=true;
 END;
 IF NOT v_duplicate_rejected THEN
  RAISE EXCEPTION 'Duplicate historical employee/date entry was not rejected';
 END IF;

 -- TWO DAYS AGO: an authorized admin can override the standard duration with
 -- an actual short-shift clock-out. The basis is explicit in the HR record.
 v_actual_day:=v_today-2;
 v_actual_clock_in:=(v_actual_day+TIME '08:00') AT TIME ZONE 'Asia/Manila';
 v_actual_clock_out:=(v_actual_day+TIME '12:00') AT TIME ZONE 'Asia/Manila';
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_actual_receipt:=public.timetracker_attendance_admin_create_historical(
  v_board,v_employee_b,v_actual_day,v_actual_clock_in,v_actual_clock_out,'actual',
  'Office-Base Duty',NULL,'HR verified shortened shift',v_revision,pg_catalog.gen_random_uuid());
 v_actual_id:=(v_actual_receipt->>'recordId')::uuid;
 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 SELECT r INTO v_actual_record FROM pg_catalog.jsonb_array_elements(v_state->'records') r
 WHERE r->>'id'=v_actual_id::text;
 IF v_actual_receipt->>'clockOutMethod' IS DISTINCT FROM 'admin_entered_actual'
  OR (v_actual_record#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM v_actual_clock_out
  OR v_actual_record#>>'{clockOut,manualMethodLabel}' IS DISTINCT FROM 'Admin-entered actual clock-out' THEN
  RAISE EXCEPTION 'Actual historical clock-out override was not retained';
 END IF;
 IF EXISTS (SELECT 1 FROM private.tt_auto_clockout_sessions q
  WHERE q.workspace_id=v_workspace AND q.board_id=v_board AND q.record_id=v_actual_id) THEN
  RAISE EXCEPTION 'Actual completed historical record was enrolled in the live scheduler queue';
 END IF;

 -- Unauthorized employee cannot create historical attendance.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_employee_a::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '22000000-0000-4000-8000-000000000001',true);
 PERFORM pg_catalog.set_config('request.jwt.claims',
  pg_catalog.jsonb_build_object('sub',v_employee_a::text,
   'session_id','22000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
 PERFORM pg_catalog.set_config('app.tt_admin_test_role','Employee',true);
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_historical(
   v_board,v_employee_c,v_today-4,
   ((v_today-4)+TIME '08:00') AT TIME ZONE 'Asia/Manila',NULL,'standard',
   'Office-Base Duty',NULL,'Unauthorized attempt',v_revision,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN
  v_unauthorized_rejected:=true;
 END;
 IF NOT v_unauthorized_rejected THEN
  RAISE EXCEPTION 'Non-System-Admin historical create was not rejected';
 END IF;

 -- Restore System Admin identity for remaining negative cases.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',v_admin_session::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claims',
  pg_catalog.jsonb_build_object('sub',v_admin::text,'session_id',v_admin_session::text,
   'role','authenticated')::text,true);
 PERFORM pg_catalog.set_config('app.tt_admin_test_role','System Admin',true);

 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_historical(
   v_board,v_employee_c,v_today+1,
   ((v_today+1)+TIME '08:00') AT TIME ZONE 'Asia/Manila',NULL,'standard',
   'Office-Base Duty',NULL,'Future date attempt',v_revision,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN
  v_future_rejected:=true;
 END;
 IF NOT v_future_rejected THEN RAISE EXCEPTION 'Future historical date was not rejected'; END IF;

 BEGIN
  PERFORM public.timetracker_attendance_admin_create_historical(
   v_board,v_employee_c,v_today,v_live_clock_in,NULL,'standard',
   'Office-Base Duty',NULL,'Same-day historical attempt',v_revision,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN
  v_today_historical_rejected:=true;
 END;
 IF NOT v_today_historical_rejected THEN RAISE EXCEPTION 'Same-day historical completed path was not rejected'; END IF;

 BEGIN
  PERFORM public.timetracker_attendance_admin_create_historical(
   v_board,v_employee_c,v_today-4,
   ((v_today-4)+TIME '08:00') AT TIME ZONE 'Asia/Manila',
   ((v_today-4)+TIME '07:00') AT TIME ZONE 'Asia/Manila','actual',
   'Office-Base Duty',NULL,'Clock-out before clock-in attempt',v_revision,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN
  v_bad_clockout_rejected:=true;
 END;
 IF NOT v_bad_clockout_rejected THEN RAISE EXCEPTION 'Clock-out before clock-in was not rejected'; END IF;

 -- Suspending the regular scheduler must block only today's ACTIVE manual
 -- clock-in. Historical COMPLETED corrections remain safe and available.
 PERFORM private.tt_suspend_isolated_auto_clockout();
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
  OR private.tt_admin_manual_clockin_ready() IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Regular scheduler suspension did not close active readiness';
 END IF;
 v_capability:=public.timetracker_attendance_admin_create_capability(v_board);
 IF v_capability->>'activeReady' IS DISTINCT FROM 'false'
  OR v_capability->>'historicalReady' IS DISTINCT FROM 'true'
  OR v_capability->>'schedulerMode' IS DISTINCT FROM 'suspended' THEN
  RAISE EXCEPTION 'Capability did not separate live and historical readiness while suspended';
 END IF;

 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_later_day:=v_today-4;
 v_later_clock_in:=(v_later_day+TIME '08:00') AT TIME ZONE 'Asia/Manila';
 v_later_clock_out:=private.tt_auto_clockout_threshold(v_later_clock_in);
 v_later_receipt:=public.timetracker_attendance_admin_create_historical(
  v_board,v_employee_c,v_later_day,v_later_clock_in,NULL,'standard',
  'Office-Base Duty',NULL,'Historical correction while scheduler suspended',v_revision,pg_catalog.gen_random_uuid());
 v_later_id:=(v_later_receipt->>'recordId')::uuid;
 IF v_later_receipt->>'mode' IS DISTINCT FROM 'COMMITTED'
  OR v_later_receipt->>'clockOutMethod' IS DISTINCT FROM 'standard_nine_credited_hours'
  OR (v_later_receipt->>'clockOutAt')::timestamptz IS DISTINCT FROM v_later_clock_out
  OR EXISTS (SELECT 1 FROM private.tt_auto_clockout_sessions q
   WHERE q.workspace_id=v_workspace AND q.board_id=v_board AND q.record_id=v_later_id) THEN
  RAISE EXCEPTION 'Historical completed correction incorrectly depends on the live scheduler';
 END IF;

 -- A current-day active manual clock-in must fail closed while the regular
 -- scheduler is suspended. OJT's independent job must remain untouched.
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 BEGIN
  PERFORM public.timetracker_attendance_admin_create(
   v_board,v_employee_c,v_live_clock_in,'Office-Base Duty',NULL,
   'Must not create an unmonitored active session',v_revision);
 EXCEPTION WHEN SQLSTATE '55000' OR SQLSTATE '55P03' THEN
  v_suspended_active_rejected:=true;
 END;
 IF NOT v_suspended_active_rejected THEN
  RAISE EXCEPTION 'Active manual clock-in was allowed while regular scheduler suspended';
 END IF;

 SELECT pg_catalog.to_jsonb(j) INTO v_ojt_after FROM cron.job j
 WHERE j.jobname='tt-ojt-auto-clockout-9h';
 IF v_ojt_after IS DISTINCT FROM v_ojt_before OR
  v_ojt_after->>'active' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Regular scheduler activation/suspension modified the independent OJT job';
 END IF;

 RAISE NOTICE 'HYBRID MANUAL ATTENDANCE ACCEPTANCE PASSED: current active session enrolled, historical standard/actual corrections isolated, duplicate/idempotency/auth/future/overlap guards passed, scheduler gate preserved, OJT job unchanged';
END;
$acceptance$;

ROLLBACK;
