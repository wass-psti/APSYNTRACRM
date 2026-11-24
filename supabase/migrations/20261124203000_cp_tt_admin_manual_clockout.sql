-- CP-TT-ADMIN-MANUAL-CLOCKOUT. Signed System Admin closure, no invented GPS.
BEGIN;

-- Permit the specifically marked admin no-GPS closure in existing private
-- projection and subsequent administrative corrections. No manual employee
-- GPS validation is changed.
DO $patch$
DECLARE d text; before_patch text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)'::pg_catalog.regprocedure);
 before_patch:=d;
 d:=pg_catalog.replace(d,
 $old$OR v_out_geo->>'status'<>'captured' THEN$old$,
 $new$OR (v_out_geo->>'status'<>'captured' AND NOT (
       COALESCE(p_record#>>'{clockOut,reason}','')='admin_manual_clock_out'
       AND COALESCE(v_out_geo->>'status','')='not_captured'
       AND COALESCE(v_out_geo->>'source','')='admin-manual-clockout')) THEN$new$);
 IF d=before_patch THEN RAISE EXCEPTION 'Admin projection GPS baseline differs'; END IF;
 EXECUTE d;

 d:=pg_catalog.pg_get_functiondef('private.tt_attendance_admin_apply_patch(jsonb,jsonb,uuid,uuid)'::pg_catalog.regprocedure);
 before_patch:=d;
 d:=pg_catalog.replace(d,
 $old$OR v_clock_out#>>'{geo,status}'<>'captured') THEN$old$,
 $new$OR (v_clock_out#>>'{geo,status}'<>'captured' AND NOT (
       COALESCE(v_clock_out->>'reason','')='admin_manual_clock_out'
       AND COALESCE(v_clock_out#>>'{geo,status}','')='not_captured'
       AND COALESCE(v_clock_out#>>'{geo,source}','')='admin-manual-clockout'))) THEN$new$);
 IF d=before_patch THEN RAISE EXCEPTION 'Admin edit GPS baseline differs'; END IF;
 EXECUTE d;
END;
$patch$;

CREATE FUNCTION public.timetracker_attendance_admin_clock_out(
 p_board_id uuid,p_record_id uuid,p_clock_out_at timestamptz,
 p_reason text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_owner uuid;
 v_current text;
 v_revision bigint;
 v_next bigint;
 v_state jsonb;
 v_before jsonb;
 v_after jsonb;
 v_rows jsonb;
 v_start timestamptz;
 v_now timestamptz;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
BEGIN
 v_workspace:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor) IS DISTINCT FROM 'System Admin' THEN
  RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501';
 END IF;
 IF p_record_id IS NULL OR p_clock_out_at IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision<1 OR pg_catalog.length(v_reason) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Clock-out timestamp, reason and current revision required' USING ERRCODE='22023';
 END IF;
 SELECT r.elem INTO v_before
 FROM public.module_state_entries e
 CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records') r(elem)
 WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*'
  AND r.elem->>'id'=p_record_id::text;
 IF v_before IS NULL OR COALESCE(v_before->>'ownerId','') !~*
  '^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Attendance record unavailable' USING ERRCODE='PT409';
 END IF;
 v_owner:=pg_catalog.substr(v_before->>'ownerId',7)::uuid;
 -- Same employee lock order as scheduled and employee clock-out.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_workspace::text||':time-tracker:attendance:'||v_owner::text,0));
 SELECT value,revision INTO v_current,v_revision
 FROM public.module_state_entries WHERE workspace_id=v_workspace
  AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*' FOR UPDATE;
 IF NOT FOUND OR v_revision IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'TT_ATTENDANCE_REVISION_CONFLICT' USING ERRCODE='40001';
 END IF;
 v_state:=v_current::jsonb;
 SELECT elem INTO v_before FROM pg_catalog.jsonb_array_elements(v_state->'records') elem
 WHERE elem->>'id'=p_record_id::text AND elem->>'ownerId'='cloud:'||v_owner::text;
 IF v_before IS NULL OR (v_before->'clockOut' IS NOT NULL AND v_before->'clockOut'<>'null'::jsonb) THEN
  RAISE EXCEPTION 'Attendance session is no longer active; refresh Log' USING ERRCODE='PT409';
 END IF;
 v_now:=pg_catalog.clock_timestamp();
 v_start:=(v_before#>>'{clockIn,timestamp}')::timestamptz;
 IF v_start IS NULL OR p_clock_out_at<v_start OR p_clock_out_at>v_now
    OR p_clock_out_at>v_start+INTERVAL '370 days' THEN
  RAISE EXCEPTION 'Clock-out must be within the active session and not in the future' USING ERRCODE='22023';
 END IF;
 v_after:=(v_before-'creditedMsOverride')||pg_catalog.jsonb_build_object(
  'clockOut',pg_catalog.jsonb_build_object(
   'timestamp',pg_catalog.to_char(p_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'location',COALESCE(v_before#>>'{clockIn,location}',''),
   'department',COALESCE(v_before#>>'{clockIn,department}',''),
   'automatic',false,'reason','admin_manual_clock_out',
   'geo',pg_catalog.jsonb_build_object('status','not_captured','source','admin-manual-clockout',
      'recordedBy',v_actor::text,'recordedAt',v_now)),
  'updatedAt',pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 SELECT pg_catalog.jsonb_agg(CASE WHEN elem->>'id'=p_record_id::text THEN v_after ELSE elem END ORDER BY ord)
 INTO v_rows FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY a(elem,ord);
 v_state:=pg_catalog.jsonb_set(v_state,'{records}',v_rows,true);
 IF NOT public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',v_state::text) THEN
  RAISE EXCEPTION 'Manual clock-out violates attendance invariants' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
 VALUES(v_workspace,'time-tracker','timetracker.attendance.v1.backup','shared','*',v_current,1,v_actor,v_now)
 ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
 SET value=EXCLUDED.value,revision=public.module_state_entries.revision+1,updated_by=v_actor,updated_at=v_now;
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1,updated_by=v_actor,updated_at=v_now
 WHERE workspace_id=v_workspace AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*' RETURNING revision INTO v_next;
 IF v_next IS NULL OR v_next<=v_revision THEN RAISE EXCEPTION 'Attendance revision did not advance'; END IF;
 PERFORM private.tt_attendance_admin_sync_projection(p_board_id,v_workspace,v_actor,v_after,v_next);
 INSERT INTO private.tt_attendance_admin_audit(workspace_id,board_id,actor_id,action,record_ids,base_revision,
  committed_revision,before_records,after_records,reason,committed_at)
 VALUES(v_workspace,p_board_id,v_actor,'edit',ARRAY[p_record_id::text],v_revision,v_next,
  pg_catalog.jsonb_build_array(v_before),pg_catalog.jsonb_build_array(v_after),v_reason,v_now);
 RETURN pg_catalog.jsonb_build_object('mode','COMMITTED','contract','tt-attendance-admin-1',
  'actorId',v_actor::text,'workspaceId',v_workspace::text,'boardId',p_board_id::text,
  'action','edit','recordIds',pg_catalog.jsonb_build_array(p_record_id::text),
  'changedCount',1,'deletedCount',0,'baseRevision',v_revision,'revision',v_next,'committedAt',v_now);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_clock_out(uuid,uuid,timestamptz,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_clock_out(uuid,uuid,timestamptz,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
