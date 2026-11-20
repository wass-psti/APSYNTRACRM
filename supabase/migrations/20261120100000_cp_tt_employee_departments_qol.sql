-- TimeTracker employee department identity — staged migration.
-- Scope is one signed workspace; screenshots do not grant access or seed staff.
-- ADMIN PRECONDITION: provision reviewed one-department-per-person mapping
-- before enabling the updated Clock UI in production.
CREATE TABLE private.tt_employee_departments (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN (
    'HR','Materials and Logistics','Engineering','Finance and Accounting',
    'Sales and Marketing','Information Technology','General Administration')),
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (workspace_id,user_id)
);
ALTER TABLE private.tt_employee_departments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_employee_departments FROM PUBLIC,anon,authenticated;
CREATE TABLE private.tt_employee_department_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  target_user_id uuid NOT NULL REFERENCES public.profiles(id),
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  previous_department text,
  department text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.tt_employee_department_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_employee_department_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.tt_employee_department_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$ BEGIN RAISE EXCEPTION 'Department audit is append-only' USING ERRCODE='55000'; END $$;
REVOKE ALL ON FUNCTION private.tt_employee_department_audit_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tt_employee_department_audit_immutable BEFORE UPDATE OR DELETE
 ON private.tt_employee_department_audit FOR EACH ROW
 EXECUTE FUNCTION private.tt_employee_department_audit_immutable();

-- Employees can read only their OWN department, verified against the
-- current signed TimeTracker board and module assignment.
CREATE FUNCTION public.timetracker_employee_department_for_clock(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;v_department text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor) IS NULL THEN
   RAISE EXCEPTION 'Signed TimeTracker membership required' USING ERRCODE='42501';
 END IF;
 SELECT d.department INTO v_department FROM private.tt_employee_departments d
  WHERE d.workspace_id=v_ws AND d.user_id=v_actor;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'department',v_department);
END;
$read$;
REVOKE ALL ON FUNCTION public.timetracker_employee_department_for_clock(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_employee_department_for_clock(uuid)
 TO authenticated;

-- Explicit administrator-only assignment. CEO bootstrap and verified TimeTracker
-- IT/System administrators share the ability to maintain these department records.
-- This DOES NOT change platform roles, unrelated module permissions or CEO/IT
-- effective authorization elsewhere in APSYNTRA CRM.
CREATE FUNCTION public.timetracker_employee_department_set(
 p_board_id uuid,p_target_user_id uuid,p_department text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $set$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;v_before text;v_updated timestamptz;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR NOT (public.apsyntra_role_is_bootstrap() OR
    public.module_role_for('time-tracker',v_actor)
      IN ('System Admin','IT Administrator')) THEN
   RAISE EXCEPTION 'TimeTracker employee department administration denied' USING ERRCODE='42501';
 END IF;
 IF p_department IS NULL OR p_department NOT IN
    ('HR','Materials and Logistics','Engineering','Finance and Accounting',
     'Sales and Marketing','Information Technology','General Administration')
   OR p_target_user_id IS NULL THEN
   RAISE EXCEPTION 'Invalid department or employee' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.workspace_members m
   JOIN public.profiles p ON p.id=m.user_id
   WHERE m.workspace_id=v_ws AND m.user_id=p_target_user_id AND m.active
     AND p.status='active'
 ) OR public.module_role_for('time-tracker',p_target_user_id) IS NULL THEN
   RAISE EXCEPTION 'Target must be an active TimeTracker workspace member'
    USING ERRCODE='42501';
 END IF;
 SELECT department INTO v_before FROM private.tt_employee_departments
  WHERE workspace_id=v_ws AND user_id=p_target_user_id FOR UPDATE;
 IF v_before IS DISTINCT FROM p_department THEN
  v_updated:=pg_catalog.clock_timestamp();
  INSERT INTO private.tt_employee_departments
    (workspace_id,user_id,department,changed_by,updated_at)
  VALUES (v_ws,p_target_user_id,p_department,v_actor,v_updated)
  ON CONFLICT(workspace_id,user_id) DO UPDATE SET
    department=EXCLUDED.department,changed_by=EXCLUDED.changed_by,
    updated_at=EXCLUDED.updated_at;
  INSERT INTO private.tt_employee_department_audit
    (workspace_id,target_user_id,changed_by,previous_department,department)
  VALUES (v_ws,p_target_user_id,v_actor,v_before,p_department);
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-set-1','workspaceId',v_ws::text,
  'actorId',v_actor::text,'targetUserId',p_target_user_id::text,
  'department',p_department,'changed',v_before IS DISTINCT FROM p_department);
