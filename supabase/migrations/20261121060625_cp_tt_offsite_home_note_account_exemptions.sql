-- CP-TT-OFFSITE-HOME-01: signed account-specific Home note requirement.
-- Controlled replacement of the verified existing v2 RPC; no table, grant or role changes.
BEGIN;
DO $gate$
DECLARE v_definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)'::pg_catalog.regprocedure)
 INTO v_definition;
 IF v_definition IS NULL OR pg_catalog.md5(v_definition)<>'054e92372e8139441fe7064eda4939da' OR
   pg_catalog.strpos(v_definition,'tt_board_projection_upsert')=0 OR
   pg_catalog.strpos(v_definition,'timetracker_commit_attendance_raw_gps03')=0 THEN
   RAISE EXCEPTION 'TimeTracker attendance RPC differs from verified baseline; no replacement performed';
 END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.timetracker_attendance_commit_v2(
 p_board_id uuid, p_action text, p_record_id text, p_location text,
 p_department text, p_geo jsonb, p_work_note text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $write$
DECLARE
  v_user uuid:=auth.uid();
  v_ws uuid;
  v_role text;
  v_actor_email text;
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
  -- Exemptions follow the authenticated account, not the TimeTracker role or form input.
  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_actor_email
  FROM auth.users u WHERE u.id=v_user;
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
       OR p_department IS DISTINCT FROM v_authoritative_department
       OR NOT EXISTS (
          SELECT 1 FROM private.tt_department_catalog c
          WHERE c.workspace_id=v_ws AND c.name=v_authoritative_department
       ) THEN
      RAISE EXCEPTION 'Verified employee department missing or changed' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_action NOT IN ('clock-in','clock-out') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Unsupported attendance action' USING ERRCODE='22023';
  END IF;
  IF p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments') OR
    p_department IS NULL OR
    pg_catalog.length(pg_catalog.btrim(p_department)) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Attendance work location or department invalid' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.length(COALESCE(v_note,''))>500 THEN
    RAISE EXCEPTION 'Work note exceeds 500 characters' USING ERRCODE='22023';
  END IF;
  IF p_action='clock-in' AND p_location='Offsite (Home)' AND v_note IS NULL
     AND (v_actor_email IS NULL OR v_actor_email NOT IN (
       'asenagan@watchdogautomation.com.ph',
       'mvasquez@watchdogautomation.com.ph')) THEN
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

  -- CP-TT-AUTO-CLOCKOUT-02B: restore atomic projection and Board synchronization.
  -- Roll back state, audit and projected Board write together on any error.
  PERFORM private.tt_board_projection_upsert(
    p_board_id,v_ws,v_user,v_receipt->'record',v_revision,p_action);

  -- An allowlisted return, not the raw serialized attendance state or GPS fix.
  RETURN pg_catalog.jsonb_build_object(
    'mode','COMMITTED','contract','tt-attendance-1',
    'actorId',v_user::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'action',p_action,'recordId',v_record_id,
    'revision',v_revision,'committedAt',v_stamp);
END;
$write$;

-- Preserve existing function EXECUTE privileges and atomic write contract.
COMMIT;
