-- Audited removal of decided OT. Keep actual punches, GPS and original decisions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

ALTER TABLE public.timetracker_ot_requests
 DROP CONSTRAINT tt_ot_policy_shape,
 ADD CONSTRAINT tt_ot_policy_shape CHECK (
  (ot_policy='legacy-range' AND start_time IS NOT NULL AND end_time IS NOT NULL
   AND end_time>start_time
   AND duration_minutes=(extract(epoch FROM end_time-start_time)/60)::integer
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
  OR (ot_policy='duration-v1' AND submission_source='employee'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND submitted_by=owner_id
   AND ((attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
    OR (attendance_record_id IS NOT NULL AND attendance_clock_in_at IS NOT NULL
     AND status IN ('Approved','Withdrawn') AND (attendance_clock_in_at AT TIME ZONE 'Asia/Manila')::date=ot_date)))
  OR (ot_policy='manual-duration-v1' AND submission_source='manual_admin'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
   AND duration_minutes BETWEEN 30 AND 360 AND duration_minutes % 30=0
 );
DROP INDEX public.tt_ot_duration_record;
CREATE UNIQUE INDEX tt_ot_duration_record
 ON public.timetracker_ot_requests(workspace_id,attendance_record_id)
 WHERE attendance_record_id IS NOT NULL AND status='Approved';
ALTER TABLE public.timetracker_ot_audit
 DROP CONSTRAINT timetracker_ot_audit_event_check,
 ADD CONSTRAINT timetracker_ot_audit_event_check
 CHECK(event IN ('submitted','approved','rejected','withdrawn','cancelled'));

CREATE FUNCTION public.timetracker_ot_cancel_decision(
 p_board_id uuid,p_request_id uuid,p_expected_status text,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
SET lock_timeout='3s'
AS $cancel$
DECLARE
 v_ws uuid; v_actor uuid:=auth.uid(); v_owner uuid;
 v_req public.timetracker_ot_requests%ROWTYPE;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_effect text:='request_only';
 v_before text; v_state jsonb; v_updated jsonb; v_record jsonb; v_after jsonb;
 v_matches jsonb; v_count integer; v_rev bigint; v_next bigint;
 v_id uuid; v_start timestamptz; v_out timestamptz; v_threshold timestamptz;
 v_actual bigint; v_credit bigint; v_new_credit bigint;
 v_now timestamptz; v_stamp text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT (
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws) IN ('HR','System Admin'),false)
  OR COALESCE(public.is_platform_admin(v_actor),false)
  OR COALESCE(public.apsyntra_role_is_bootstrap(),false)
 ) THEN RAISE EXCEPTION 'Authorized TimeTracker OT reviewer required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_status IS NULL
  OR p_expected_status NOT IN ('Approved','Rejected')
  OR pg_catalog.length(v_reason) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'A decided request and cancellation reason are required' USING ERRCODE='22023'; END IF;
 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status=p_expected_status;
 IF NOT FOUND OR v_owner=v_actor
 THEN RAISE EXCEPTION 'Request unavailable or self-cancellation prohibited' USING ERRCODE='42501'; END IF;

 -- Same control and employee locks as the scheduler; do not change cron or epoch.
 IF p_expected_status='Approved' AND NOT pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended('tt-auto-clockout-control',0))
 THEN RAISE EXCEPTION 'Attendance scheduler busy; retry cancellation' USING ERRCODE='55P03'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_owner::text,0))
 THEN RAISE EXCEPTION 'Employee attendance busy; retry cancellation' USING ERRCODE='55P03'; END IF;
 SELECT * INTO v_req FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND owner_id=v_owner
  AND status=p_expected_status FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OT decision changed; refresh and try again' USING ERRCODE='PT409'; END IF;
 IF v_req.submission_source<>'manual_admin' AND NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
   WHERE wm.workspace_id=v_ws AND wm.user_id=v_owner AND wm.active
 ) THEN RAISE EXCEPTION 'Employee is outside the current review scope' USING ERRCODE='42501'; END IF;
 v_now:=pg_catalog.clock_timestamp();

 IF v_req.status='Approved' AND private.tt_role_in_workspace(v_owner,v_ws) IS DISTINCT FROM 'OJT' THEN
  SELECT e.value,e.revision INTO v_before,v_rev FROM public.module_state_entries e
   WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*' FOR UPDATE;
  IF v_before IS NULL OR v_rev IS NULL THEN
   RAISE EXCEPTION 'Canonical attendance unavailable; cancellation aborted' USING ERRCODE='55000';
  END IF;
  v_state:=v_before::jsonb;
  IF pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Canonical attendance is malformed' USING ERRCODE='55000';
  END IF;
  -- Duration approvals bind to exact attendance; legacy worker uses cutoff date.
  SELECT COALESCE(pg_catalog.jsonb_agg(r.elem),'[]'::jsonb) INTO v_matches
  FROM pg_catalog.jsonb_array_elements(v_state->'records') r(elem)
  WHERE r.elem->>'ownerId'='cloud:'||v_owner::text
   AND (v_req.attendance_record_id IS NULL OR r.elem->>'id'=v_req.attendance_record_id::text)
   AND CASE WHEN pg_catalog.pg_input_is_valid(r.elem#>>'{clockIn,timestamp}','timestamp with time zone')
    THEN (
     ((r.elem#>>'{clockIn,timestamp}')::timestamptz AT TIME ZONE 'Asia/Manila')::date=v_req.ot_date
     OR (v_req.ot_policy='legacy-range' AND
      (private.tt_auto_clockout_threshold((r.elem#>>'{clockIn,timestamp}')::timestamptz)
       AT TIME ZONE 'Asia/Manila')::date=v_req.ot_date)
    ) ELSE false END;
  v_count:=pg_catalog.jsonb_array_length(v_matches);
  IF v_count>1 OR (v_req.attendance_record_id IS NOT NULL AND v_count<>1)
  THEN RAISE EXCEPTION 'Attendance binding is missing or ambiguous; review the record first' USING ERRCODE='PT409'; END IF;
  IF v_count=1 THEN
   v_record:=v_matches->0;
   v_id:=(v_record->>'id')::uuid;
   v_start:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
   IF v_id IS NULL OR NOT pg_catalog.isfinite(v_start)
    OR (v_req.attendance_clock_in_at IS NOT NULL AND v_req.attendance_clock_in_at IS DISTINCT FROM v_start)
   THEN RAISE EXCEPTION 'Attendance identity changed; review the record first' USING ERRCODE='PT409'; END IF;
   v_threshold:=private.tt_auto_clockout_threshold(v_start);
   IF v_record#>>'{clockIn,department}'='OJT'
    OR v_record#>>'{clockOut,status}'='administratively_closed'
    OR v_record#>>'{reconciliation,type}'='legacy_duplicate_session' THEN
    v_effect:='request_only';
   ELSIF EXISTS(SELECT 1 FROM public.timetracker_ot_requests r
    WHERE r.workspace_id=v_ws AND r.owner_id=v_owner AND r.id<>p_request_id AND r.status='Approved'
     AND (r.ot_date=(v_start AT TIME ZONE 'Asia/Manila')::date
      OR (r.ot_policy='legacy-range' AND r.ot_date=(v_threshold AT TIME ZONE 'Asia/Manila')::date))
     AND (r.attendance_record_id IS NULL OR
      (r.attendance_record_id=v_id AND r.attendance_clock_in_at=v_start))) THEN
    v_effect:='other_approval_retained';
   ELSIF v_record->'clockOut' IS NULL OR v_record->'clockOut'='null'::jsonb THEN
    IF v_req.ot_policy<>'manual-duration-v1' THEN
     -- Reset only the matching live queue entry; worker re-evaluates its cutoff.
     UPDATE private.tt_auto_clockout_sessions q
     SET status='MONITORING',overtime_cutoff_at=NULL,
      grace_started_at=NULL,grace_deadline_at=NULL,pending_at=NULL,
      scheduled_clock_out_at=NULL,last_evaluated_at=NULL,last_error=NULL,updated_at=v_now
     WHERE q.workspace_id=v_ws AND q.board_id=p_board_id AND q.employee_id=v_owner
      AND q.record_id=v_id AND q.clock_in_at=v_start
      AND q.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR');
     v_effect:='active_regular_cutoff';
    END IF;
   ELSE
    IF NOT COALESCE(pg_catalog.pg_input_is_valid(v_record#>>'{clockOut,timestamp}','timestamp with time zone'),false)
    THEN RAISE EXCEPTION 'Completed attendance has invalid clock-out evidence' USING ERRCODE='PT409'; END IF;
    v_out:=(v_record#>>'{clockOut,timestamp}')::timestamptz;
    IF NOT pg_catalog.isfinite(v_out) OR v_out<v_start
    THEN RAISE EXCEPTION 'Completed attendance timestamps are invalid' USING ERRCODE='PT409'; END IF;
    v_actual:=private.tt_attendance_credited_ms(v_start,v_out);
    v_credit:=COALESCE((v_record->>'creditedMsOverride')::bigint,v_actual);
    -- Never increase a shorter shift or erase actual punch/GPS evidence.
    IF v_actual>32400000 AND v_credit>32400000 THEN
     v_new_credit:=32400000;
     v_stamp:=pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
     v_after:=v_record||pg_catalog.jsonb_build_object('creditedMsOverride',v_new_credit,'updatedAt',v_stamp);
     SELECT pg_catalog.jsonb_set(v_state,'{records}',COALESCE(pg_catalog.jsonb_agg(
       CASE WHEN x.elem->>'id'=v_id::text AND x.elem->>'ownerId'='cloud:'||v_owner::text
        THEN v_after ELSE x.elem END ORDER BY x.ord),'[]'::jsonb))
     INTO v_updated FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY x(elem,ord);
     IF NOT COALESCE(public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',v_updated::text),false)
     THEN RAISE EXCEPTION 'Attendance credit correction violates state invariants' USING ERRCODE='23514'; END IF;
     INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
      VALUES(v_ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',v_before,1,v_actor,v_now)
     ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
      SET value=EXCLUDED.value,revision=public.module_state_entries.revision+1,updated_by=v_actor,updated_at=v_now;
     UPDATE public.module_state_entries SET value=v_updated::text,revision=revision+1,updated_by=v_actor,updated_at=v_now
     WHERE workspace_id=v_ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
      AND scope='shared' AND owner_key='*' AND revision=v_rev RETURNING revision INTO v_next;
     IF v_next IS NULL OR v_next<=v_rev
     THEN RAISE EXCEPTION 'Attendance revision conflict' USING ERRCODE='40001'; END IF;
     IF EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p
      WHERE p.workspace_id=v_ws AND p.board_id=p_board_id AND p.record_id=v_id) THEN
      PERFORM private.tt_attendance_admin_sync_projection(p_board_id,v_ws,v_actor,v_after,v_next);
     END IF;
     INSERT INTO private.tt_attendance_admin_audit(workspace_id,board_id,actor_id,action,record_ids,
      base_revision,committed_revision,before_records,after_records,reason,committed_at)
     VALUES(v_ws,p_board_id,v_actor,'edit',ARRAY[v_id::text],v_rev,v_next,
      pg_catalog.jsonb_build_array(v_record),pg_catalog.jsonb_build_array(v_after),
      pg_catalog.left('OT cancellation '||p_request_id::text||': '||v_reason,500),v_now);
     v_effect:='completed_credit_capped';
    END IF;
   END IF;
  END IF;
 END IF;

 -- Retain original decision and binding; remove from operational snapshots.
 UPDATE public.timetracker_ot_requests SET status='Withdrawn'
 WHERE id=p_request_id AND workspace_id=v_ws AND owner_id=v_owner AND status=p_expected_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'OT decision changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,'cancelled',pg_catalog.jsonb_build_object(
  'previousStatus',v_req.status,'originalDecidedBy',v_req.decided_by,
  'originalDecidedAt',v_req.decided_at,'reason',v_reason,'attendanceRecordId',v_id,
  'attendanceEffect',v_effect,'previousCreditedMs',v_credit,'newCreditedMs',v_new_credit,
  'attendanceRevision',v_next));
 RETURN pg_catalog.jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status','Withdrawn','previousStatus',v_req.status,'cancelledBy',v_actor::text,
  'attendanceEffect',v_effect);
END;
$cancel$;
REVOKE ALL ON FUNCTION public.timetracker_ot_cancel_decision(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_cancel_decision(uuid,uuid,text,text) TO authenticated;

DO $snapshot$
DECLARE d text; old text:=$old$'canReviewOt',$old$;
BEGIN
 d:=pg_catalog.replace(pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure),
  pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10));
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2
 THEN RAISE EXCEPTION 'OT cancellation snapshot baseline drift'; END IF;
 EXECUTE pg_catalog.replace(d,old,$new$'canDeleteOt',(v_ot_approver AND r.status IN ('Approved','Rejected')
    AND r.owner_id<>v_user AND (r.submission_source='manual_admin' OR wm.user_id IS NOT NULL)),
  'canReviewOt',$new$);
END;
$snapshot$;

NOTIFY pgrst,'reload schema';
COMMIT;
