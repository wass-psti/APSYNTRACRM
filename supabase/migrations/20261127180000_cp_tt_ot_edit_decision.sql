-- CP-TT-OT-EDIT-01: correct a finalized decision using the existing signed review rules.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

ALTER TABLE public.timetracker_ot_audit
 DROP CONSTRAINT timetracker_ot_audit_event_check,
 ADD CONSTRAINT timetracker_ot_audit_event_check
 CHECK(event IN ('submitted','approved','rejected','withdrawn','decision_edited'));

CREATE FUNCTION public.timetracker_ot_edit_decision(
 p_board_id uuid,p_request_id uuid,p_expected_status text,
 p_expected_decided_at timestamptz,p_decision text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_bootstrap boolean;
 v_owner uuid;
 v_req public.timetracker_ot_requests%ROWTYPE;
 v_receipt jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);
 IF v_actor IS NULL OR NOT (
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws) IN ('HR','System Admin'),false)
  OR COALESCE(public.is_platform_admin(v_actor),false) OR v_bootstrap
 ) THEN
  RAISE EXCEPTION 'Authorized TimeTracker OT approver required' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_expected_status IS NULL OR p_decision IS NULL
  OR p_expected_decided_at IS NULL
  OR p_expected_status NOT IN ('Approved','Rejected')
  OR p_decision NOT IN ('Approved','Rejected') OR p_expected_status=p_decision THEN
  RAISE EXCEPTION 'Invalid OT decision correction' USING ERRCODE='22023';
 END IF;

 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws;
 IF NOT FOUND OR (v_owner=v_actor AND NOT v_bootstrap) THEN
  RAISE EXCEPTION 'OT request unavailable or self-review prohibited' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_owner::text,0));
 SELECT * INTO v_req FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND OR v_req.status IS DISTINCT FROM p_expected_status
  OR v_req.decided_at IS DISTINCT FROM p_expected_decided_at THEN
  RAISE EXCEPTION 'OT decision changed; refresh and try again' USING ERRCODE='PT409';
 END IF;
 IF v_req.submission_source<>'manual_admin' AND NOT EXISTS (
  SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_ws
   AND wm.user_id=v_owner AND wm.active
 ) THEN
  RAISE EXCEPTION 'OT request is outside the signed review scope' USING ERRCODE='42501';
 END IF;
 IF v_req.ot_policy NOT IN ('duration-v1','manual-duration-v1','legacy-range') THEN
  RAISE EXCEPTION 'Unsupported OT policy' USING ERRCODE='22023';
 END IF;

 -- Reuse the existing decision RPCs inside this transaction. The temporary
 -- Submitted state is never committed or exposed. A failed approval (cutoff,
 -- duplicate, authorization, attendance matching) rolls the entire edit back.
 BEGIN
  UPDATE public.timetracker_ot_requests SET status='Submitted',
   decided_by=NULL,decided_at=NULL,attendance_record_id=NULL,attendance_clock_in_at=NULL
  WHERE id=p_request_id AND workspace_id=v_ws;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Another live OT request exists for this employee and date'
   USING ERRCODE='PT409';
 END;
 IF v_req.ot_policy='duration-v1' THEN
  v_receipt:=public.timetracker_ot_decide_duration(p_board_id,p_request_id,p_decision);
 ELSIF v_req.ot_policy='manual-duration-v1' THEN
  v_receipt:=public.timetracker_ot_decide_manual_duration(p_board_id,p_request_id,p_decision);
 ELSE
  v_receipt:=public.timetracker_ot_decide(p_board_id,p_request_id,p_decision);
 END IF;

 -- If a pre-threshold duration approval already populated a monitoring
 -- deadline, clear only that exact still-monitoring association. After the
 -- regular threshold, the existing worker recomputes entitlement each run
 -- under the same employee lock and closes at the normal cutoff if no OT applies.
 IF p_decision='Rejected' AND v_req.ot_policy='duration-v1'
  AND v_req.attendance_record_id IS NOT NULL THEN
  UPDATE private.tt_auto_clockout_sessions
   SET overtime_cutoff_at=NULL,last_evaluated_at=NULL,updated_at=pg_catalog.clock_timestamp()
  WHERE workspace_id=v_ws AND board_id=p_board_id AND employee_id=v_owner
   AND record_id=v_req.attendance_record_id AND clock_in_at=v_req.attendance_clock_in_at
   AND status='MONITORING' AND threshold_at>pg_catalog.clock_timestamp();
 END IF;

 -- Preserve the previous immutable decision and association in the audit trail.
 -- Completed attendance is not rewritten or reopened by a status correction.
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,'decision_edited',pg_catalog.jsonb_build_object(
  'previousStatus',v_req.status,'previousDecidedAt',v_req.decided_at,
  'previousDecidedBy',v_req.decided_by,'status',p_decision,
  'otPolicy',v_req.ot_policy,'submissionSource',v_req.submission_source,
  'previousAttendanceRecordId',v_req.attendance_record_id,
  'previousAttendanceClockInAt',v_req.attendance_clock_in_at,
  'durationMinutes',v_req.duration_minutes));
 RETURN v_receipt||pg_catalog.jsonb_build_object('previousStatus',v_req.status,
  'otPolicy',v_req.ot_policy,'submissionSource',v_req.submission_source);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_ot_edit_decision(uuid,uuid,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_edit_decision(uuid,uuid,text,timestamptz,text)
 TO authenticated;

-- Expose a separate capability only in the signed reviewer snapshot.
DO $snapshot$
DECLARE d text; old text:='''canReviewOt'',(v_ot_approver AND r.status=''Submitted''';
 replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure);
 replacement:=$new$'canEditDecision',(v_ot_approver AND r.status IN ('Approved','Rejected')
    AND (r.submission_source='manual_admin' OR wm.user_id IS NOT NULL)
    AND (r.owner_id<>v_user OR v_bootstrap)),
  $new$||old;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'OT edit snapshot baseline drift'; END IF;
 EXECUTE pg_catalog.replace(d,old,replacement);
END;
$snapshot$;
COMMENT ON FUNCTION public.timetracker_ot_edit_decision(uuid,uuid,text,timestamptz,text) IS
 'Corrects finalized OT decisions with signed scope, exact previous decision, original cutoff rules and audit history. Does not rewrite completed attendance.';
NOTIFY pgrst,'reload schema';
COMMIT;
