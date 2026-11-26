-- CP-TT-ADMIN-MANUAL-ATTENDANCE-HYBRID
-- Current-day corrections remain ACTIVE and use the existing employee Clock,
-- asynchronous reconciler and nine-credited-hour worker.
-- Past-day corrections are COMPLETED, audited historical records and are
-- never enrolled in the auto-clockout queue.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

-- Existing admin attendance audits predate request-level idempotency. Add a
-- nullable UUID key without rewriting any historical audit rows.
ALTER TABLE private.tt_attendance_admin_audit
 ADD COLUMN IF NOT EXISTS mutation_id uuid;

DO $preflight$
BEGIN
 IF pg_catalog.to_regprocedure('private.tt_auto_clockout_mode()') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_auto_clockout_threshold(timestamptz)') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_admin_manual_clockin_ready()') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_role_in_workspace(uuid,uuid)') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_is_admin_clockin_evidence(jsonb)') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_board_projection_upsert(uuid,uuid,uuid,jsonb,bigint,text)') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_attendance_admin_create_capability(uuid)') IS NULL
  OR pg_catalog.to_regclass('private.tt_attendance_admin_audit') IS NULL
  OR pg_catalog.to_regclass('private.tt_auto_clockout_sessions') IS NULL
 THEN
  RAISE EXCEPTION 'Hybrid manual attendance prerequisites are missing'
   USING ERRCODE='55000';
 END IF;
 IF private.tt_auto_clockout_mode() NOT IN ('active','suspended') THEN
  RAISE EXCEPTION 'Regular auto-clockout scheduler is invalid; review before applying hybrid attendance'
   USING ERRCODE='55000';
 END IF;
 IF private.tt_admin_manual_clockin_ready()
    IS DISTINCT FROM (private.tt_auto_clockout_mode()='active') THEN
  RAISE EXCEPTION 'Active clock-in readiness does not match regular scheduler mode'
   USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_attribute
  WHERE attrelid='private.tt_attendance_admin_audit'::regclass
   AND attname='mutation_id' AND NOT attisdropped
 ) THEN
  RAISE EXCEPTION 'Immutable attendance audit request identity is unavailable'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- A request UUID is the idempotency key for the historical create RPC.
-- Existing audit IDs are generated UUIDs; abort rather than silently choosing
-- a non-unique key if the deployed table contains an unexpected duplicate.
DO $audit_preflight$
BEGIN
 IF EXISTS (
  SELECT mutation_id FROM private.tt_attendance_admin_audit
  GROUP BY mutation_id HAVING count(*)>1
 ) THEN
  RAISE EXCEPTION 'Duplicate attendance audit mutation IDs require review'
   USING ERRCODE='55000';
 END IF;
END;
$audit_preflight$;
CREATE UNIQUE INDEX IF NOT EXISTS tt_attendance_admin_audit_mutation_id_uidx
 ON private.tt_attendance_admin_audit(mutation_id);

-- Advance the signed handshake. Historical completed corrections do not need
-- the live scheduler; today's ACTIVE session still requires an active scheduler.
CREATE OR REPLACE FUNCTION public.timetracker_attendance_admin_create_capability(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $capability$
DECLARE v_actor uuid:=auth.uid(); v_ws uuid; v_mode text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR private.tt_role_in_workspace(v_actor,v_ws) IS DISTINCT FROM 'System Admin'
 THEN RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501'; END IF;
 v_mode:=private.tt_auto_clockout_mode();
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-admin-attendance-capability-3',
  'actorId',v_actor::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'activeReady',v_mode IS NOT DISTINCT FROM 'active',
  'historicalReady',true,'schedulerMode',v_mode);
END;
$capability$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid)
 TO authenticated;