END;
$set$;
REVOKE ALL ON FUNCTION public.timetracker_employee_department_set(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_employee_department_set(uuid,uuid,text)
 TO authenticated;

-- Keep the existing atomic write RPC and audit/clock-out implementation,
-- adding ONLY the authoritative department assertion for new clock-ins.
CREATE OR REPLACE FUNCTION public.timetracker_attendance_commit_v2(
 p_board_id uuid, p_action text, p_record_id text, p_location text,
 p_department text, p_geo jsonb, p_work_note text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $write$
DECLARE
  v_user uuid:=auth.uid();
  v_ws uuid;
  v_role text;
  v_note text:=NULLIF(pg_catalog.btrim(p_work_note),'');
  v_fix_time timestamptz;
  v_receipt jsonb;
  v_record_id text;
  v_revision bigint;
  v_stamp timestamptz;
  v_authoritative_department text;
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_user);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Current TimeTracker role required' USING ERRCODE='42501';
  END IF;
  -- Server-owned department mapping is mandatory for NEW clock-ins only.
  -- Clock-outs retain the department on their existing signed record.
  IF p_action='clock-in' THEN
    SELECT d.department INTO v_authoritative_department
    FROM private.tt_employee_departments d
    WHERE d.workspace_id=v_ws AND d.user_id=v_user;
    IF v_authoritative_department IS NULL
       OR p_department IS DISTINCT FROM v_authoritative_department THEN
      RAISE EXCEPTION 'Verified employee department missing or changed' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_action NOT IN ('clock-in','clock-out') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Unsupported attendance action' USING ERRCODE='22023';
  END IF;
  IF p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments') OR
    p_department IS NULL OR p_department NOT IN (
    'HR','Materials and Logistics','Engineering','Finance and Accounting',
    'Sales and Marketing','Information Technology','General Administration') THEN
    RAISE EXCEPTION 'Attendance work location or department invalid' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.length(COALESCE(v_note,''))>500 THEN
    RAISE EXCEPTION 'Work note exceeds 500 characters' USING ERRCODE='22023';
  END IF;
  IF p_location='Offsite (Home)' AND v_role<>'System Admin' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Offsite Work Note is mandatory' USING ERRCODE='22023';
  END IF;
  IF p_action='clock-out' AND
    (p_record_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_record_id)) NOT BETWEEN 1 AND 150) THEN
    RAISE EXCEPTION 'Active attendance record id required' USING ERRCODE='22023';
  END IF;

  IF p_geo IS NULL OR pg_catalog.jsonb_typeof(p_geo)<>'object' OR
    p_geo->>'status'<>'captured' OR p_geo->>'source'<>'browser-geolocation' OR
    COALESCE(p_geo->>'latitude','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'longitude','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'accuracy','') !~ '^[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'capturedAt','') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION 'Fresh browser GPS evidence required' USING ERRCODE='22023';
  END IF;
  IF (p_geo->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR
    (p_geo->>'longitude')::numeric NOT BETWEEN -180 AND 180 OR
    (p_geo->>'accuracy')::numeric NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'GPS coordinates or accuracy invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_fix_time:=(p_geo->>'capturedAt')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'GPS capture time invalid' USING ERRCODE='22023';
  END;
  IF v_fix_time IS NULL OR
    v_fix_time < pg_catalog.clock_timestamp() - INTERVAL '10 minutes' OR
    v_fix_time > pg_catalog.clock_timestamp() + INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'GPS fix is expired or in the future' USING ERRCODE='22023';
  END IF;

  -- Existing raw engine owns serialized, per-actor mutations, state integrity,
  -- revision increments and recovery copy. Audit insert is in that SAME transaction.
  v_receipt:=public.timetracker_commit_attendance_raw_gps03(
    p_action,p_record_id,p_location,p_department,p_geo,v_note,
    pg_catalog.jsonb_build_object('version','1.0',
      'standardClockInMinutes',480,'unpaidBreakStartMinutes',720,
      'unpaidBreakEndMinutes',780,'requiredWorkMs',32400000)
  );
  IF pg_catalog.jsonb_typeof(v_receipt)<>'object' OR
     v_receipt->>'state_key'<>'timetracker.attendance.v1' OR
     v_receipt->>'action'<>p_action OR
     pg_catalog.jsonb_typeof(v_receipt->'record')<>'object' OR
     v_receipt #>> '{record,ownerId}'<>'cloud:'||v_user::text OR
     (v_receipt->>'revision') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Attendance write receipt contract invalid' USING ERRCODE='22023';
  END IF;
  v_revision:=(v_receipt->>'revision')::bigint;
  v_record_id:=v_receipt #>> '{record,id}';
  v_stamp:=(v_receipt->>'committed_at')::timestamptz;
  IF v_record_id IS NULL OR pg_catalog.length(v_record_id) NOT BETWEEN 1 AND 150
     OR v_stamp IS NULL THEN
    RAISE EXCEPTION 'Attendance write receipt identity invalid' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.timetracker_attendance_mutation_audit(
    workspace_id,board_id,actor_id,record_id,action,revision,
    committed_at,offsite_note_supplied)
  VALUES(v_ws,p_board_id,v_user,v_record_id,p_action,v_revision,
    v_stamp,(p_location='Offsite (Home)' AND v_note IS NOT NULL));

  -- An allowlisted return, not the raw serialized attendance state or GPS fix.
  RETURN pg_catalog.jsonb_build_object(
    'mode','COMMITTED','contract','tt-attendance-1',
    'actorId',v_user::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'action',p_action,'recordId',v_record_id,
    'revision',v_revision,'committedAt',v_stamp);
END;
$write$;

