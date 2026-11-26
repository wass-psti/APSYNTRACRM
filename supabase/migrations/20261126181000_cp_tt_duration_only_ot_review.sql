-- CP-TT-OT-REVIEW-02: duration-only manual filing and scoped OT review.
-- Requires the registered duration OT migration. Preserve existing rows, audit,
-- worker functions, nine-hour cutoff, cron and OJT isolation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE FUNCTION private.tt_ot_reviewer(p_actor uuid,p_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $review$
 SELECT COALESCE(private.tt_role_in_workspace(p_actor,p_workspace)
  IN ('System Admin','IT Administrator','HR'),false);
$review$;
REVOKE ALL ON FUNCTION private.tt_ot_reviewer(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Historical manual duration is a separate policy: never associate it with
-- a live session or the duration-v1 worker. Keep old range records untouched.
ALTER TABLE public.timetracker_ot_requests DROP CONSTRAINT tt_ot_policy_shape,
 ADD CONSTRAINT tt_ot_policy_shape CHECK (
  (ot_policy='legacy-range' AND start_time IS NOT NULL AND end_time IS NOT NULL
   AND end_time>start_time AND duration_minutes=(extract(epoch FROM end_time-start_time)/60)::integer
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
  OR (ot_policy='duration-v1' AND submission_source='employee'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND submitted_by=owner_id
   AND ((attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
    OR (attendance_record_id IS NOT NULL AND attendance_clock_in_at IS NOT NULL
     AND status='Approved' AND (attendance_clock_in_at AT TIME ZONE 'Asia/Manila')::date=ot_date)))
  OR (ot_policy='manual-duration-v1' AND submission_source='manual_admin'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL));

CREATE FUNCTION public.timetracker_ot_submit_manual_duration(p_board_id uuid,
 p_owner_id uuid,p_date date,p_duration_minutes integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $manual$
DECLARE v_ws uuid; v_actor uuid:=auth.uid(); v_today date; v_id uuid;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_state jsonb; v_record jsonb; v_count integer; v_start timestamptz; v_end timestamptz;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF private.tt_role_in_workspace(v_actor,v_ws) IS DISTINCT FROM 'System Admin' THEN
  RAISE EXCEPTION 'System Admin manual OT submission required' USING ERRCODE='42501'; END IF;
 IF p_owner_id IS NULL OR NOT private.tt_auto_clockout_employee_eligible(v_ws,p_board_id,p_owner_id)
  OR private.tt_role_in_workspace(p_owner_id,v_ws) IS NOT DISTINCT FROM 'OJT' THEN
  RAISE EXCEPTION 'Select an eligible regular employee in this workspace' USING ERRCODE='22023'; END IF;
 v_today:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 IF p_date IS NULL OR p_date>v_today OR p_duration_minutes IS NULL
  OR p_duration_minutes NOT BETWEEN 30 AND 360 OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Select an elapsed date, 30–360 minutes, and a valid reason' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||p_owner_id::text,0));
 -- Without wall-clock input, same-day historical work must already be verified
 -- by a completed canonical attendance record. Past dates remain documentary.
 IF p_date=v_today THEN
  SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
  WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
   AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,p_owner_id,p_date);
  IF v_count<>1 THEN RAISE EXCEPTION 'Same-day manual OT requires one completed attendance record' USING ERRCODE='PT409'; END IF;
  SELECT r INTO v_record FROM private.tt_duration_ot_matching_records(v_state,p_owner_id,p_date) r;
  IF NOT COALESCE(pg_catalog.pg_input_is_valid(v_record#>>'{clockOut,timestamp}','timestamp with time zone'),false) THEN
   RAISE EXCEPTION 'Same-day manual OT requires completed attendance' USING ERRCODE='PT409'; END IF;
  v_start:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
  v_end:=(v_record#>>'{clockOut,timestamp}')::timestamptz;
  IF NOT pg_catalog.isfinite(v_start) OR NOT pg_catalog.isfinite(v_end) OR v_end>pg_catalog.clock_timestamp()
   OR v_end<=v_start OR private.tt_attendance_credited_ms(v_start,v_end)<(540+p_duration_minutes)::bigint*60000 THEN
   RAISE EXCEPTION 'Same-day manual OT exceeds verified completed work' USING ERRCODE='PT409'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.timetracker_ot_requests r
  WHERE r.workspace_id=v_ws AND r.owner_id=p_owner_id AND r.ot_date=p_date
   AND r.status IN ('Submitted','Approved')) THEN
  RAISE EXCEPTION 'An active OT request already exists for this date' USING ERRCODE='23505'; END IF;
 INSERT INTO public.timetracker_ot_requests(workspace_id,owner_id,ot_date,duration_minutes,
  reason,submitted_by,submission_source,ot_policy)
 VALUES(v_ws,p_owner_id,p_date,p_duration_minutes,v_reason,v_actor,'manual_admin','manual-duration-v1')
 RETURNING id INTO v_id;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,v_id,v_actor,'submitted',pg_catalog.jsonb_build_object('submissionSource','manual_admin',
  'otPolicy','manual-duration-v1','ownerId',p_owner_id::text,'workDate',p_date,'durationMinutes',p_duration_minutes));
 RETURN pg_catalog.jsonb_build_object('id',v_id::text,'workspaceId',v_ws::text,'ownerId','cloud:'||p_owner_id::text,
  'submittedBy',v_actor::text,'submissionSource','manual_admin','status','Submitted',
  'otPolicy','manual-duration-v1','durationMinutes',p_duration_minutes);
END;
$manual$;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timetracker_ot_submit_manual(uuid,uuid,date,time,time,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.timetracker_ot_decide_duration(p_board_id uuid,p_request_id uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid; v_actor uuid:=auth.uid(); v_owner uuid;
 v_req public.timetracker_ot_requests%ROWTYPE;
 v_state jsonb; v_count integer; v_record jsonb; v_id uuid; v_start timestamptz;
 v_now timestamptz;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT private.tt_ot_reviewer(v_actor,v_ws) THEN
  RAISE EXCEPTION 'Authorized TimeTracker reviewer required' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION public.timetracker_ot_decide(
 p_board_id uuid,
 p_request_id uuid,
 p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_owner uuid;
 v_source text;
 v_status text;
 v_bootstrap boolean;
 v_policy text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false) AND
  private.tt_role_in_workspace(v_actor,v_ws) IS NOT DISTINCT FROM 'System Admin';

 IF p_decision IS NULL OR p_decision NOT IN ('Approved','Rejected') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid OT decision' USING ERRCODE='22023';
 END IF;
 IF NOT private.tt_ot_reviewer(v_actor,v_ws) THEN
  RAISE EXCEPTION 'Authorized TimeTracker reviewer required' USING ERRCODE='42501';
 END IF;

 -- Lock the same per-employee key as submission before locking the request row.
 SELECT owner_id,submission_source,ot_policy INTO v_owner,v_source,v_policy
 FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 AND ot_policy IN ('legacy-range','manual-duration-v1');
 IF NOT FOUND THEN
  RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
   v_ws::text||':time-tracker:attendance:'||v_owner::text,0));

 SELECT owner_id,submission_source,ot_policy INTO v_owner,v_source,v_policy
 FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 AND ot_policy IN ('legacy-range','manual-duration-v1')
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
 END IF;

 IF v_owner=v_actor AND NOT (v_bootstrap AND v_policy='legacy-range') THEN
  RAISE EXCEPTION 'Self-approval is not permitted' USING ERRCODE='42501';
 END IF;

 UPDATE public.timetracker_ot_requests SET status=p_decision,
  decided_by=v_actor,decided_at=clock_timestamp()
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 AND ot_policy IN ('legacy-range','manual-duration-v1')
 RETURNING status INTO v_status;
 IF v_status IS NULL THEN
  RAISE EXCEPTION 'Concurrent OT decision conflict' USING ERRCODE='PT409';
 END IF;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,lower(p_decision),
  jsonb_build_object('submissionSource',v_source));

 RETURN jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status',v_status,'decidedBy',v_actor::text,'submissionSource',v_source);
END
$function$;
CREATE OR REPLACE FUNCTION public.timetracker_ot_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_ws uuid;
 v_bootstrap boolean;
 v_manual_admin boolean;
 v_reviewer boolean;
 v_hr boolean;
 v_attendance_state jsonb;
 v_rows jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_reviewer:=private.tt_ot_reviewer(v_user,v_ws);
 v_manual_admin:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)='System Admin',false);
 v_hr:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)='HR',false);
 v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false) AND v_manual_admin;
 SELECT e.value::jsonb INTO v_attendance_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
 AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id::text,
  'ownerId','cloud:'||r.owner_id::text,
  'name',coalesce(p.display_name,'Former workforce member'),
  'date',r.ot_date::text,
  'start',to_char(r.start_time,'HH24:MI'),
  'end',to_char(r.end_time,'HH24:MI'),
  'durationMinutes',r.duration_minutes,
  'otPolicy',r.ot_policy,
  'attendanceRecordId',r.attendance_record_id,
  'attendanceClockInAt',r.attendance_clock_in_at,
  'attendanceCredit',CASE WHEN r.ot_policy='duration-v1' AND r.status='Approved' THEN
   private.tt_duration_ot_completed_credit(v_attendance_state,r.owner_id,r.ot_date,r.attendance_record_id,
    r.attendance_clock_in_at,r.duration_minutes,r.decided_at) END,
  'canReviewDuration',(v_reviewer AND r.ot_policy='duration-v1' AND r.status='Submitted'
    AND r.owner_id<>v_user AND wm.user_id IS NOT NULL),
  'canReviewOt',(v_reviewer AND r.status='Submitted'
    AND (r.owner_id<>v_user OR (v_bootstrap AND r.ot_policy='legacy-range'))
    AND (r.ot_policy<>'duration-v1' OR wm.user_id IS NOT NULL)),
  'task',r.reason,
  'status',r.status,
  'submissionSource',r.submission_source,
  'isManual',(r.submission_source='manual_admin'),
  'submittedAt',r.submitted_at,
  'canWithdraw',(r.status='Submitted' AND coalesce(r.submitted_by,CASE WHEN r.submission_source='employee' THEN r.owner_id END)=v_user),
  'submittedBy',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN r.submitted_by::text ELSE NULL END,
  'submittedByName',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN coalesce(submitter.display_name,'TimeTracker administrator') ELSE NULL END,
  'decidedAt',r.decided_at,
  'decidedBy',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN r.decided_by::text ELSE NULL END)
  ORDER BY r.ot_date DESC,r.submitted_at DESC),'[]'::jsonb)
 INTO v_rows
 FROM public.timetracker_ot_requests r
 LEFT JOIN public.profiles p ON p.id=r.owner_id
 LEFT JOIN public.workspace_members wm ON wm.user_id=r.owner_id
  AND wm.workspace_id=v_ws AND wm.active
 LEFT JOIN public.profiles submitter ON submitter.id=r.submitted_by
 WHERE r.workspace_id=v_ws AND r.status<>'Withdrawn' AND (
  v_reviewer OR r.submission_source='manual_admin'
  OR (wm.user_id IS NOT NULL AND r.owner_id=v_user)
 );

 RETURN jsonb_build_object(
  'mode','ACTIVE',
  'workspaceId',v_ws::text,
  'actorId',v_user::text,
  'scope',CASE WHEN v_reviewer THEN 'AUTHORIZED_WORKSPACE_TEAM'
    ELSE 'OWN_OT_ONLY' END,
  'bootstrapApprover',v_bootstrap,
  'durationOtContract','tt-duration-ot-1',
  'durationOtHrApprover',v_hr,
  'otReviewContract','tt-ot-review-2',
  'otApprover',v_reviewer,
  'manualDurationOtContract','tt-manual-duration-ot-1',
  'manualOtManager',v_manual_admin,
  'rows',v_rows
 );
END
$function$;
COMMENT ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text) IS
 'Workspace System Admin, IT Administrator and HR review historical/manual requests; duration-v1 uses its separate guarded decision RPC.';
NOTIFY pgrst,'reload schema';
COMMIT;
