-- CP-TT-ADMIN-MANUAL-CLOCKIN: regular employee, same-day active entry.
-- No production scheduler activation, no synthetic GPS, no history rewrite.
BEGIN;

ALTER TABLE private.tt_attendance_admin_audit
 DROP CONSTRAINT tt_attendance_admin_audit_action_check,
 ADD CONSTRAINT tt_attendance_admin_audit_action_check
 CHECK (action IN ('edit','bulk-edit','delete','bulk-delete','create'));

-- Only evidence backed by the immutable creation audit can use the new
-- projection exception. Employee-supplied clock-in GPS remains mandatory.
CREATE FUNCTION private.tt_is_admin_clockin_evidence(p_record jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$
 SELECT COALESCE(
  p_record#>>'{clockIn,geo,status}'='not_captured'
  AND p_record#>>'{clockIn,geo,source}'='admin-manual-clockin'
  AND NOT (p_record#>'{clockIn,geo}' ?| ARRAY['latitude','longitude','accuracy'])
  AND EXISTS (
   SELECT 1 FROM private.tt_attendance_admin_audit a
   CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(a.after_records) r
   WHERE a.action='create' AND a.record_ids=ARRAY[p_record->>'id']
    AND r->>'ownerId'=p_record->>'ownerId'
    AND r#>'{clockIn,geo}'=p_record#>'{clockIn,geo}'
    AND a.actor_id::text=p_record#>>'{clockIn,geo,recordedBy}'
  ),false);
$f$;
REVOKE ALL ON FUNCTION private.tt_is_admin_clockin_evidence(jsonb)
 FROM PUBLIC,anon,authenticated;

-- Require the existing projection semantics, tolerating coordinate whitespace only. A mismatch aborts the
-- migration rather than replacing a newer employee attendance implementation.
DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_catalog.pg_get_functiondef(
  'private.tt_board_projection_upsert(uuid,uuid,uuid,jsonb,bigint,text)'::pg_catalog.regprocedure);
 n:=pg_catalog.replace(d,
  $old$p_record#>>'{clockIn,geo,status}'<>'captured' THEN$old$,
  $new$(p_record#>>'{clockIn,geo,status}'<>'captured'
   AND NOT private.tt_is_admin_clockin_evidence(p_record)) THEN$new$);
 IF n=d THEN RAISE EXCEPTION 'Employee projection GPS baseline differs'; END IF;
 d:=n;
 -- Match exactly one coordinate guard, tolerating formatting only.
 IF pg_catalog.regexp_count(d,
  $old$IF[[:space:]]+v_clock_in[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'latitude'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'longitude'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'accuracy'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN$old$)<>1
 THEN RAISE EXCEPTION 'Employee projection coordinate baseline differs'; END IF;
 n:=pg_catalog.regexp_replace(d,
  $old$IF[[:space:]]+v_clock_in[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'latitude'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'longitude'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+OR[[:space:]]+v_in_geo->>'accuracy'[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN$old$,
  $new$IF v_clock_in IS NULL OR (
    (v_in_geo->>'latitude' IS NULL OR v_in_geo->>'longitude' IS NULL
      OR v_in_geo->>'accuracy' IS NULL)
    AND NOT private.tt_is_admin_clockin_evidence(p_record)) THEN$new$);
 IF n=d THEN RAISE EXCEPTION 'Employee projection coordinate baseline differs'; END IF;
 EXECUTE n;

 d:=pg_catalog.pg_get_functiondef(
  'private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)'::pg_catalog.regprocedure);
 n:=pg_catalog.replace(d,
  $old$OR v_in_geo->>'status'<>'captured' THEN$old$,
  $new$OR (v_in_geo->>'status'<>'captured'
   AND NOT private.tt_is_admin_clockin_evidence(p_record)) THEN$new$);
 IF n=d THEN RAISE EXCEPTION 'Admin projection GPS baseline differs'; END IF;
 EXECUTE n;
END;
$patch$;

-- During the November 25 incident, only enable manual entry while the
-- faulty regular scheduler AND enrollment trigger are suspended.
-- The permanent scheduler repair must replace this temporary release gate
-- after testing its enrollment and lock ordering with administrative entries.
CREATE FUNCTION private.tt_admin_manual_clockin_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$
 SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgrelid='public.module_state_entries'::pg_catalog.regclass
    AND tgname='tt_auto_clockout_sync' AND tgenabled='D'
 ) AND EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='tt-auto-clockout-processor'
 ) AND NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='tt-auto-clockout-processor' AND active
 );
$f$;
REVOKE ALL ON FUNCTION private.tt_admin_manual_clockin_ready() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.timetracker_attendance_admin_create_capability(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_actor uuid:=auth.uid(); v_ws uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor) IS DISTINCT FROM 'System Admin'
 THEN RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-admin-clockin-capability-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'ready',private.tt_admin_manual_clockin_ready());
END;
$f$;

CREATE FUNCTION public.timetracker_attendance_admin_create(
 p_board_id uuid,p_employee_id uuid,p_clock_in_at timestamptz,
 p_location text,p_work_note text,p_reason text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_actor uuid:=auth.uid(); v_ws uuid; v_name text; v_department text;
 v_now timestamptz; v_id uuid:=pg_catalog.gen_random_uuid();
 v_before text; v_rev bigint; v_next bigint; v_state jsonb; v_record jsonb;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_note text:=NULLIF(pg_catalog.btrim(p_work_note),'');
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor) IS DISTINCT FROM 'System Admin'
 THEN RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501'; END IF;
 IF NOT private.tt_admin_manual_clockin_ready()
 THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;
 IF p_employee_id IS NULL OR p_clock_in_at IS NULL OR NOT pg_catalog.isfinite(p_clock_in_at)
  OR p_expected_revision IS NULL OR p_expected_revision<1
  OR pg_catalog.length(v_reason) NOT BETWEEN 1 AND 500
  OR pg_catalog.length(COALESCE(v_note,''))>500
  OR p_location IS NULL OR p_location NOT IN ('Office-Base Duty','Offsite (Home)',
    'Local Field Works','Out of Town Assignment','International Field Assignments')
  OR (p_location='Offsite (Home)' AND v_note IS NULL)
 THEN RAISE EXCEPTION 'Invalid manual attendance input' USING ERRCODE='22023'; END IF;
 -- Employee lock precedes shared attendance row lock, as in employee commits.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':time-tracker:attendance:'||p_employee_id::text,0));
 v_now:=pg_catalog.clock_timestamp();
 IF p_clock_in_at>v_now OR
  (p_clock_in_at AT TIME ZONE 'Asia/Manila')::date<>(v_now AT TIME ZONE 'Asia/Manila')::date
 THEN RAISE EXCEPTION 'Active manual clock-in must be today in Philippine time' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(NULLIF(pg_catalog.btrim(p.display_name),''),p.email,'Workforce member')
 INTO v_name FROM public.profiles p JOIN public.workspace_members wm
  ON wm.user_id=p.id AND wm.workspace_id=v_ws AND wm.active
 WHERE p.id=p_employee_id AND p.status='active'
  AND public.has_module_access('time-tracker',p.id)
  AND public.module_role_for('time-tracker',p.id) IS NOT NULL;
 IF v_name IS NULL OR p_employee_id='d613280d-907b-418f-b872-c0f6dd53e580'::uuid
  OR EXISTS (SELECT 1 FROM private.tt_ojt_shared_accounts a
   WHERE a.workspace_id=v_ws AND a.board_id=p_board_id AND a.shared_user_id=p_employee_id)
 THEN RAISE EXCEPTION 'Active regular employee required' USING ERRCODE='42501'; END IF;
 SELECT d.department INTO v_department FROM private.tt_employee_departments d
 WHERE d.workspace_id=v_ws AND d.user_id=p_employee_id;
 IF v_department IS NULL OR NOT EXISTS (SELECT 1 FROM private.tt_department_catalog c
  WHERE c.workspace_id=v_ws AND c.name=v_department)
 THEN RAISE EXCEPTION 'Verified employee department required' USING ERRCODE='42501'; END IF;

 SELECT e.value,e.revision INTO v_before,v_rev FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*' FOR UPDATE;
 IF NOT FOUND OR v_rev IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'TT_ATTENDANCE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 v_state:=v_before::jsonb;
 IF v_state->>'version' IS DISTINCT FROM '1' OR
  pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array'
  OR pg_catalog.jsonb_array_length(v_state->'records')>=25000
 THEN RAISE EXCEPTION 'Attendance state invalid' USING ERRCODE='22023'; END IF;
 -- An open session or a historical session ending after the proposed start
 -- would overlap this new ongoing session. Reject rather than replace it.
 IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') r
  WHERE r->>'ownerId'='cloud:'||p_employee_id::text
   AND (r->'clockOut' IS NULL OR r->'clockOut'='null'::jsonb
    OR NULLIF(r#>>'{clockOut,timestamp}','')::timestamptz IS NULL
    OR (r#>>'{clockOut,timestamp}')::timestamptz>p_clock_in_at))
 THEN RAISE EXCEPTION 'Employee already has an active or overlapping attendance session' USING ERRCODE='PT409'; END IF;

 v_record:=pg_catalog.jsonb_build_object(
  'id',v_id::text,'ownerId','cloud:'||p_employee_id::text,'ownerName',v_name,
  'createdAt',pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt',pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'clockIn',pg_catalog.jsonb_build_object(
   'timestamp',pg_catalog.to_char(p_clock_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'location',p_location,'department',v_department,'workNote',v_note,
   'geo',pg_catalog.jsonb_build_object('status','not_captured',
    'source','admin-manual-clockin','recordedBy',v_actor::text,'recordedAt',v_now)),
  'clockOut',NULL);
 v_state:=pg_catalog.jsonb_set(v_state,'{records}',
  (v_state->'records')||pg_catalog.jsonb_build_array(v_record),true);
 IF NOT COALESCE(public.module_state_invariants_valid(
  'time-tracker','timetracker.attendance.v1',v_state::text),false)
 THEN RAISE EXCEPTION 'Manual clock-in violates attendance invariants' USING ERRCODE='23514'; END IF;

 INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
 VALUES(v_ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',v_before,1,v_actor,v_now)
 ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
 SET value=EXCLUDED.value,revision=public.module_state_entries.revision+1,updated_by=v_actor,updated_at=v_now;
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1,updated_by=v_actor,updated_at=v_now
 WHERE workspace_id=v_ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*' RETURNING revision INTO v_next;
 IF v_next IS NULL OR v_next<=v_rev THEN RAISE EXCEPTION 'Attendance revision did not advance'; END IF;
 INSERT INTO private.tt_attendance_admin_audit(workspace_id,board_id,actor_id,action,record_ids,
  base_revision,committed_revision,before_records,after_records,reason,committed_at)
 VALUES(v_ws,p_board_id,v_actor,'create',ARRAY[v_id::text],v_rev,v_next,
  '[]'::jsonb,pg_catalog.jsonb_build_array(v_record),v_reason,v_now);
 PERFORM private.tt_board_projection_upsert(p_board_id,v_ws,p_employee_id,v_record,v_next,'clock-in');
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-admin-clockin-1','mode','COMMITTED','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,'employeeId',p_employee_id::text,
  'recordId',v_id::text,'revision',v_next,'committedAt',v_now);
END;
$f$;

REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