-- The live path remains a normal employee-owned open session. Add a same-day
-- duplicate guard, without changing the existing scheduler lock or write path.
DO $active_duplicate_guard$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef(
  'public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)'::regprocedure);
 old:='-- An open session or a historical session ending after the proposed start';
 replacement:=$new$IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') r
  WHERE r->>'ownerId'='cloud:'||p_employee_id::text
   AND CASE
    WHEN pg_catalog.pg_input_is_valid(r#>>'{clockIn,timestamp}','timestamp with time zone')
    THEN ((r#>>'{clockIn,timestamp}')::timestamptz AT TIME ZONE 'Asia/Manila')::date
      =(p_clock_in_at AT TIME ZONE 'Asia/Manila')::date
    ELSE true
   END
 ) THEN
  RAISE EXCEPTION 'Attendance already exists for this employee on the selected Philippine date'
   USING ERRCODE='PT409';
 END IF;
 -- An open session or a historical session ending after the proposed start$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual clock-in duplicate-guard baseline differs; refusing an unsafe patch'
   USING ERRCODE='55000';
 END IF;
 EXECUTE pg_catalog.replace(d,old,replacement);
END;
$active_duplicate_guard$;

CREATE FUNCTION public.timetracker_attendance_admin_create_historical(
 p_board_id uuid,
 p_employee_id uuid,
 p_attendance_day date,
 p_clock_in_at timestamptz,
 p_clock_out_at timestamptz,
 p_clock_out_mode text,
 p_location text,
 p_work_note text,
 p_reason text,
 p_expected_revision bigint,
 p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $historical$
DECLARE
 v_actor uuid:=auth.uid();
 v_ws uuid;
 v_name text;
 v_employee_role text;
 v_department text;
 v_now timestamptz;
 v_id uuid:=pg_catalog.gen_random_uuid();
 v_before text;
 v_rev bigint;
 v_next bigint;
 v_state jsonb;
 v_record jsonb;
 v_projection_seed jsonb;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_note text:=NULLIF(pg_catalog.btrim(p_work_note),'');
 v_clock_out_at timestamptz;
 v_method text;
 v_method_label text;
 v_existing private.tt_attendance_admin_audit%ROWTYPE;
 v_existing_record jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR private.tt_role_in_workspace(v_actor,v_ws) IS DISTINCT FROM 'System Admin'
 THEN RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501'; END IF;

 IF p_employee_id IS NULL OR p_attendance_day IS NULL OR NOT pg_catalog.isfinite(p_attendance_day)
  OR p_clock_in_at IS NULL OR NOT pg_catalog.isfinite(p_clock_in_at)
  OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_request_id IS NULL
  OR p_clock_out_mode IS NULL OR p_clock_out_mode NOT IN ('standard','actual')
  OR pg_catalog.length(v_reason) NOT BETWEEN 1 AND 500
  OR pg_catalog.length(COALESCE(v_note,''))>500
  OR p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments')
  OR (p_location='Offsite (Home)' AND v_note IS NULL)
  OR (p_clock_out_mode='standard' AND p_clock_out_at IS NOT NULL)
  OR (p_clock_out_mode='actual' AND
      (p_clock_out_at IS NULL OR NOT pg_catalog.isfinite(p_clock_out_at)))
 THEN RAISE EXCEPTION 'Invalid historical manual attendance input' USING ERRCODE='22023'; END IF;

 -- Serialize duplicate retries first, then use the same employee lock as the
 -- live Clock and automatic worker before touching the shared attendance row.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('tt-admin-historical-attendance:'||p_request_id::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':time-tracker:attendance:'||p_employee_id::text,0));

 v_now:=pg_catalog.clock_timestamp();
 IF p_attendance_day >= (v_now AT TIME ZONE 'Asia/Manila')::date
  OR (p_clock_in_at AT TIME ZONE 'Asia/Manila')::date IS DISTINCT FROM p_attendance_day
  OR p_clock_in_at>v_now
 THEN
  RAISE EXCEPTION 'Historical attendance must be a past Philippine date with a clock-in on that date'
   USING ERRCODE='22023';
 END IF;

 IF p_clock_out_mode='standard' THEN
  -- This is the same authoritative threshold used by the regular auto-clockout
  -- worker: nine credited hours, with the unpaid lunch excluded.
  v_clock_out_at:=private.tt_auto_clockout_threshold(p_clock_in_at);
  v_method:='standard_nine_credited_hours';
  v_method_label:='System-calculated standard (9 credited hours)';
 ELSE
  v_clock_out_at:=p_clock_out_at;
  v_method:='admin_entered_actual';
  v_method_label:='Admin-entered actual clock-out';
 END IF;
 IF v_clock_out_at IS NULL OR NOT pg_catalog.isfinite(v_clock_out_at)
  OR v_clock_out_at<=p_clock_in_at OR v_clock_out_at>v_now
  OR v_clock_out_at>p_clock_in_at+INTERVAL '48 hours'
 THEN
  RAISE EXCEPTION 'Historical clock-out must be after clock-in, already elapsed and within the supported shift window'
   USING ERRCODE='22023';
 END IF;

 SELECT COALESCE(NULLIF(pg_catalog.btrim(p.display_name),''),p.email,'Workforce member'),
  private.tt_role_in_workspace(p.id,v_ws)
 INTO v_name,v_employee_role
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=v_ws AND wm.active
 WHERE p.id=p_employee_id AND p.status='active'
  AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL;
 IF v_name IS NULL OR v_employee_role='OJT'
  OR p_employee_id='d613280d-907b-418f-b872-c0f6dd53e580'::uuid
  OR EXISTS (
   SELECT 1 FROM private.tt_ojt_shared_accounts a
   WHERE a.workspace_id=v_ws AND a.board_id=p_board_id AND a.shared_user_id=p_employee_id
  )
 THEN RAISE EXCEPTION 'Active regular employee required' USING ERRCODE='42501'; END IF;

 SELECT d.department INTO v_department
 FROM private.tt_employee_departments d
 JOIN private.tt_department_catalog c
  ON c.workspace_id=d.workspace_id AND c.name=d.department
 WHERE d.workspace_id=v_ws AND d.user_id=p_employee_id;
 IF v_department IS NULL THEN
  RAISE EXCEPTION 'Verified employee department required' USING ERRCODE='42501';
 END IF;

 SELECT e.value,e.revision INTO v_before,v_rev
 FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative attendance state unavailable' USING ERRCODE='55000'; END IF;
 v_state:=v_before::jsonb;
 IF v_state->>'version' IS DISTINCT FROM '1'
  OR pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array'
  OR pg_catalog.jsonb_array_length(v_state->'records')>=25000
 THEN RAISE EXCEPTION 'Attendance state invalid' USING ERRCODE='22023'; END IF;

 -- A replay returns the original receipt only when the same immutable request
 -- and payload are still present. A reused key or deleted record fails closed.
 SELECT * INTO v_existing FROM private.tt_attendance_admin_audit
 WHERE mutation_id=p_request_id;
 IF FOUND THEN
  IF v_existing.actor_id=v_actor AND v_existing.workspace_id=v_ws
   AND v_existing.board_id=p_board_id AND v_existing.action='create'
   AND v_existing.reason=v_reason AND v_existing.record_ids IS NOT DISTINCT FROM
      ARRAY(SELECT r->>'id' FROM pg_catalog.jsonb_array_elements(v_existing.after_records) r)
  THEN
   SELECT r INTO v_existing_record
   FROM pg_catalog.jsonb_array_elements(v_existing.after_records) r
   WHERE r->>'ownerId'='cloud:'||p_employee_id::text
    AND r#>>'{clockIn,timestamp}'=pg_catalog.to_char(
      p_clock_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND r#>>'{clockOut,timestamp}'=pg_catalog.to_char(
      v_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND r#>>'{clockOut,manualMethod}'=CASE p_clock_out_mode
      WHEN 'standard' THEN 'standard_nine_credited_hours'
      ELSE 'admin_entered_actual' END
    AND r#>>'{clockIn,location}'=p_location
    AND r#>>'{clockIn,workNote}' IS NOT DISTINCT FROM v_note;
   IF v_existing_record IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') current_record
    WHERE current_record->>'id'=v_existing_record->>'id'
     AND current_record->>'ownerId'='cloud:'||p_employee_id::text
   ) THEN
    RETURN pg_catalog.jsonb_build_object(
     'mode','COMMITTED','contract','tt-admin-historical-attendance-1',
     'replayed',true,'actorId',v_actor::text,'workspaceId',v_ws::text,
     'boardId',p_board_id::text,'employeeId',p_employee_id::text,
     'recordId',v_existing_record->>'id','revision',v_existing.committed_revision,
     'clockOutAt',v_existing_record#>>'{clockOut,timestamp}',
     'clockOutMethod',v_existing_record#>>'{clockOut,manualMethod}',
     'committedAt',v_existing.committed_at);
   END IF;
  END IF;
  RAISE EXCEPTION 'Historical attendance request ID was already used; refresh the Log before retrying'
   USING ERRCODE='PT409';
 END IF;

 IF v_rev IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'TT_ATTENDANCE_REVISION_CONFLICT' USING ERRCODE='40001';
 END IF;

 -- One attendance record per employee and Philippine work date. Also reject
 -- every interval overlap, including an open current-day session; a later
 -- active session is allowed when it begins after this historical clock-out.
 IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') r
  WHERE r->>'ownerId'='cloud:'||p_employee_id::text
   AND CASE
    WHEN pg_catalog.pg_input_is_valid(r#>>'{clockIn,timestamp}','timestamp with time zone')
    THEN ((r#>>'{clockIn,timestamp}')::timestamptz AT TIME ZONE 'Asia/Manila')::date
      =p_attendance_day
    ELSE true
   END
 ) THEN
  RAISE EXCEPTION 'Attendance already exists for this employee on the selected Philippine date'
   USING ERRCODE='PT409';
 END IF;
 IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'records') r
  WHERE r->>'ownerId'='cloud:'||p_employee_id::text
   AND CASE
    WHEN pg_catalog.pg_input_is_valid(r#>>'{clockIn,timestamp}','timestamp with time zone')
    THEN (r#>>'{clockIn,timestamp}')::timestamptz<v_clock_out_at
    ELSE true
   END
   AND CASE
    WHEN r->'clockOut' IS NULL OR r->'clockOut'='null'::jsonb THEN true
    WHEN pg_catalog.pg_input_is_valid(r#>>'{clockOut,timestamp}','timestamp with time zone')
    THEN (r#>>'{clockOut,timestamp}')::timestamptz>p_clock_in_at
    ELSE true
   END
 ) THEN
  RAISE EXCEPTION 'Historical attendance overlaps another session for this employee'
   USING ERRCODE='PT409';
 END IF;

 v_record:=pg_catalog.jsonb_build_object(
  'id',v_id::text,'ownerId','cloud:'||p_employee_id::text,'ownerName',v_name,
  'createdAt',pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt',pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'clockIn',pg_catalog.jsonb_build_object(
   'timestamp',pg_catalog.to_char(p_clock_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'location',p_location,'department',v_department,'workNote',v_note,
   'geo',pg_catalog.jsonb_build_object('status','not_captured',
    'source','admin-manual-clockin','recordedBy',v_actor::text,'recordedAt',v_now)),
  'clockOut',pg_catalog.jsonb_build_object(
   'timestamp',pg_catalog.to_char(v_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'location',p_location,'department',v_department,
   'automatic',false,'reason','admin_manual_clock_out',
   'manualMethod',v_method,'manualMethodLabel',v_method_label,
   'geo',pg_catalog.jsonb_build_object('status','not_captured',
    'source','admin-manual-clockout','recordedBy',v_actor::text,'recordedAt',v_now)));

 v_state:=pg_catalog.jsonb_set(v_state,'{records}',
  (v_state->'records')||pg_catalog.jsonb_build_array(v_record),true);
 IF NOT COALESCE(public.module_state_invariants_valid(
  'time-tracker','timetracker.attendance.v1',v_state::text),false)
 THEN RAISE EXCEPTION 'Historical attendance violates attendance invariants' USING ERRCODE='23514'; END IF;

 INSERT INTO public.module_state_entries(
  workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
 VALUES(v_ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',
  v_before,1,v_actor,v_now)
 ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
 SET value=EXCLUDED.value,revision=public.module_state_entries.revision+1,
  updated_by=v_actor,updated_at=v_now;
 UPDATE public.module_state_entries SET value=v_state::text,revision=revision+1,
  updated_by=v_actor,updated_at=v_now
 WHERE workspace_id=v_ws AND module_id='time-tracker'
  AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*'
 RETURNING revision INTO v_next;
 IF v_next IS NULL OR v_next<=v_rev THEN
  RAISE EXCEPTION 'Attendance revision did not advance' USING ERRCODE='55000';
 END IF;

 INSERT INTO private.tt_attendance_admin_audit(
  mutation_id,workspace_id,board_id,actor_id,action,record_ids,
  base_revision,committed_revision,before_records,after_records,reason,committed_at)
 VALUES(p_request_id,v_ws,p_board_id,v_actor,'create',ARRAY[v_id::text],
  v_rev,v_next,'[]'::jsonb,pg_catalog.jsonb_build_array(v_record),v_reason,v_now);

 -- Build the projection row through the existing audited manual clock-in
 -- exception, then finalize it through the already-approved manual clock-out
 -- projection path. Both calls are in this transaction; no ACTIVE state is
 -- externally visible and no scheduler enrollment is written.
 v_projection_seed:=v_record||pg_catalog.jsonb_build_object('clockOut',NULL);
 PERFORM private.tt_board_projection_upsert(
  p_board_id,v_ws,p_employee_id,v_projection_seed,v_next,'clock-in');
 PERFORM private.tt_attendance_admin_sync_projection(
  p_board_id,v_ws,v_actor,v_record,v_next);

 IF EXISTS (
  SELECT 1 FROM private.tt_auto_clockout_sessions
  WHERE workspace_id=v_ws AND board_id=p_board_id AND record_id=v_id
 ) THEN
  RAISE EXCEPTION 'Historical completed attendance must never enter automatic clock-out enrollment'
   USING ERRCODE='55000';
 END IF;

 NOTIFY pgrst,'reload schema';
 RETURN pg_catalog.jsonb_build_object(
  'mode','COMMITTED','contract','tt-admin-historical-attendance-1',
  'replayed',false,'actorId',v_actor::text,'workspaceId',v_ws::text,
  'boardId',p_board_id::text,'employeeId',p_employee_id::text,
  'recordId',v_id::text,'revision',v_next,
  'clockOutAt',pg_catalog.to_char(v_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'clockOutMethod',v_method,'committedAt',v_now);
END;
$historical$;

REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_create_historical(
 uuid,uuid,date,timestamptz,timestamptz,text,text,text,text,bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_create_historical(
 uuid,uuid,date,timestamptz,timestamptz,text,text,text,text,bigint,uuid)
 TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
