-- Shared read-only Log and OT projection; no changes to write RPCs or scheduler.
BEGIN;
CREATE FUNCTION public.timetracker_shared_read_snapshot(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_actor uuid:=auth.uid();
 v_ws uuid;
 v_state jsonb;
 v_directory jsonb;
 v_records jsonb;
 v_ojt jsonb;
 v_ot jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR v_ws IS NULL OR private.tt_role_in_workspace(v_actor,v_ws) IS NULL THEN
  RAISE EXCEPTION 'Signed TimeTracker workspace membership required' USING ERRCODE='42501';
 END IF;
 -- A dropdown selection is not a separate authentication principal. All enabled
 -- interns in the same shared account have the same read scope, never write scope.
 IF v_actor='d613280d-907b-418f-b872-c0f6dd53e580'::uuid OR EXISTS(
  SELECT 1 FROM private.tt_ojt_shared_accounts g WHERE g.workspace_id=v_ws
   AND g.board_id=p_board_id AND g.shared_user_id=v_actor
 ) THEN
  PERFORM private.tt_ojt_shared(p_board_id);
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,
  'status','active','display_name',coalesce(p.display_name,'Workforce member'))),'[]'::jsonb)
 INTO v_directory
 FROM public.profiles p JOIN public.workspace_members m
  ON m.user_id=p.id AND m.workspace_id=v_ws AND m.active
 WHERE p.status='active' AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL;

 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
 AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 IF v_state IS NOT NULL AND (v_state->>'version' IS DISTINCT FROM '1'
  OR jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array') THEN
  RAISE EXCEPTION 'Invalid attendance state contract' USING ERRCODE='22023';
 END IF;
 -- Explicit allowlist: no GPS, audit evidence, raw state, email or tokens.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r->'id','ownerId',r->'ownerId',
  'clockIn',jsonb_build_object('timestamp',r#>'{clockIn,timestamp}',
   'department',r#>'{clockIn,department}','location',r#>'{clockIn,location}',
   'workNote',r#>'{clockIn,workNote}'),
  'clockOut',CASE WHEN jsonb_typeof(r->'clockOut')='object' THEN jsonb_build_object(
   'timestamp',r#>'{clockOut,timestamp}','status',r#>'{clockOut,status}',
   'automatic',r#>'{clockOut,automatic}','manualMethod',r#>'{clockOut,manualMethod}',
   'reason',CASE WHEN r#>>'{clockOut,reason}'='admin_manual_clock_out'
    THEN 'admin_manual_clock_out' ELSE NULL END) ELSE NULL END,
  'creditedMsOverride',r->'creditedMsOverride',
  'reconciliation',jsonb_build_object('type',r#>'{reconciliation,type}')
 )),'[]'::jsonb) INTO v_records
 FROM jsonb_array_elements(coalesce(v_state->'records','[]'::jsonb)) r
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_directory) d
  WHERE r->>'ownerId'='cloud:'||(d->>'id'));

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id::text,'internId',a.intern_id::text,'name',a.intern_name,
  'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
  'location',a.location,'workNote',a.work_note)
  ORDER BY a.clock_in_at DESC),'[]'::jsonb) INTO v_ojt
 FROM private.tt_ojt_attendance a
 WHERE a.workspace_id=v_ws AND a.board_id=p_board_id;

 -- Peer rows never carry management or withdrawal capabilities. Existing signed
 -- OT snapshot remains the only source for privileged and personal capabilities.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id::text,'ownerId','cloud:'||r.owner_id::text,
  'name',coalesce(p.display_name,'Workforce member'),'date',r.ot_date::text,
  'durationMinutes',r.duration_minutes,'status',r.status,'task',r.reason,
  'submissionSource',r.submission_source,'otPolicy',r.ot_policy,
  'attendanceRecordId',r.attendance_record_id,'attendanceClockInAt',r.attendance_clock_in_at,
  'canReviewOt',false,'canReviewDuration',false,'canWithdraw',false)
  ORDER BY r.ot_date DESC,r.submitted_at DESC),'[]'::jsonb) INTO v_ot
 FROM public.timetracker_ot_requests r
 JOIN public.profiles p ON p.id=r.owner_id
 WHERE r.workspace_id=v_ws AND r.owner_id<>v_actor
 AND r.status IN ('Submitted','Approved','Rejected')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_directory) d
  WHERE d->>'id'=r.owner_id::text);

 RETURN jsonb_build_object('contract','tt-shared-read-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,'directory',v_directory,
  'attendance',jsonb_build_object('version',1,'records',v_records),
  'ojtRecords',v_ojt,'otRows',v_ot);
END
$f$;
REVOKE ALL ON FUNCTION public.timetracker_shared_read_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_shared_read_snapshot(uuid) TO authenticated;
COMMENT ON FUNCTION public.timetracker_shared_read_snapshot(uuid) IS
 'Signed workspace read-only attendance, OJT and OT display projection. No write capabilities.';
NOTIFY pgrst,'reload schema';
COMMIT;
