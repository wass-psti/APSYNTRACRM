-- STAGED ONLY: validate in disposable PostgreSQL before registering a migration.
-- PR #915: duration OT; no dependence on #914. Do not apply in production.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $disposable$
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Duration OT staged SQL requires a disposable database';
 END IF;
END;
$disposable$;

ALTER TABLE public.timetracker_ot_requests
 ADD COLUMN ot_policy text NOT NULL DEFAULT 'legacy-range',
 ADD COLUMN attendance_record_id uuid,
 ADD COLUMN attendance_clock_in_at timestamptz;
ALTER TABLE public.timetracker_ot_requests
 ALTER COLUMN start_time DROP NOT NULL,
 ALTER COLUMN end_time DROP NOT NULL,
 DROP CONSTRAINT tt_ot_time_same_day,
 DROP CONSTRAINT tt_ot_duration_match,
 ADD CONSTRAINT tt_ot_policy_shape CHECK (
  (ot_policy='legacy-range' AND start_time IS NOT NULL AND end_time IS NOT NULL
   AND end_time>start_time AND duration_minutes=(extract(epoch FROM end_time-start_time)/60)::integer
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
  OR (ot_policy='duration-v1' AND submission_source='employee'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND submitted_by=owner_id
   AND ((attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
    OR (attendance_record_id IS NOT NULL AND attendance_clock_in_at IS NOT NULL
     AND status='Approved' AND (attendance_clock_in_at AT TIME ZONE 'Asia/Manila')::date=ot_date))));
CREATE UNIQUE INDEX tt_ot_duration_live_day
 ON public.timetracker_ot_requests(workspace_id,owner_id,ot_date)
 WHERE ot_policy='duration-v1' AND status IN ('Submitted','Approved');
CREATE UNIQUE INDEX tt_ot_duration_record
 ON public.timetracker_ot_requests(workspace_id,attendance_record_id)
 WHERE attendance_record_id IS NOT NULL;

-- Callers must already hold the existing per-employee attendance advisory lock.
-- Count completed records as well: one unbound request cannot be allocated twice.
CREATE FUNCTION private.tt_duration_ot_matching_records(p_state jsonb,p_owner uuid,p_day date)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$
 SELECT x.elem FROM pg_catalog.jsonb_array_elements(
  CASE WHEN pg_catalog.jsonb_typeof(p_state->'records')='array'
   THEN p_state->'records' ELSE '[]'::jsonb END) x(elem)
 WHERE x.elem->>'ownerId'='cloud:'||p_owner::text
 AND CASE WHEN pg_catalog.pg_input_is_valid(x.elem#>>'{clockIn,timestamp}','timestamp with time zone')
  THEN ((x.elem#>>'{clockIn,timestamp}')::timestamptz AT TIME ZONE 'Asia/Manila')::date=p_day
  ELSE false END;
$f$;
REVOKE ALL ON FUNCTION private.tt_duration_ot_matching_records(jsonb,uuid,date)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.timetracker_ot_submit_duration(p_board_id uuid,p_date date,
 p_duration_minutes integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid; v_actor uuid:=auth.uid(); v_today date; v_id uuid;
 v_state jsonb; v_count integer; v_record jsonb; v_start timestamptz;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT private.tt_auto_clockout_employee_eligible(v_ws,p_board_id,v_actor)
    OR private.tt_role_in_workspace(v_actor,v_ws) IS NOT DISTINCT FROM 'OJT' THEN
  RAISE EXCEPTION 'Regular employee OT scope required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_actor::text,0));
 v_today:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 IF p_date IS NULL OR p_date<v_today OR p_date>v_today+7
  OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 30 AND 360
  OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Select today or next 7 days, 30–360 minutes, and a valid reason' USING ERRCODE='22023';
 END IF;
 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
 AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 IF v_state IS NULL OR pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Canonical attendance unavailable' USING ERRCODE='55000'; END IF;
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_actor,p_date);
 IF v_count>1 THEN RAISE EXCEPTION 'Ambiguous attendance' USING ERRCODE='PT409'; END IF;
 IF v_count=1 THEN
  SELECT r INTO v_record FROM private.tt_duration_ot_matching_records(v_state,v_actor,p_date) r;
  v_start:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
  IF (v_record->'clockOut' IS NOT NULL AND v_record->'clockOut'<>'null'::jsonb)
    OR pg_catalog.clock_timestamp()>=private.tt_auto_clockout_threshold(v_start) THEN
   RAISE EXCEPTION 'File OT before the regular shift ends' USING ERRCODE='PT409'; END IF;
 END IF;
 -- Preserve legacy approvals, but do not permit stacking with the new policy.
 IF EXISTS(SELECT 1 FROM public.timetracker_ot_requests r
  WHERE r.workspace_id=v_ws AND r.owner_id=v_actor AND r.ot_date=p_date
  AND r.status IN ('Submitted','Approved')) THEN
  RAISE EXCEPTION 'An active OT request already exists for this date' USING ERRCODE='23505'; END IF;
 INSERT INTO public.timetracker_ot_requests(workspace_id,owner_id,ot_date,duration_minutes,
  reason,submitted_by,submission_source,ot_policy)
 VALUES(v_ws,v_actor,p_date,p_duration_minutes,v_reason,v_actor,'employee','duration-v1')
 RETURNING id INTO v_id;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,v_id,v_actor,'submitted',pg_catalog.jsonb_build_object(
  'otPolicy','duration-v1','workDate',p_date,'durationMinutes',p_duration_minutes));
 RETURN pg_catalog.jsonb_build_object('id',v_id::text,'workspaceId',v_ws::text,
  'ownerId','cloud:'||v_actor::text,'status','Submitted','otPolicy','duration-v1',
  'durationMinutes',p_duration_minutes);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit_duration(uuid,date,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit_duration(uuid,date,integer,text) TO authenticated;

CREATE FUNCTION public.timetracker_ot_decide_duration(p_board_id uuid,p_request_id uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid; v_actor uuid:=auth.uid(); v_owner uuid;
 v_req public.timetracker_ot_requests%ROWTYPE;
 v_state jsonb; v_count integer; v_record jsonb; v_id uuid; v_start timestamptz;
 v_now timestamptz;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF private.tt_role_in_workspace(v_actor,v_ws) IS DISTINCT FROM 'HR' THEN
  RAISE EXCEPTION 'HR approval required' USING ERRCODE='42501'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('Approved','Rejected') THEN
  RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND ot_policy='duration-v1' AND status='Submitted';
 IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Request unavailable or self-approval prohibited' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_owner::text,0));
 SELECT * INTO v_req FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND owner_id=v_owner
 AND ot_policy='duration-v1' AND status='Submitted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request no longer pending' USING ERRCODE='PT409'; END IF;
 IF p_decision='Approved' THEN
  IF NOT private.tt_auto_clockout_employee_eligible(v_ws,p_board_id,v_owner)
    OR private.tt_role_in_workspace(v_owner,v_ws) IS NOT DISTINCT FROM 'OJT' THEN
   RAISE EXCEPTION 'Employee no longer eligible' USING ERRCODE='42501'; END IF;
  SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
  WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
   AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  IF v_state IS NULL OR pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Canonical attendance unavailable' USING ERRCODE='55000'; END IF;
  SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_owner,v_req.ot_date);
  IF v_count>1 THEN RAISE EXCEPTION 'Ambiguous attendance' USING ERRCODE='PT409'; END IF;
  IF v_count=1 THEN
   SELECT r INTO v_record FROM private.tt_duration_ot_matching_records(v_state,v_owner,v_req.ot_date) r;
   v_id:=(v_record->>'id')::uuid;
   v_start:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
   IF v_id IS NULL OR (v_record->'clockOut' IS NOT NULL AND v_record->'clockOut'<>'null'::jsonb)
     OR pg_catalog.clock_timestamp()>=private.tt_auto_clockout_threshold(v_start) THEN
    RAISE EXCEPTION 'Attendance closed or regular cutoff passed' USING ERRCODE='PT409'; END IF;
  ELSIF v_req.ot_date<(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date THEN
   RAISE EXCEPTION 'Unmatched historical request' USING ERRCODE='PT409';
  END IF;
 END IF;
 v_now:=pg_catalog.clock_timestamp();
 IF p_decision='Approved' AND v_start IS NOT NULL
  AND v_now>=private.tt_auto_clockout_threshold(v_start) THEN
  RAISE EXCEPTION 'Approval cutoff passed' USING ERRCODE='PT409'; END IF;
 UPDATE public.timetracker_ot_requests SET status=p_decision,decided_by=v_actor,
  decided_at=v_now,attendance_record_id=v_id,attendance_clock_in_at=v_start
 WHERE id=p_request_id;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,pg_catalog.lower(p_decision),pg_catalog.jsonb_build_object(
  'otPolicy','duration-v1','attendanceRecordId',v_id,'durationMinutes',v_req.duration_minutes));
 RETURN pg_catalog.jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status',p_decision,'decidedBy',v_actor::text,'otPolicy','duration-v1','attendanceRecordId',v_id);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_ot_decide_duration(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_decide_duration(uuid,uuid,text) TO authenticated;

-- Legacy RPC cannot approve a duration request through bootstrap or admin bypass.
DO $patch$
DECLARE d text; old text:='WHERE id=p_request_id AND workspace_id=v_ws AND status=''Submitted''';
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_decide(uuid,uuid,text)'::regprocedure);
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>4 THEN
  RAISE EXCEPTION 'Legacy OT decision baseline drift; inspect before migration'; END IF;
 EXECUTE pg_catalog.replace(d,old,old||' AND ot_policy=''legacy-range''');
END;
$patch$;

-- The worker already holds the employee advisory lock and the canonical state
-- row lock. Never enroll or modify the scheduler from an attendance write.
CREATE FUNCTION private.tt_duration_ot_worker_minutes(p_workspace uuid,p_owner uuid,
 p_record_id uuid,p_clock_in timestamptz,p_threshold timestamptz,p_state jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $f$
DECLARE v_req public.timetracker_ot_requests%ROWTYPE;
 v_day date:=(p_clock_in AT TIME ZONE 'Asia/Manila')::date; v_count integer;
BEGIN
 SELECT * INTO v_req FROM public.timetracker_ot_requests r
 WHERE r.workspace_id=p_workspace AND r.owner_id=p_owner AND r.ot_date=v_day
 AND r.ot_policy='duration-v1' AND r.status='Approved'
 AND r.decided_at<p_threshold AND r.submitted_at<=r.decided_at
 FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN 0; END IF;
 IF private.tt_role_in_workspace(p_owner,p_workspace) IS NOT DISTINCT FROM 'OJT' THEN RETURN 0; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_duration_ot_matching_records(p_state,p_owner,v_day) r
 WHERE r->>'id'=p_record_id::text AND (r#>>'{clockIn,timestamp}')::timestamptz=p_clock_in
 AND (r->'clockOut' IS NULL OR r->'clockOut'='null'::jsonb)) THEN RETURN 0; END IF;
 IF v_req.attendance_record_id IS NOT NULL THEN
  IF v_req.attendance_record_id<>p_record_id OR v_req.attendance_clock_in_at<>p_clock_in THEN
   RETURN 0; END IF;
 ELSE
  SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(p_state,p_owner,v_day);
  IF v_count<>1 THEN RETURN 0; END IF;
  UPDATE public.timetracker_ot_requests SET attendance_record_id=p_record_id,
   attendance_clock_in_at=p_clock_in WHERE id=v_req.id;
 END IF;
 RETURN v_req.duration_minutes;
END;
$f$;
REVOKE ALL ON FUNCTION private.tt_duration_ot_worker_minutes(uuid,uuid,uuid,timestamptz,timestamptz,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

-- Find the exact cutoff using the same authoritative lunch-overlap function
-- as the ordinary nine-hour threshold. OT can itself cross a noon break.
CREATE FUNCTION private.tt_duration_ot_cutoff(p_clock_in timestamptz,p_threshold timestamptz,p_minutes integer)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $f$
DECLARE lo integer:=0; hi integer:=172800000; mid integer; target bigint;
BEGIN
 IF p_minutes=0 THEN RETURN p_threshold; END IF;
 IF p_clock_in IS NULL OR NOT pg_catalog.isfinite(p_clock_in)
  OR p_minutes IS NULL OR p_minutes NOT BETWEEN 30 AND 360 THEN
  RAISE EXCEPTION 'Invalid duration cutoff inputs' USING ERRCODE='22023'; END IF;
 target:=(540+p_minutes)::bigint*60000;
 IF private.tt_attendance_credited_ms(p_clock_in,p_clock_in+hi*INTERVAL '1 millisecond')<target THEN
  RAISE EXCEPTION 'Extended credited threshold outside supported window'; END IF;
 WHILE lo<hi LOOP
  mid:=lo+(hi-lo)/2;
  IF private.tt_attendance_credited_ms(p_clock_in,p_clock_in+mid*INTERVAL '1 millisecond')>=target
  THEN hi:=mid; ELSE lo:=mid+1; END IF;
 END LOOP;
 RETURN p_clock_in+lo*INTERVAL '1 millisecond';
END;
$f$;
REVOKE ALL ON FUNCTION private.tt_duration_ot_cutoff(timestamptz,timestamptz,integer)
 FROM PUBLIC,anon,authenticated,service_role;

-- Patch only the legacy OT selection block; preserve #914-independent locks,
-- activation epoch, attendance revisions, projection, GPS and OJT isolation.
DO $worker$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('private.tt_process_auto_clockouts()'::regprocedure);
 old:=$old$      -- Approved OT must continuously cover the cutoff and be approved by
      -- that cutoff. Late approval cannot revive an expired session.
      FOR v_ot IN$old$;
 replacement:=$new$      -- Duration requests use the original Philippine clock-in date.
      v_cutoff:=private.tt_duration_ot_cutoff(v_clock_in,v_threshold,private.tt_duration_ot_worker_minutes(
        v_session.workspace_id,v_session.employee_id,v_session.record_id,v_clock_in,v_threshold,v_state));
      v_has_ot:=v_cutoff>v_threshold;
      -- Legacy time ranges retain their existing behavior only when duration OT
      -- has not been allocated. Do not stack the two models.
      IF NOT v_has_ot THEN
      FOR v_ot IN$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Worker OT baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);
 old:='AND r.ot_date=(v_threshold AT TIME ZONE ''Asia/Manila'')::date';
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Worker legacy date baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,old||' AND r.ot_policy=''legacy-range''');
 old:=$old$      END LOOP;

      v_reason:=NULL;$old$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Worker OT loop baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,$new$      END LOOP;
      END IF;

      v_reason:=NULL;$new$);
 -- Evaluate approved requests before the regular threshold to bind pre-filed
 -- OT and advertise an extended cutoff. Always prioritize already-due or
 -- corrected/missing canonical sessions; do not starve ordinary clock-outs.
 old:='AND (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at)';
 replacement:=$new$AND (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at
       OR (s.overtime_cutoff_at IS NULL AND EXISTS(
         SELECT 1 FROM public.timetracker_ot_requests r
         WHERE r.workspace_id=s.workspace_id AND r.owner_id=s.employee_id
          AND r.ot_policy='duration-v1' AND r.status='Approved'
          AND r.ot_date=(a.clock_in_at AT TIME ZONE 'Asia/Manila')::date
          AND (r.attendance_record_id IS NULL OR r.attendance_record_id=s.record_id))))$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Worker candidate baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);
 old:='ORDER BY s.last_evaluated_at NULLS FIRST,COALESCE(s.overtime_cutoff_at,s.threshold_at),s.record_id';
 replacement:=$new$ORDER BY (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at) DESC,
     s.last_evaluated_at NULLS FIRST,COALESCE(s.overtime_cutoff_at,s.threshold_at),s.record_id$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Worker candidate priority baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);
 EXECUTE d;
END;
$worker$;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts() FROM PUBLIC,anon,authenticated,service_role;
-- Extend the existing signed snapshot without widening legacy OT visibility.
-- A verified HR actor may review duration requests only in the same workspace.
DO $snapshot$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure);
 FOR old,replacement IN VALUES
 ('v_manual_admin boolean;', 'v_manual_admin boolean; v_hr boolean;'),
 ($old$v_manual_admin:=public.module_role_for('time-tracker',v_user)='System Admin';$old$,
  $new$v_manual_admin:=public.module_role_for('time-tracker',v_user)='System Admin';
 v_hr:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)='HR',false);$new$),
 ($old
COMMIT;
durationMinutes',r.duration_minutes,$old$,
  $new
COMMIT;
durationMinutes',r.duration_minutes,'otPolicy',r.ot_policy,
  'attendanceRecordId',r.attendance_record_id,
  'attendanceClockInAt',r.attendance_clock_in_at,
  'canReviewDuration',(v_hr AND r.ot_policy='duration-v1' AND r.status='Submitted'
    AND r.owner_id<>v_user AND wm.user_id IS NOT NULL),$new$),
 ($old$v_bootstrap OR r.submission_source='manual_admin'$old$,
  $new$v_bootstrap OR r.submission_source='manual_admin'
  OR (v_hr AND r.ot_policy='duration-v1' AND wm.user_id IS NOT NULL)$new$),
 ($old
COMMIT;
scope',CASE WHEN v_bootstrap THEN 'AUTHORIZED_WORKSPACE_TEAM'$old$,
  $new
COMMIT;
scope',CASE WHEN v_bootstrap OR v_hr THEN 'AUTHORIZED_WORKSPACE_TEAM'$new$),
 ($old
COMMIT;
bootstrapApprover',v_bootstrap,$old$,
  $new
COMMIT;
bootstrapApprover',v_bootstrap,'durationOtContract','tt-duration-ot-1',
  'durationOtHrApprover',v_hr,$new$)
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'OT snapshot baseline drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$snapshot$;

-- Disallow the retired employee time-range submission after activation of this
-- staged migration. Historical manual entries retain their separate RPC.
REVOKE EXECUTE ON FUNCTION public.timetracker_ot_submit(uuid,date,time,time,text)
 FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
