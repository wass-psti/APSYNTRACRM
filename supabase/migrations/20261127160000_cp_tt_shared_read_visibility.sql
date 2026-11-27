-- Read-only TimeTracker workspace projection. Existing write RPCs are unchanged.
BEGIN;
CREATE FUNCTION public.timetracker_shared_read_snapshot(p_board_id uuid,p_intern_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_actor uuid:=auth.uid();
 v_ws uuid;
 v_state jsonb;
 v_rows jsonb;
 v_directory jsonb;
 v_interns jsonb;
 v_ot jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR v_ws IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id
  WHERE p.id=v_actor AND p.status='active' AND m.workspace_id=v_ws AND m.active
 ) OR private.tt_role_in_workspace(v_actor,v_ws) IS NULL THEN
  RAISE EXCEPTION 'Active TimeTracker workspace membership required' USING ERRCODE='42501';
 END IF;
 -- The designated shared login must select an active intern. This is the
 -- same server-side identity guard used by its existing personal Clock.
 IF v_actor='d613280d-907b-418f-b872-c0f6dd53e580'::uuid THEN
  IF private.tt_ojt_shared(p_board_id) IS DISTINCT FROM v_ws OR NOT EXISTS(
   SELECT 1 FROM private.tt_ojt_interns i WHERE i.id=p_intern_id
   AND i.workspace_id=v_ws AND i.board_id=p_board_id AND i.shared_user_id=v_actor AND i.active
  ) THEN RAISE EXCEPTION 'Select an active intern' USING ERRCODE='42501'; END IF;
 ELSIF p_intern_id IS NOT NULL THEN
  RAISE EXCEPTION 'Intern identity is not valid for this account' USING ERRCODE='42501';
 END IF;
 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
 AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 v_state:=coalesce(v_state,'{"version":1,"records":[]}'::jsonb);
 IF v_state->>'version' IS DISTINCT FROM '1'
 OR pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid attendance state' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'status','active',
  'display_name',p.display_name) ORDER BY p.id),'[]'::jsonb)
 INTO v_directory FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id
 WHERE m.workspace_id=v_ws AND m.active AND p.status='active'
 AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL;
 -- Explicit allowlist: never expose GPS, audit, authentication or backup state.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.value->>'id','ownerId',r.value->>'ownerId',
  'clockIn',jsonb_build_object('timestamp',r.value#>>'{clockIn,timestamp}',
    'location',r.value#>>'{clockIn,location}','department',r.value#>>'{clockIn,department}',
    'workNote',r.value#>>'{clockIn,workNote}'),
  'clockOut',CASE WHEN jsonb_typeof(r.value->'clockOut')='object' THEN
   jsonb_build_object('timestamp',r.value#>>'{clockOut,timestamp}',
    'status',r.value#>>'{clockOut,status}','manualMethod',r.value#>>'{clockOut,manualMethod}',
    'automatic',r.value#>'{clockOut,automatic}','reason',r.value#>>'{clockOut,reason}')
   ELSE NULL END,
  'reconciliation',jsonb_build_object('type',r.value#>>'{reconciliation,type}'),
  'creditedMsOverride',r.value->'creditedMsOverride'
 ) ORDER BY r.value#>>'{clockIn,timestamp}' DESC),'[]'::jsonb)
 INTO v_rows FROM jsonb_array_elements(v_state->'records') r(value)
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_directory) d(value)
  WHERE r.value->>'ownerId'='cloud:'||(d.value->>'id'));
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id::text,'internId',a.intern_id::text,'name',a.intern_name,
  'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,'location',a.location,
  'workNote',a.work_note) ORDER BY a.clock_in_at DESC),'[]'::jsonb)
 INTO v_interns FROM private.tt_ojt_attendance a
 WHERE a.workspace_id=v_ws AND a.board_id=p_board_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id::text,'ownerId','cloud:'||r.owner_id::text,'name',p.display_name,
  'date',r.ot_date::text,'durationMinutes',r.duration_minutes,'task',r.reason,
  'status',r.status,'submissionSource',r.submission_source,'otPolicy',r.ot_policy,
  'attendanceRecordId',r.attendance_record_id,'attendanceClockInAt',r.attendance_clock_in_at,
  'decidedAt',r.decided_at,'canReviewOt',false,'canReviewDuration',false,'canWithdraw',false
 ) ORDER BY r.ot_date DESC,r.submitted_at DESC),'[]'::jsonb)
 INTO v_ot FROM public.timetracker_ot_requests r JOIN public.profiles p ON p.id=r.owner_id
 WHERE r.workspace_id=v_ws AND r.status IN ('Submitted','Approved','Rejected')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_directory) d(value)
  WHERE d.value->>'id'=r.owner_id::text);
 RETURN jsonb_build_object('contract','tt-shared-read-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,'internId',p_intern_id::text,
  'directory',v_directory,'attendance',jsonb_build_object('version',1,'records',v_rows),
  'internAttendance',v_interns,'overtime',v_ot);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_shared_read_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_shared_read_snapshot(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
