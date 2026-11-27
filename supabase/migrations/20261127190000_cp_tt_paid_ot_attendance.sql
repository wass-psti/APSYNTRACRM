-- CP-TT-PAID-OT-01: signed OT decisions define the credited attendance cutoff.
-- No clock-in, OJT enrollment, GPS acquisition, or cron schedule changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE TABLE private.tt_paid_ot_days (
 workspace_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 work_date date NOT NULL,
 approved_minutes integer NOT NULL CHECK(approved_minutes=0 OR approved_minutes BETWEEN 30 AND 360),
 attendance_record_id uuid,
 attendance_clock_in_at timestamptz,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(workspace_id,employee_id,work_date),
 CHECK((attendance_record_id IS NULL)=(attendance_clock_in_at IS NULL))
);
ALTER TABLE private.tt_paid_ot_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_paid_ot_days FROM PUBLIC,anon,authenticated,service_role;

-- NULL means this day has not been processed under the new policy; zero means
-- explicitly revoked. A revoked day must never fall back to a legacy OT range.
CREATE FUNCTION private.tt_paid_ot_worker_minutes(p_workspace uuid,p_owner uuid,
 p_record uuid,p_start timestamptz,p_state jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SET search_path=''
AS $f$
DECLARE d private.tt_paid_ot_days%ROWTYPE; v_count integer;
BEGIN
 SELECT * INTO d FROM private.tt_paid_ot_days
 WHERE workspace_id=p_workspace AND employee_id=p_owner
  AND work_date=(p_start AT TIME ZONE 'Asia/Manila')::date FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF private.tt_role_in_workspace(p_owner,p_workspace) IS NOT DISTINCT FROM 'OJT' THEN RETURN 0; END IF;
 IF d.approved_minutes=0 THEN RETURN 0; END IF;
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(p_state,p_owner,d.work_date);
 IF v_count<>1 OR NOT EXISTS(
  SELECT 1 FROM private.tt_duration_ot_matching_records(p_state,p_owner,d.work_date) r
  WHERE r->>'id'=p_record::text AND (r#>>'{clockIn,timestamp}')::timestamptz=p_start
   AND (r->'clockOut' IS NULL OR r->'clockOut'='null'::jsonb)
 ) THEN RETURN 0; END IF;
 IF d.attendance_record_id IS NOT NULL AND
  (d.attendance_record_id<>p_record OR d.attendance_clock_in_at<>p_start) THEN RETURN 0; END IF;
 IF d.attendance_record_id IS NULL THEN
  UPDATE private.tt_paid_ot_days SET attendance_record_id=p_record,attendance_clock_in_at=p_start
   WHERE workspace_id=p_workspace AND employee_id=p_owner AND work_date=d.work_date;
 END IF;
 -- Bind the existing duration association for signed snapshots and Log labels.
 UPDATE public.timetracker_ot_requests SET attendance_record_id=p_record,attendance_clock_in_at=p_start
 WHERE workspace_id=p_workspace AND owner_id=p_owner AND ot_date=d.work_date
  AND status='Approved' AND ot_policy='duration-v1' AND attendance_record_id IS NULL;
 RETURN d.approved_minutes;
END;
$f$;
REVOKE ALL ON FUNCTION private.tt_paid_ot_worker_minutes(uuid,uuid,uuid,timestamptz,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tt_paid_ot_apply_decision(p_board_id uuid,p_request_id uuid,
 p_expected_status text,p_expected_decided_at timestamptz,p_decision text,p_expected_policy text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=''
AS $f$
DECLARE
 v_ws uuid; v_actor uuid:=auth.uid(); v_owner uuid; v_bootstrap boolean;
 v_req public.timetracker_ot_requests%ROWTYPE; v_day private.tt_paid_ot_days%ROWTYPE;
 v_current text; v_state jsonb; v_rows jsonb; v_before jsonb; v_after jsonb;
 v_revision bigint; v_next bigint; v_count integer; v_minutes integer; v_approved_count integer;
 v_id uuid; v_start timestamptz; v_base timestamptz; v_target timestamptz;
 v_now timestamptz; v_sync text:='not_required'; v_adjust boolean;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);
 IF v_actor IS NULL OR NOT (
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws) IN ('HR','System Admin'),false)
  OR COALESCE(public.is_platform_admin(v_actor),false) OR v_bootstrap
 ) THEN RAISE EXCEPTION 'Authorized TimeTracker OT approver required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_status IS NULL OR p_decision IS NULL
  OR p_expected_status NOT IN ('Submitted','Approved','Rejected')
  OR p_decision NOT IN ('Approved','Rejected','Withdrawn') OR p_expected_status=p_decision
  OR (p_expected_status='Submitted' AND (p_expected_decided_at IS NOT NULL OR p_decision='Withdrawn'))
  OR (p_expected_status<>'Submitted' AND p_expected_decided_at IS NULL)
 THEN RAISE EXCEPTION 'Invalid OT decision' USING ERRCODE='22023'; END IF;
 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws;
 IF NOT FOUND OR (v_owner=v_actor AND NOT v_bootstrap) THEN
  RAISE EXCEPTION 'Request unavailable or self-review prohibited' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':time-tracker:attendance:'||v_owner::text,0));
 SELECT * INTO v_req FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND OR v_req.status IS DISTINCT FROM p_expected_status
  OR v_req.decided_at IS DISTINCT FROM p_expected_decided_at
  OR (p_expected_policy IS NOT NULL AND v_req.ot_policy IS DISTINCT FROM p_expected_policy)
 THEN RAISE EXCEPTION 'OT decision changed; refresh and try again' USING ERRCODE='PT409'; END IF;
 IF v_req.submission_source<>'manual_admin' AND NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_ws AND wm.user_id=v_owner AND wm.active
 ) THEN RAISE EXCEPTION 'Request is outside signed review scope' USING ERRCODE='42501'; END IF;
 IF p_decision='Approved' AND (NOT private.tt_auto_clockout_employee_eligible(v_ws,p_board_id,v_owner)
  OR private.tt_role_in_workspace(v_owner,v_ws) IS NOT DISTINCT FROM 'OJT') THEN
  RAISE EXCEPTION 'Regular employee OT scope required' USING ERRCODE='42501'; END IF;
 IF p_decision='Approved' AND EXISTS(
  SELECT 1 FROM public.timetracker_ot_requests r WHERE r.workspace_id=v_ws AND r.owner_id=v_owner
   AND r.ot_date=v_req.ot_date AND r.id<>p_request_id AND r.status IN ('Submitted','Approved')
 ) THEN RAISE EXCEPTION 'Another live OT request exists for this employee and date' USING ERRCODE='PT409'; END IF;

 SELECT * INTO v_day FROM private.tt_paid_ot_days WHERE workspace_id=v_ws AND employee_id=v_owner
  AND work_date=v_req.ot_date FOR UPDATE;
 v_adjust:=(p_decision='Approved' OR v_req.status='Approved' OR FOUND)
  AND private.tt_role_in_workspace(v_owner,v_ws) IS DISTINCT FROM 'OJT';
 v_now:=pg_catalog.clock_timestamp();
 IF v_adjust THEN
  SELECT e.value,e.revision INTO v_current,v_revision FROM public.module_state_entries e
   WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*' FOR UPDATE;
  v_state:=COALESCE(v_current::jsonb,'{"version":1,"records":[]}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Canonical attendance unavailable' USING ERRCODE='55000'; END IF;
  SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_owner,v_req.ot_date);
  IF v_count>1 THEN RAISE EXCEPTION 'Multiple attendance records match the employee and date' USING ERRCODE='PT409'; END IF;
  IF v_count=1 THEN
   SELECT r INTO v_before FROM private.tt_duration_ot_matching_records(v_state,v_owner,v_req.ot_date) r;
   v_id:=(v_before->>'id')::uuid;
   v_start:=(v_before#>>'{clockIn,timestamp}')::timestamptz;
   IF v_id IS NULL OR v_start IS NULL OR NOT pg_catalog.isfinite(v_start)
    OR v_before#>>'{clockOut,status}'='administratively_closed'
    OR v_before#>>'{reconciliation,type}'='legacy_duplicate_session'
    OR (v_day.attendance_record_id IS NOT NULL AND
     (v_day.attendance_record_id<>v_id OR v_day.attendance_clock_in_at<>v_start))
    OR (v_req.attendance_record_id IS NOT NULL AND
     (v_req.attendance_record_id<>v_id OR v_req.attendance_clock_in_at<>v_start))
   THEN RAISE EXCEPTION 'Attendance association changed or is not eligible' USING ERRCODE='PT409'; END IF;
  END IF;
 END IF;
 UPDATE public.timetracker_ot_requests SET status=p_decision,decided_by=v_actor,decided_at=v_now,
  attendance_record_id=CASE WHEN p_decision='Approved' AND v_req.ot_policy='duration-v1' THEN v_id END,
  attendance_clock_in_at=CASE WHEN p_decision='Approved' AND v_req.ot_policy='duration-v1' THEN v_start END
 WHERE id=p_request_id AND workspace_id=v_ws;

 IF v_adjust THEN
  SELECT count(*),COALESCE(sum(duration_minutes),0)::integer INTO v_approved_count,v_minutes
   FROM public.timetracker_ot_requests WHERE workspace_id=v_ws AND owner_id=v_owner
    AND ot_date=v_req.ot_date AND status='Approved';
  IF v_approved_count>1 OR (v_minutes<>0 AND v_minutes NOT BETWEEN 30 AND 360) THEN
   RAISE EXCEPTION 'Conflicting approved OT requests; resolve duplicate approvals first' USING ERRCODE='PT409'; END IF;
  INSERT INTO private.tt_paid_ot_days(workspace_id,employee_id,work_date,approved_minutes,
   attendance_record_id,attendance_clock_in_at,updated_by,updated_at)
  VALUES(v_ws,v_owner,v_req.ot_date,v_minutes,COALESCE(v_id,v_day.attendance_record_id,v_req.attendance_record_id),
   COALESCE(v_start,v_day.attendance_clock_in_at,v_req.attendance_clock_in_at),v_actor,v_now)
  ON CONFLICT(workspace_id,employee_id,work_date) DO UPDATE SET approved_minutes=EXCLUDED.approved_minutes,
   attendance_record_id=EXCLUDED.attendance_record_id,attendance_clock_in_at=EXCLUDED.attendance_clock_in_at,
   updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;

  IF v_id IS NULL THEN v_sync:='unmatched';
  ELSE
   v_base:=private.tt_auto_clockout_threshold(v_start);
   v_target:=private.tt_duration_ot_cutoff(v_start,v_base,v_minutes);
   IF pg_catalog.jsonb_typeof(v_before->'clockOut')='object' THEN
    -- Never create a future completed clock-out or overlap another session.
    IF v_target>v_now THEN RAISE EXCEPTION 'Corrected clock-out is in the future; retry when the credited shift ends' USING ERRCODE='PT409'; END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') r
      WHERE r->>'ownerId'='cloud:'||v_owner::text AND r->>'id'<>v_id::text
      AND pg_catalog.pg_input_is_valid(r#>>'{clockIn,timestamp}','timestamp with time zone')
      AND (r#>>'{clockIn,timestamp}')::timestamptz>v_start
      AND (r#>>'{clockIn,timestamp}')::timestamptz<v_target)
    THEN RAISE EXCEPTION 'Corrected clock-out would overlap another attendance session' USING ERRCODE='PT409'; END IF;
    -- Existing correction helper retains authentic GPS and original closure evidence.
    v_after:=private.tt_attendance_admin_apply_patch(v_before,pg_catalog.jsonb_build_object(
     'clockOutAt',v_target,'creditedMsOverride',(540+v_minutes)::bigint*60000),v_actor,v_ws);
    SELECT pg_catalog.jsonb_agg(CASE WHEN elem->>'id'=v_id::text THEN v_after ELSE elem END ORDER BY ord)
     INTO v_rows FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY a(elem,ord);
    v_state:=pg_catalog.jsonb_set(v_state,'{records}',v_rows,true);
    IF NOT public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',v_state::text) THEN
     RAISE EXCEPTION 'OT correction violates attendance invariants' USING ERRCODE='23514'; END IF;
    INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
    VALUES(v_ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',v_current,1,v_actor,v_now)
    ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE SET value=EXCLUDED.value,
     revision=public.module_state_entries.revision+1,updated_by=v_actor,updated_at=v_now;
    UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1,updated_by=v_actor,updated_at=v_now
     WHERE workspace_id=v_ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
      AND scope='shared' AND owner_key='*' RETURNING revision INTO v_next;
    IF v_next IS NULL OR v_next<=v_revision THEN RAISE EXCEPTION 'Attendance revision did not advance'; END IF;
    IF EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p
      WHERE p.workspace_id=v_ws AND p.board_id=p_board_id AND p.record_id=v_id) THEN
     PERFORM private.tt_attendance_admin_sync_projection(p_board_id,v_ws,v_actor,v_after,v_next);
    END IF;
    INSERT INTO private.tt_attendance_admin_audit(workspace_id,board_id,actor_id,action,record_ids,
     base_revision,committed_revision,before_records,after_records,reason,committed_at)
    VALUES(v_ws,p_board_id,v_actor,'edit',ARRAY[v_id::text],v_revision,v_next,
     pg_catalog.jsonb_build_array(v_before),pg_catalog.jsonb_build_array(v_after),
     'OT entitlement correction: '||p_request_id::text||' / '||p_decision,v_now);
    v_sync:='completed_adjusted';
    UPDATE private.tt_auto_clockout_sessions SET overtime_cutoff_at=CASE WHEN v_minutes>0 THEN v_target END,
     updated_at=v_now WHERE workspace_id=v_ws AND board_id=p_board_id AND employee_id=v_owner
      AND record_id=v_id AND clock_in_at=v_start AND threshold_at=v_base AND status='COMPLETED';
   ELSE
    -- Existing worker owns active closure. It shares the employee advisory lock.
    UPDATE private.tt_auto_clockout_sessions SET overtime_cutoff_at=CASE WHEN v_minutes>0 THEN v_target END,
     last_evaluated_at=NULL,updated_at=v_now
     WHERE workspace_id=v_ws AND board_id=p_board_id AND employee_id=v_owner AND record_id=v_id
      AND clock_in_at=v_start AND threshold_at=v_base
      AND status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR');
    v_sync:='active_deadline';
   END IF;
  END IF;
 END IF;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,CASE WHEN p_decision='Withdrawn' THEN 'withdrawn'
  WHEN v_req.status='Submitted' THEN pg_catalog.lower(p_decision) ELSE 'decision_edited' END,
  pg_catalog.jsonb_build_object('previousStatus',v_req.status,'previousDecidedAt',v_req.decided_at,
   'previousDecidedBy',v_req.decided_by,'status',p_decision,'otPolicy',v_req.ot_policy,
   'submissionSource',v_req.submission_source,'previousAttendanceRecordId',v_req.attendance_record_id,
   'previousAttendanceClockInAt',v_req.attendance_clock_in_at,'attendanceRecordId',v_id,
   'approvedMinutes',v_minutes,'clockOutAt',v_target,'attendanceSync',v_sync));
 RETURN pg_catalog.jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status',p_decision,'previousStatus',v_req.status,'decidedBy',v_actor::text,
  'otPolicy',v_req.ot_policy,'submissionSource',v_req.submission_source,
  'attendanceRecordId',CASE WHEN p_decision='Approved' AND v_req.ot_policy='duration-v1' THEN v_id END,
  'attendanceSync',v_sync,'clockOutAt',v_target);
END;
$f$;
REVOKE ALL ON FUNCTION private.tt_paid_ot_apply_decision(uuid,uuid,text,timestamptz,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- All existing signed decision entrypoints share the new policy; old clients
-- cannot bypass synchronization. Signatures and existing receipt fields remain.
CREATE OR REPLACE FUNCTION public.timetracker_ot_decide_duration(p_board_id uuid,p_request_id uuid,p_decision text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$ SELECT private.tt_paid_ot_apply_decision(p_board_id,p_request_id,'Submitted',NULL,p_decision,'duration-v1') $f$;
CREATE OR REPLACE FUNCTION public.timetracker_ot_decide_manual_duration(p_board_id uuid,p_request_id uuid,p_decision text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$ SELECT private.tt_paid_ot_apply_decision(p_board_id,p_request_id,'Submitted',NULL,p_decision,'manual-duration-v1') $f$;
CREATE OR REPLACE FUNCTION public.timetracker_ot_decide(p_board_id uuid,p_request_id uuid,p_decision text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$ SELECT private.tt_paid_ot_apply_decision(p_board_id,p_request_id,'Submitted',NULL,p_decision,'legacy-range') $f$;
CREATE OR REPLACE FUNCTION public.timetracker_ot_edit_decision(p_board_id uuid,p_request_id uuid,p_expected_status text,
 p_expected_decided_at timestamptz,p_decision text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$ SELECT private.tt_paid_ot_apply_decision(p_board_id,p_request_id,p_expected_status,p_expected_decided_at,p_decision,NULL) $f$;

-- Keep ordinary worker logic for unconverted days, but use signed paid duration
-- for days touched by the new decision contract, including delegated OT.
DO $worker$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('private.tt_process_auto_clockouts()'::regprocedure);
 FOR old,replacement IN VALUES
 ($old$private.tt_duration_ot_worker_minutes(
        v_session.workspace_id,v_session.employee_id,v_session.record_id,v_clock_in,v_threshold,v_state)$old$,
  $new$COALESCE(private.tt_paid_ot_worker_minutes(v_session.workspace_id,v_session.employee_id,
        v_session.record_id,v_clock_in,v_state),private.tt_duration_ot_worker_minutes(
        v_session.workspace_id,v_session.employee_id,v_session.record_id,v_clock_in,v_threshold,v_state))$new$),
 ($old$IF NOT v_has_ot THEN
      FOR v_ot IN$old$,
  $new$IF NOT v_has_ot AND NOT EXISTS(SELECT 1 FROM private.tt_paid_ot_days pd
       WHERE pd.workspace_id=v_session.workspace_id AND pd.employee_id=v_session.employee_id
        AND pd.work_date=(v_clock_in AT TIME ZONE 'Asia/Manila')::date) THEN
      FOR v_ot IN$new$),
 ($old$AND (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at$old$,
  $new$AND (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at
       OR (s.overtime_cutoff_at IS NULL AND EXISTS(
        SELECT 1 FROM private.tt_paid_ot_days pd WHERE pd.workspace_id=s.workspace_id
         AND pd.employee_id=s.employee_id AND pd.approved_minutes>0
         AND pd.work_date=(a.clock_in_at AT TIME ZONE 'Asia/Manila')::date
         AND (pd.attendance_record_id IS NULL OR (pd.attendance_record_id=s.record_id
          AND pd.attendance_clock_in_at=a.clock_in_at))))$new$)
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Paid OT worker baseline drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$worker$;

-- Delegated filing: extend the existing signed duration-only form without
-- promoting IT Administrator into the reviewer role.
DO $delegation$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)'::regprocedure);
 FOR old,replacement IN VALUES
 ($old$private.tt_role_in_workspace(v_actor,v_ws)='System Admin'$old$,
  $new$private.tt_role_in_workspace(v_actor,v_ws) IN ('System Admin','IT Administrator','HR')$new$),
 ($old$p_date>=v_today$old$,$new$p_date>v_today+7$new$),
 ($old$Manual duration OT requires a past date, 30$old$,$new$Delegated duration OT requires a date no later than seven days ahead, 30$new$),
 ($old$AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL$old$,
  $new$AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL
   AND private.tt_role_in_workspace(p.id,v_ws) IS DISTINCT FROM 'OJT'$new$)
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Delegated filing baseline drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$delegation$;

-- Names are exposed only on already authorized request rows. Filing capability
-- is independent of the existing signed reviewer capability.
DO $snapshot$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure);
 FOR old,replacement IN VALUES
 ($old$'manualOtManager',v_manual_admin$old$,
  $new$'manualOtManager',(v_manual_admin OR COALESCE(private.tt_role_in_workspace(v_user,v_ws) IN ('HR','IT Administrator'),false)),
   'paidOtContract','tt-paid-ot-1'$new$),
 ($old$'submittedBy',CASE WHEN v_bootstrap OR$old$,
  $new$'filedByName',COALESCE(submitter.display_name,p.display_name,'Workforce member'),
  'decidedByName',(SELECT dp.display_name FROM public.profiles dp WHERE dp.id=r.decided_by),
  'submittedBy',CASE WHEN r.submitted_by=v_user OR v_bootstrap OR$new$),
 ($old$OR (v_ot_approver AND r.submission_source='manual_admin')$old$,
  $new$OR (v_ot_approver AND r.submission_source='manual_admin')
   OR (r.submitted_by=v_user AND COALESCE(private.tt_role_in_workspace(v_user,v_ws) IN ('HR','IT Administrator'),false))$new$)
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Paid OT snapshot baseline drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$snapshot$;
DO $shared$
DECLARE d text; old text:=$old$'decidedAt',r.decided_at,'canReviewOt',false$old$;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_shared_read_snapshot(uuid,uuid)'::regprocedure);
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Shared OT attribution baseline drift'; END IF;
 EXECUTE pg_catalog.replace(d,old,$new$'filedByName',COALESCE(
  (SELECT sp.display_name FROM public.profiles sp WHERE sp.id=r.submitted_by),p.display_name),
  'decidedByName',(SELECT dp.display_name FROM public.profiles dp WHERE dp.id=r.decided_by),
  'decidedAt',r.decided_at,'canReviewOt',false$new$);
END;
$shared$;
NOTIFY pgrst,'reload schema';
COMMIT;
