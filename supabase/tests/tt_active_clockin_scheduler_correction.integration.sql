-- DISPOSABLE DATABASE ONLY. Requires the isolated scheduler migrations,
-- active-clockin correction migration and the synthetic attendance fixture.
-- Set apsyntra.test_disposable=on in the connection; cron.launch_active_jobs=off.
-- No live employee data or production execution. All changes roll back.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $test$
DECLARE
 v_workspace constant uuid:='00000000-0000-4000-8000-000000000102';
 v_board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_employee constant uuid:='00000000-0000-4000-8000-000000000101';
 v_record constant uuid:='00000000-0000-4000-8000-000000000103';
 v_delete constant uuid:='00000000-0000-4000-8000-000000000107';
 v_unenrolled constant uuid:='00000000-0000-4000-8000-000000000108';
 v_now timestamptz:=date_trunc('milliseconds',clock_timestamp());
 v_cutoff timestamptz; v_original timestamptz; v_earlier timestamptz;
 v_later timestamptz; v_due timestamptz; v_epoch uuid; v_state jsonb;
 v_template jsonb; v_prior jsonb; v_corrected jsonb; v_result jsonb;
 v_ojt jsonb; v_out jsonb; v_audits bigint; v_job record;
 v_admin constant uuid:='00000000-0000-4000-8000-000000000104';
 v_session constant uuid:='00000000-0000-4000-8000-000000000106';
 v_revision bigint; v_completed jsonb; v_expected_out timestamptz; v_edited jsonb;
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on'
 OR current_setting('cron.launch_active_jobs',true) IS DISTINCT FROM 'off'
 OR private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
 OR (SELECT count(*) FROM public.profiles)<>1
 OR NOT private.tt_auto_clockout_employee_eligible(v_workspace,v_board,v_employee)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_employee
   AND email='tt-test-employee@example.invalid')
 OR EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions)
 OR EXISTS(SELECT 1 FROM public.timetracker_ot_requests)
 THEN RAISE EXCEPTION 'Expected isolated synthetic baseline'; END IF;

 SELECT value::jsonb INTO v_state FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 IF jsonb_array_length(v_state->'records') IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'Expected exactly one synthetic attendance record';
 END IF;
 v_template:=v_state#>'{records,0}';
 IF v_template->>'id' IS DISTINCT FROM v_record::text
 OR v_template->>'ownerId' IS DISTINCT FROM 'cloud:'||v_employee::text
 OR (v_template->'clockOut' IS NOT NULL AND v_template->'clockOut'<>'null'::jsonb)
 THEN RAISE EXCEPTION 'Synthetic fixture identity mismatch'; END IF;

 -- Signed admin fixture, rolled back together with all test state.
 INSERT INTO auth.users (id,email,aud,role,email_confirmed_at,created_at,updated_at)
 VALUES(v_admin,'tt-test-admin@example.invalid','authenticated','authenticated',now(),now(),now());
 INSERT INTO public.profiles(id,email,platform_role,status)
 VALUES(v_admin,'tt-test-admin@example.invalid','employee','active')
 ON CONFLICT(id) DO UPDATE SET status='active';
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(v_workspace,v_admin,true);
 INSERT INTO public.apsyntra_workspace_module_roles(workspace_id,user_id,module_id,role,enabled)
 VALUES(v_workspace,v_admin,'time-tracker','System Admin',true);
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
 VALUES(v_session,v_admin,now(),now(),now()+interval '1 hour');
 UPDATE public.work_boards SET description='[APSYNTRA:MODULE:timetracker:v1]' WHERE id=v_board;
 v_state:=jsonb_set(v_state,'{version}','1'::jsonb);
 v_template:=jsonb_set(v_template,'{clockIn}',
  (v_template->'clockIn')||jsonb_build_object('location','Office-Base Duty',
   'department','Engineering','geo',jsonb_build_object(
   'status','captured','source','browser-geolocation','latitude',0,'longitude',0,'accuracy',10,
   'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));

 SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) INTO v_ojt FROM cron.job j
 WHERE jobname='tt-ojt-auto-clockout-9h';
 v_cutoff:=v_now-interval '1 hour';
 v_original:=v_now-interval '10 minutes';
 v_earlier:=v_now-interval '2 hours';
 v_later:=v_now-interval '5 minutes';
 -- A fixed overnight interval ending well before the current instant.
 v_due:=(date_trunc('day',v_now AT TIME ZONE 'Asia/Manila')-interval '30 hours')
  AT TIME ZONE 'Asia/Manila';

 v_prior:=jsonb_set(v_template,'{clockIn,timestamp}',
  to_jsonb(to_char(v_original AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_prior));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';

 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 PERFORM private.tt_board_projection_upsert(v_board,v_workspace,v_employee,v_prior,v_revision,'clock-in');

 -- Test-only boundary to exercise earlier/later corrections at any local hour.
 -- The real activation API still requires current Manila date and reviewed count.
 UPDATE private.tt_auto_clockout_config SET activated_at=v_cutoff WHERE config_key='default';
 FOR v_job IN SELECT jobid FROM cron.job
 WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile')
 LOOP PERFORM cron.alter_job(v_job.jobid,active:=true); END LOOP;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Synthetic scheduler activation failed';
 END IF;
 SELECT activation_epoch INTO v_epoch FROM private.tt_auto_clockout_config WHERE config_key='default';

 v_corrected:=jsonb_set(v_prior,'{clockIn,timestamp}',
  to_jsonb(to_char(v_earlier AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 BEGIN
  PERFORM private.tt_check_active_clockin_correction(
   v_workspace,v_board,jsonb_build_array(v_prior),jsonb_build_array(v_corrected));
  RAISE EXCEPTION 'Unenrolled pre-cutoff correction unexpectedly allowed';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
 END;

 v_result:=private.tt_reconcile_auto_clockout_sessions();
 IF NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE board_id=v_board AND record_id=v_record AND enrollment_epoch=v_epoch
   AND enrollment_clock_in_at=v_original AND threshold_at=private.tt_auto_clockout_threshold(v_original))
 THEN RAISE EXCEPTION 'Initial enrollment failed: %',v_result; END IF;
 PERFORM private.tt_check_active_clockin_correction(
  v_workspace,v_board,jsonb_build_array(v_prior),jsonb_build_array(v_corrected));

 -- Emulate the canonical result of a signed admin edit, without calling
 -- the mutation RPC in this scheduler-focused fixture.
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_corrected));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_result:=private.tt_process_auto_clockouts();
 IF NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE record_id=v_record AND board_id=v_board AND status='MONITORING'
   AND clock_in_at=v_earlier AND threshold_at=private.tt_auto_clockout_threshold(v_earlier)
   AND enrollment_epoch=v_epoch AND enrollment_clock_in_at=v_original
   AND grace_started_at IS NULL AND grace_deadline_at IS NULL
   AND pending_at IS NULL AND scheduled_clock_out_at IS NULL AND overtime_cutoff_at IS NULL)
 THEN RAISE EXCEPTION 'Earlier correction not reconciled before old deadline: %',v_result; END IF;

 v_corrected:=jsonb_set(v_prior,'{clockIn,timestamp}',
  to_jsonb(to_char(v_later AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_corrected));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_result:=private.tt_process_auto_clockouts();
 IF NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE record_id=v_record AND board_id=v_board AND status='MONITORING'
   AND clock_in_at=v_later AND threshold_at=private.tt_auto_clockout_threshold(v_later)
   AND enrollment_epoch=v_epoch AND enrollment_clock_in_at=v_original)
 THEN RAISE EXCEPTION 'Later correction not reconciled: %',v_result; END IF;

 v_corrected:=jsonb_set(v_prior,'{clockIn,timestamp}',
  to_jsonb(to_char(v_due AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_corrected));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_result:=private.tt_process_auto_clockouts();
 SELECT value::jsonb INTO v_state FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_out:=v_state#>'{records,0,clockOut}';
 IF v_result->>'processed' IS DISTINCT FROM '1'
 OR (v_out->>'timestamp')::timestamptz IS DISTINCT FROM v_due+interval '9 hours'
 OR v_out->>'automatic' IS DISTINCT FROM 'true'
 OR v_out#>>'{geo,status}' IS DISTINCT FROM 'not_captured'
 OR NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
   WHERE board_id=v_board AND record_id=v_record AND status='COMPLETED'
    AND threshold_at=v_due+interval '9 hours')
 THEN RAISE EXCEPTION 'Overnight corrected due session failed: %, %',v_result,v_out; END IF;
 SELECT count(*) INTO v_audits FROM public.timetracker_attendance_mutation_audit
 WHERE record_id=v_record::text AND source='automatic';
 IF v_audits<>1 OR private.tt_process_auto_clockouts()->>'processed' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'Automatic audit or idempotence failed'; END IF;

 -- Correct an actual server-generated completed record through the signed admin
 -- mutation path. The fixture uses role/claims, not a cryptographically signed JWT.
 v_completed:=v_state#>'{records,0}';
 v_expected_out:=v_due+interval '9 hours 30 minutes';
 IF NOT private.tt_is_server_clockout_evidence(v_workspace,v_completed) THEN
  RAISE EXCEPTION 'Automatic closure audit provenance not recognized';
 END IF;
 IF private.tt_is_server_clockout_evidence(v_workspace,
   jsonb_set(v_completed,'{clockOut,geo,generatedAt}',to_jsonb('2000-01-01T00:00:00Z'::text)))
 OR private.tt_is_server_clockout_evidence(v_workspace,
   jsonb_set(v_completed,'{clockOut,geo,latitude}','0'::jsonb))
 THEN RAISE EXCEPTION 'Fabricated automatic evidence accepted'; END IF;
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,
  'role','authenticated','aal','aal1','session_id',v_session::text)::text,true);
 SET LOCAL ROLE authenticated;
 v_result:=public.timetracker_attendance_admin_mutate(v_board,'edit',ARRAY[v_record::text],
  jsonb_build_object('clockOutAt',v_expected_out),'Synthetic automatic clock-out correction',v_revision);
 RESET ROLE;
 SELECT value::jsonb INTO v_state FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 v_edited:=v_state#>'{records,0}';
 IF v_result->>'mode' IS DISTINCT FROM 'COMMITTED'
 OR (v_result->>'revision')::bigint IS DISTINCT FROM v_revision+1
 OR (v_edited#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM v_expected_out
 OR v_edited#>'{clockOut,geo}' IS DISTINCT FROM v_completed#>'{clockOut,geo}'
 OR v_edited#>'{clockOut,automatic}' IS DISTINCT FROM v_completed#>'{clockOut,automatic}'
 OR v_edited#>'{clockOut,reason}' IS DISTINCT FROM v_completed#>'{clockOut,reason}'
 OR v_edited->>'ownerId' IS DISTINCT FROM v_completed->>'ownerId'
 OR NOT EXISTS(SELECT 1 FROM private.tt_attendance_board_projection
  WHERE board_id=v_board AND record_id=v_record AND source_revision=v_revision+1
   AND clock_out_at=v_expected_out AND clock_out_geo=v_out->'geo'
   AND credited_ms=34200000)
 OR NOT EXISTS(SELECT 1 FROM private.tt_attendance_admin_audit
  WHERE board_id=v_board AND record_ids=ARRAY[v_record::text]
   AND actor_id=v_admin AND action='edit'
   AND committed_revision=v_revision+1
   AND before_records->0=v_completed AND after_records->0=v_edited)
 THEN RAISE EXCEPTION 'Signed no-GPS time correction or projection/audit failed: %',v_result; END IF;
 -- Do not let the general edit path create a new no-GPS closure.
 BEGIN
  PERFORM private.tt_attendance_admin_apply_patch(v_prior,
   jsonb_build_object('clockOutAt',v_now),v_admin,v_workspace);
  RAISE EXCEPTION 'Unverified no-GPS closure unexpectedly allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 RAISE NOTICE 'PASS: signed-context automatic clock-out correction, preserved evidence, projection, audit and forged-evidence rejection';

 -- A deleted active session is cancelled promptly, even before its deadline.
 v_corrected:=v_prior||jsonb_build_object('id',v_delete::text);
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_corrected));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 PERFORM private.tt_reconcile_auto_clockout_sessions();
 UPDATE public.module_state_entries SET value=jsonb_set(v_state,'{records}','[]'::jsonb)::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 PERFORM private.tt_process_auto_clockouts();
 IF NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE record_id=v_delete AND board_id=v_board AND status='CANCELLED')
 THEN RAISE EXCEPTION 'Deleted active session not cancelled'; END IF;

 -- A different, unreviewed historical record cannot acquire enrollment.
 v_corrected:=jsonb_set(v_prior||jsonb_build_object('id',v_unenrolled::text),'{clockIn,timestamp}',
  to_jsonb(to_char(v_due AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 v_state:=jsonb_set(v_state,'{records}',jsonb_build_array(v_corrected));
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 PERFORM private.tt_reconcile_auto_clockout_sessions();
 PERFORM private.tt_process_auto_clockouts();
 IF EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions WHERE record_id=v_unenrolled)
 OR NOT EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE record_id=v_record AND status='COMPLETED')
 THEN RAISE EXCEPTION 'Historical exclusion or terminal identity failed'; END IF;

 PERFORM private.tt_suspend_isolated_auto_clockout();
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
 OR (SELECT activation_epoch FROM private.tt_auto_clockout_config WHERE config_key='default')=v_epoch
 OR v_ojt IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid)
  FROM cron.job j WHERE jobname='tt-ojt-auto-clockout-9h')
 THEN RAISE EXCEPTION 'Suspension epoch or OJT invariance failed'; END IF;
 RAISE NOTICE 'PASS: enrolled correction, cutoff guard, earlier/later threshold, overnight close, idempotence, deletion, historical exclusion, epoch and OJT invariance';
END;
$test$;
ROLLBACK;
