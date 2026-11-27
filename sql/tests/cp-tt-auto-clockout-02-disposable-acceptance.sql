-- CP-TT-AUTO-CLOCKOUT-02: disposable PostgreSQL 17 runtime acceptance.
-- All data in this script is synthetic. NEVER run against production.
\set ON_ERROR_STOP on
BEGIN;

-- A lunch-break plateau cannot contain a nine-hour credited-work threshold.
-- Use a transaction-local evaluation time when wall-clock CI would place the
-- grace fixture's threshold in that plateau. The worker body and every
-- threshold/attendance assertion stay intact; ROLLBACK restores its definition.
DO $fixture_clock$
DECLARE
 v_now timestamptz:=date_trunc('milliseconds',clock_timestamp());
 v_local timestamp:=v_now AT TIME ZONE 'Asia/Manila';
 v_body text;
 v_original constant text:='v_now timestamptz:=clock_timestamp();';
BEGIN
 IF v_local::time>=time '12:20' AND v_local::time<time '13:20' THEN
  v_now:=(v_local::date+time '12:19') AT TIME ZONE 'Asia/Manila';
 END IF;
 PERFORM set_config('apsyntra.test_auto_clockout_now',v_now::text,true);
 v_body:=pg_catalog.pg_get_functiondef('private.tt_process_auto_clockouts()'::regprocedure);
 IF cardinality(string_to_array(v_body,v_original))<>2 THEN
  RAISE EXCEPTION 'Disposable worker evaluation-clock injection marker changed';
 END IF;
 EXECUTE replace(v_body,v_original,
  'v_now timestamptz:=current_setting(''apsyntra.test_auto_clockout_now'')::timestamptz;');
END
$fixture_clock$;

-- Move the activation boundary back only in this disposable database so that
-- deterministic synthetic sessions can exercise the real scheduler trigger.
UPDATE private.tt_auto_clockout_config
SET activated_at=clock_timestamp()-interval '2 days'
WHERE config_key='default';

CREATE TEMP TABLE tt_auto_clockout_expected(
 employee_id uuid PRIMARY KEY,
 record_id uuid UNIQUE NOT NULL,
 clock_in_at timestamptz NOT NULL,
 threshold_at timestamptz
) ON COMMIT DROP;

DO $seed$
DECLARE
 v_now timestamptz:=current_setting('apsyntra.test_auto_clockout_now')::timestamptz;
 v_target timestamptz;
 v_clock_in timestamptz;
 v_threshold timestamptz;
 v_record_id uuid;
 v_employee_id uuid;
 v_records jsonb:='[]'::jsonb;
 v_geo jsonb;
 v_ids uuid[]:=ARRAY[
  '23000000-0000-4000-8000-000000000001'::uuid,
  '23000000-0000-4000-8000-000000000002'::uuid,
  '23000000-0000-4000-8000-000000000003'::uuid,
  '23000000-0000-4000-8000-000000000004'::uuid,
  '23000000-0000-4000-8000-000000000005'::uuid,
  '23000000-0000-4000-8000-000000000006'::uuid,
  '23000000-0000-4000-8000-000000000007'::uuid
 ];
 v_employees uuid[]:=ARRAY[
  '21000000-0000-4000-8000-000000000001'::uuid,
  '21000000-0000-4000-8000-000000000002'::uuid,
  '21000000-0000-4000-8000-000000000003'::uuid,
  '21000000-0000-4000-8000-000000000004'::uuid,
  '21000000-0000-4000-8000-000000000005'::uuid,
  '21000000-0000-4000-8000-000000000006'::uuid,
  '21000000-0000-4000-8000-000000000007'::uuid
 ];
 i integer;
BEGIN
 FOR i IN 1..7 LOOP
  v_employee_id:=v_employees[i];
  v_record_id:=v_ids[i];
  IF i IN (2,4) THEN
   v_target:=v_now-interval '20 minutes';
   v_clock_in:=v_target-interval '9 hours';
   v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
   WHILE v_threshold>v_target LOOP
    v_clock_in:=v_clock_in-(v_threshold-v_target);
    v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
   END LOOP;
   IF v_threshold<>v_target THEN
    RAISE EXCEPTION 'Could not position synthetic threshold at target %',v_target;
   END IF;
  ELSIF i IN (3,5,6) THEN
   -- Place expired thresholds at 21:xx PHT on the prior local date. This
   -- keeps same-day synthetic OT intervals valid even for midnight CI runs.
   v_target:=v_now-(
    extract(hour from (v_now at time zone 'Asia/Manila'))::integer+3
   )*interval '1 hour';
   v_clock_in:=v_target-interval '9 hours';
   v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
   WHILE v_threshold>v_target LOOP
    v_clock_in:=v_clock_in-(v_threshold-v_target);
    v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
   END LOOP;
   IF v_threshold<>v_target THEN
    RAISE EXCEPTION 'Could not position synthetic threshold at target %',v_target;
   END IF;
  ELSE
   v_clock_in:=v_now-interval '1 hour';
   IF i=1 THEN
    WHILE (private.tt_auto_clockout_threshold(v_clock_in)
      AT TIME ZONE 'Asia/Manila')::time>time '22:00' LOOP
     v_clock_in:=v_clock_in-interval '1 hour';
    END LOOP;
   END IF;
  END IF;
  v_geo:=jsonb_build_object(
   'status','captured','source','browser-geolocation',
   'latitude',10.30,'longitude',123.90,'accuracy',12,
   'capturedAt',to_char(v_clock_in at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_records:=v_records||jsonb_build_array(jsonb_build_object(
   'id',v_record_id::text,'ownerId','cloud:'||v_employee_id::text,
   'ownerName','Disposable Employee '||i,
   'clockIn',jsonb_build_object(
    'timestamp',to_char(v_clock_in at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'geo',v_geo,'location','Office-Base Duty','department','Information Technology'
   ),
   'clockOut',NULL
  ));
  INSERT INTO tt_auto_clockout_expected(employee_id,record_id,clock_in_at)
  VALUES(v_employee_id,v_record_id,v_clock_in);
 END LOOP;

 UPDATE public.module_state_entries
 SET value=jsonb_set(value::jsonb,'{records}',
   (value::jsonb->'records')||v_records,true)::text,
   revision=revision+1,
   updated_by='20000000-0000-4000-8000-000000000001',
   updated_at=clock_timestamp()
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*';
 IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic attendance state was not found'; END IF;

 INSERT INTO public.work_board_items(
  id,board_id,group_id,title,status,position,created_by,updated_by
 )
 SELECT e.record_id,'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
  '90000000-0000-4000-8000-000000000010',
  'Automatic clock-out '||substr(e.record_id::text,1,8),
  'in_progress',row_number() over(order by e.record_id)::integer,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
 FROM tt_auto_clockout_expected e;

 INSERT INTO private.tt_attendance_board_projection(
  workspace_id,board_id,record_id,board_item_id,employee_id,source_revision,
  clock_in_at,clock_out_at,clock_in_geo,clock_out_geo,
  clock_in_location,clock_out_location,credited_ms
 )
 SELECT '10000000-0000-4000-8000-000000000001',
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
  e.record_id,e.record_id,e.employee_id,2,e.clock_in_at,NULL,
  jsonb_build_object('status','captured','source','browser-geolocation',
   'latitude',10.30,'longitude',123.90,'accuracy',12),
  NULL,'Office-Base Duty',NULL,NULL
 FROM tt_auto_clockout_expected e;
END
$seed$;

-- Verify trigger registration is idempotent and does not backfill pre-activation
-- legacy sessions from the existing fixture.
DO $registration$
BEGIN
 IF (SELECT count(*) FROM private.tt_auto_clockout_sessions)<>7 THEN
  RAISE EXCEPTION 'Expected seven newly registered sessions, got %',
   (SELECT count(*) FROM private.tt_auto_clockout_sessions);
 END IF;
 IF EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
   WHERE record_id='50000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Pre-activation legacy attendance was backfilled';
 END IF;
 IF EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions
   WHERE status<>'MONITORING') THEN
  RAISE EXCEPTION 'New sessions must initialize in MONITORING';
 END IF;
END
$registration$;

-- Capture only the synthetic threshold outputs in a session-local fixture table.
-- The signed OT RPC caller does not need direct access to the private scheduler.
UPDATE tt_auto_clockout_expected e
SET threshold_at=s.threshold_at
FROM private.tt_auto_clockout_sessions s
WHERE s.record_id=e.record_id;
GRANT SELECT ON tt_auto_clockout_expected TO authenticated;

-- Seed historically approved intervals for worker boundary tests. The employee
-- approval RPC path is exercised independently below for Employee A.
DO $overtime_seed$
DECLARE
 v_threshold timestamptz;
 v_date date;
 v_start time;
 v_end time;
 v_employee uuid;
 v_record uuid;
BEGIN
 -- Employee E: the approved extension has already ended; clock-out must use
 -- the approved endpoint, not the later scheduler evaluation time.
 v_record:='23000000-0000-4000-8000-000000000005';
 SELECT threshold_at INTO v_threshold FROM private.tt_auto_clockout_sessions
 WHERE record_id=v_record;
 v_employee:='21000000-0000-4000-8000-000000000005';
 v_date:=(v_threshold at time zone 'Asia/Manila')::date;
 v_start:=(v_threshold at time zone 'Asia/Manila')::time;
 v_end:=v_start+interval '60 minutes';
 INSERT INTO public.timetracker_ot_requests(
  workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,
  status,submitted_at,decided_by,decided_at
 ) VALUES('10000000-0000-4000-8000-000000000001',v_employee,v_date,
  v_start,v_end,60,'Disposable overtime endpoint acceptance','Approved',
  v_threshold+interval '1 minute','20000000-0000-4000-8000-000000000001',
  v_threshold+interval '20 minutes');

 -- Employee F: approved interval begins one minute after grace expires and
 -- therefore must not revive or extend the already-expired attendance session.
 v_record:='23000000-0000-4000-8000-000000000006';
 SELECT threshold_at INTO v_threshold FROM private.tt_auto_clockout_sessions
 WHERE record_id=v_record;
 v_employee:='21000000-0000-4000-8000-000000000006';
 v_date:=(v_threshold at time zone 'Asia/Manila')::date;
 v_start:=(v_threshold at time zone 'Asia/Manila')::time+interval '31 minutes';
 v_end:=v_start+interval '30 minutes';
 INSERT INTO public.timetracker_ot_requests(
  workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,
  status,submitted_at,decided_by,decided_at
 ) VALUES('10000000-0000-4000-8000-000000000001',v_employee,v_date,
  v_start,v_end,30,'Disposable late overtime must not revive session','Approved',
  v_threshold+interval '10 minutes','20000000-0000-4000-8000-000000000001',
  v_threshold+interval '20 minutes');
END
$overtime_seed$;

-- Employee A submits OT through the real RPC and the synthetic bootstrap approver
-- approves it through the real decision RPC. The request covers the future cutoff.
CREATE TEMP TABLE tt_auto_clockout_ot_receipt(id uuid PRIMARY KEY) ON COMMIT DROP;
GRANT SELECT,INSERT ON tt_auto_clockout_ot_receipt TO authenticated;
SELECT set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.session_id','22000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $submit$
DECLARE
 v_threshold timestamptz;
 v_date date;
 v_start time;
 v_end time;
 v_receipt jsonb;
BEGIN
 SELECT threshold_at INTO v_threshold FROM tt_auto_clockout_expected
 WHERE record_id='23000000-0000-4000-8000-000000000001';
 v_date:=(v_threshold at time zone 'Asia/Manila')::date;
 v_start:=(v_threshold at time zone 'Asia/Manila')::time;
 v_end:=v_start+interval '60 minutes';
 v_receipt:=public.timetracker_ot_submit(
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',v_date,v_start,v_end,
  'Disposable approved overtime acceptance for automatic clock-out');
 IF v_receipt->>'status'<>'Submitted' THEN
  RAISE EXCEPTION 'OT submit receipt invalid: %',v_receipt;
 END IF;
 INSERT INTO tt_auto_clockout_ot_receipt VALUES((v_receipt->>'id')::uuid);
END
$submit$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.session_id','22000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $approve$
DECLARE v_receipt jsonb;
BEGIN
 SELECT public.timetracker_ot_decide(
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',id,'Approved'
 ) INTO v_receipt FROM tt_auto_clockout_ot_receipt;
 IF v_receipt->>'status'<>'Approved' THEN
  RAISE EXCEPTION 'OT approval receipt invalid: %',v_receipt;
 END IF;
END
$approve$;
RESET ROLE;

-- Run the same durable worker used by the 30-second pg_cron job.
SELECT private.tt_process_auto_clockouts() AS worker_result;

DO $accept$
DECLARE
 v_result jsonb;
 v_snapshot jsonb;
 v_revision bigint;
 v_revision_after bigint;
BEGIN
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000002')<>'GRACE' THEN
  RAISE EXCEPTION 'Nine-hour threshold did not enter GRACE';
 END IF;
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000003')<>'COMPLETED'
    OR (SELECT clock_out_reason FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000003')
      <>'nine_hour_threshold_grace_expired' THEN
  RAISE EXCEPTION 'Expired grace did not complete with the correct reason';
 END IF;
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000004')<>'GRACE' THEN
  RAISE EXCEPTION 'Second grace-period session did not remain in GRACE';
 END IF;
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000005')<>'COMPLETED'
    OR (SELECT clock_out_reason FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000005')
      <>'approved_overtime_ended' THEN
  RAISE EXCEPTION 'Ended approved OT did not complete at its cutoff';
 END IF;
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000006')<>'COMPLETED'
    OR (SELECT clock_out_reason FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000006')
      <>'nine_hour_threshold_grace_expired' THEN
  RAISE EXCEPTION 'OT beginning after grace incorrectly extended attendance';
 END IF;
 IF (SELECT status FROM private.tt_auto_clockout_sessions
     WHERE record_id='23000000-0000-4000-8000-000000000007')<>'MONITORING' THEN
  RAISE EXCEPTION 'Below-threshold session left MONITORING';
 END IF;

 -- The approved RPC-backed request is exposed as OVERTIME in the employee's
 -- signed snapshot and carries its authoritative cutoff.
 PERFORM set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('request.jwt.claim.session_id','22000000-0000-4000-8000-000000000001',true);
 v_snapshot:=public.timetracker_auto_clockout_snapshot(
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3');
 IF v_snapshot#>>'{session,status}'<>'OVERTIME'
    OR v_snapshot#>>'{session,overtimeCutoffAt}' IS NULL THEN
  RAISE EXCEPTION 'Approved RPC overtime not reflected in signed employee snapshot: %',v_snapshot;
 END IF;
 IF (SELECT count(*) FROM public.timetracker_ot_audit a
     JOIN tt_auto_clockout_ot_receipt r ON r.id=a.request_id
     WHERE a.event IN ('submitted','approved'))<>2 THEN
  RAISE EXCEPTION 'OT submit/approval audit lifecycle was not persisted';
 END IF;

 -- Every automatic closure updates the canonical attendance JSON, audit,
 -- private projection, Board item and typed Board values in the same transaction.
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE source='automatic' AND action='clock-out')<>3 THEN
  RAISE EXCEPTION 'Expected three automatic clock-out audit events';
 END IF;
 IF (SELECT count(*) FROM public.module_state_entries e
     CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
     WHERE e.module_id='time-tracker' AND e.state_key='timetracker.attendance.v1'
       AND r->>'id' IN (
        '23000000-0000-4000-8000-000000000003',
        '23000000-0000-4000-8000-000000000005',
        '23000000-0000-4000-8000-000000000006')
       AND r#>>'{clockOut,automatic}'='true'
       AND r#>>'{clockOut,geo,status}'='not_captured'
       AND r#>>'{clockOut,geo,source}'='server-auto-clockout')<>3 THEN
  RAISE EXCEPTION 'Automatic clock-out evidence missing from attendance state';
 END IF;
 IF (SELECT count(*) FROM private.tt_attendance_board_projection
     WHERE board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'
       AND record_id IN (
        '23000000-0000-4000-8000-000000000003',
        '23000000-0000-4000-8000-000000000005',
        '23000000-0000-4000-8000-000000000006')
       AND clock_out_at IS NOT NULL AND clock_out_geo->>'source'='server-auto-clockout')<>3 THEN
  RAISE EXCEPTION 'Private attendance projections did not synchronize';
 END IF;
 IF (SELECT count(*) FROM public.work_board_items
     WHERE id IN (
      '23000000-0000-4000-8000-000000000003',
      '23000000-0000-4000-8000-000000000005',
      '23000000-0000-4000-8000-000000000006')
       AND status='done')<>3 THEN
  RAISE EXCEPTION 'Attendance Board items were not marked done';
 END IF;
 IF (SELECT count(*) FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE v.item_id IN (
      '23000000-0000-4000-8000-000000000003',
      '23000000-0000-4000-8000-000000000005',
      '23000000-0000-4000-8000-000000000006')
       AND ((c.name='Sync State' AND v.value='"sync"'::jsonb)
         OR (c.name='Attendance Status' AND v.value='"complete"'::jsonb)))<>6 THEN
  RAISE EXCEPTION 'Typed Attendance Board values did not synchronize';
 END IF;

 -- Worker replay is idempotent: completed sessions are not written/audited twice.
 SELECT revision INTO v_revision FROM public.module_state_entries
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*';
 v_result:=private.tt_process_auto_clockouts();
 IF (v_result->>'processed')::integer<>0 OR (v_result->>'failed')::integer<>0 THEN
  RAISE EXCEPTION 'Worker replay was not idempotent: %',v_result;
 END IF;
 SELECT revision INTO v_revision_after FROM public.module_state_entries
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*';
 IF v_revision_after<>v_revision THEN
  RAISE EXCEPTION 'Idempotent worker replay unexpectedly changed attendance revision';
 END IF;
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE source='automatic')<>3 THEN
  RAISE EXCEPTION 'Worker replay duplicated automatic audit entries';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='tt-auto-clockout-processor'
    AND active AND schedule='30 seconds'
    AND command='SELECT private.tt_process_auto_clockouts();') THEN
  RAISE EXCEPTION 'Dedicated 30-second worker schedule was not installed';
 END IF;
END
$accept$;

\echo 'CP-TT-AUTO-CLOCKOUT-02 disposable PostgreSQL acceptance PASS'
ROLLBACK;
