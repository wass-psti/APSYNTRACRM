-- TimeTracker dynamic department catalog. Signed, workspace-scoped, auditable.
-- OJT becomes a default department; OJT remains a separate module role.
-- Deleting a department unassigns CURRENT employees, preserves attendance history.
-- All catalog and assignment mutations serialize through the workspace revision.
BEGIN;

ALTER TABLE private.tt_employee_departments
 DROP CONSTRAINT IF EXISTS tt_employee_departments_department_check;
ALTER TABLE private.tt_employee_department_audit
 ALTER COLUMN department DROP NOT NULL;

CREATE TABLE private.tt_department_catalog_state (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 initialized_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.tt_department_catalog_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_department_catalog_state FROM PUBLIC,anon,authenticated;

CREATE TABLE private.tt_department_catalog (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(name)) BETWEEN 2 AND 60),
 created_by uuid REFERENCES public.profiles(id),
 changed_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 UNIQUE (workspace_id,id)
);
CREATE UNIQUE INDEX tt_department_catalog_unique_name
 ON private.tt_department_catalog (workspace_id,pg_catalog.lower(name));
ALTER TABLE private.tt_department_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_department_catalog FROM PUBLIC,anon,authenticated;

CREATE TABLE private.tt_department_catalog_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 department_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('add','rename','delete')),
 previous_name text,
 name text,
 affected_employees integer NOT NULL CHECK (affected_employees>=0),
 revision bigint NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.tt_department_catalog_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_department_catalog_audit FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tt_department_catalog_audit_immutable BEFORE UPDATE OR DELETE
 ON private.tt_department_catalog_audit FOR EACH ROW
 EXECUTE FUNCTION private.tt_employee_department_audit_immutable();

-- First initialization per workspace is atomic and never repeats deleted defaults.
CREATE FUNCTION private.tt_department_catalog_init(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $init$
BEGIN
 INSERT INTO private.tt_department_catalog_state(workspace_id)
 VALUES(p_workspace_id) ON CONFLICT(workspace_id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO private.tt_department_catalog(workspace_id,name)
   SELECT p_workspace_id,v.name FROM (VALUES
    ('HR'),('Materials and Logistics'),('Engineering'),
    ('Finance and Accounting'),('Sales and Marketing'),
    ('Information Technology'),('General Administration'),('OJT')
   ) AS v(name)
   WHERE true
  ON CONFLICT DO NOTHING;
  -- Preserve any current legacy mapping even if it differs from defaults.
  INSERT INTO private.tt_department_catalog(workspace_id,name)
   SELECT p_workspace_id,d.department FROM (
    SELECT DISTINCT department FROM private.tt_employee_departments
    WHERE workspace_id=p_workspace_id
   ) AS d
   WHERE NOT EXISTS (
    SELECT 1 FROM private.tt_department_catalog c
    WHERE c.workspace_id=p_workspace_id
      AND pg_catalog.lower(c.name)=pg_catalog.lower(d.department)
   )
  ON CONFLICT DO NOTHING;
 END IF;
END;
$init$;
REVOKE ALL ON FUNCTION private.tt_department_catalog_init(uuid)
 FROM PUBLIC,anon,authenticated;

-- Existing workspaces with assigned people stay clock-enabled after deployment.
DO $seed$
DECLARE v_ws uuid;
BEGIN
 FOR v_ws IN SELECT DISTINCT workspace_id FROM private.tt_employee_departments LOOP
  PERFORM private.tt_department_catalog_init(v_ws);
 END LOOP;
END;
$seed$;

CREATE FUNCTION public.timetracker_department_catalog_snapshot(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;v_revision bigint;v_rows jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor)
    NOT IN ('System Admin','IT Administrator')
    OR public.module_role_for('time-tracker',v_actor) IS NULL THEN
  RAISE EXCEPTION 'TimeTracker department management denied' USING ERRCODE='42501';
 END IF;
 PERFORM private.tt_department_catalog_init(v_ws);
 SELECT revision INTO v_revision FROM private.tt_department_catalog_state
  WHERE workspace_id=v_ws;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',c.id::text,'name',c.name,
  'assignedCount',(SELECT pg_catalog.count(*) FROM private.tt_employee_departments d
   WHERE d.workspace_id=v_ws AND d.department=c.name)
  ) ORDER BY pg_catalog.lower(c.name)),'[]'::jsonb)
 INTO v_rows FROM private.tt_department_catalog c WHERE c.workspace_id=v_ws;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-catalog-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'revision',v_revision,'departments',v_rows);
END;
$read$;
REVOKE ALL ON FUNCTION public.timetracker_department_catalog_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_department_catalog_snapshot(uuid)
 TO authenticated;

CREATE FUNCTION public.timetracker_department_catalog_mutate(
 p_board_id uuid,p_action text,p_department_id uuid,p_name text,
 p_expected_revision bigint,p_expected_count integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mutate$
DECLARE
 v_actor uuid:=auth.uid();v_ws uuid;v_revision bigint;
 v_id uuid;v_old text;v_name text;v_count integer:=0;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor)
    NOT IN ('System Admin','IT Administrator')
    OR public.module_role_for('time-tracker',v_actor) IS NULL THEN
  RAISE EXCEPTION 'TimeTracker department management denied' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('add','rename','delete') OR p_action IS NULL THEN
  RAISE EXCEPTION 'Unsupported department action' USING ERRCODE='22023';
 END IF;
 PERFORM private.tt_department_catalog_init(v_ws);
 SELECT revision INTO v_revision FROM private.tt_department_catalog_state
  WHERE workspace_id=v_ws FOR UPDATE;
 IF v_revision IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'TT_DEPARTMENT_REVISION_CONFLICT expected %, current %',
    p_expected_revision,v_revision USING ERRCODE='40001';
 END IF;
 IF p_action IN ('add','rename') THEN
  v_name:=pg_catalog.btrim(COALESCE(p_name,''));
  IF pg_catalog.length(v_name) NOT BETWEEN 2 AND 60 OR
     v_name ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Department name must contain 2 to 60 valid characters'
    USING ERRCODE='22023';
  END IF;
 END IF;
 IF p_action='add' THEN
  IF p_department_id IS NOT NULL THEN
   RAISE EXCEPTION 'New department ID must be omitted' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.tt_department_catalog(workspace_id,name,created_by,changed_by)
   VALUES(v_ws,v_name,v_actor,v_actor) RETURNING id INTO v_id;
 ELSE
  IF p_department_id IS NULL THEN
   RAISE EXCEPTION 'Department ID is required' USING ERRCODE='22023';
  END IF;
  SELECT id,name INTO v_id,v_old FROM private.tt_department_catalog
   WHERE workspace_id=v_ws AND id=p_department_id FOR UPDATE;
  IF v_id IS NULL THEN
   RAISE EXCEPTION 'Department no longer exists; refresh the list'
    USING ERRCODE='P0002';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_count FROM private.tt_employee_departments
   WHERE workspace_id=v_ws AND department=v_old;
  IF p_action='rename' THEN
   IF v_name=v_old THEN
    RAISE EXCEPTION 'Enter a different department name' USING ERRCODE='22023';
   END IF;
   -- Preserve current assignments and record a per-employee rename audit.
   INSERT INTO private.tt_employee_department_audit(
     workspace_id,target_user_id,changed_by,previous_department,department)
    SELECT v_ws,d.user_id,v_actor,v_old,v_name
    FROM private.tt_employee_departments d
    WHERE d.workspace_id=v_ws AND d.department=v_old;
   UPDATE private.tt_employee_departments
    SET department=v_name,changed_by=v_actor,updated_at=pg_catalog.clock_timestamp()
    WHERE workspace_id=v_ws AND department=v_old;
   UPDATE private.tt_department_catalog SET name=v_name,changed_by=v_actor,
    updated_at=pg_catalog.clock_timestamp() WHERE id=v_id AND workspace_id=v_ws;
  ELSIF p_action='delete' THEN
   IF p_expected_count IS NULL OR p_expected_count<>v_count THEN
    RAISE EXCEPTION 'TT_DEPARTMENT_ASSIGNMENT_COUNT_CHANGED: refresh and confirm again'
     USING ERRCODE='40001';
   END IF;
   -- Explicit confirmation unassigns affected employees; history stays unchanged.
   INSERT INTO private.tt_employee_department_audit(
     workspace_id,target_user_id,changed_by,previous_department,department)
    SELECT v_ws,d.user_id,v_actor,v_old,NULL
    FROM private.tt_employee_departments d
    WHERE d.workspace_id=v_ws AND d.department=v_old;
   DELETE FROM private.tt_employee_departments
    WHERE workspace_id=v_ws AND department=v_old;
   DELETE FROM private.tt_department_catalog
    WHERE id=v_id AND workspace_id=v_ws;
  END IF;
 END IF;
 UPDATE private.tt_department_catalog_state SET revision=revision+1
  WHERE workspace_id=v_ws RETURNING revision INTO v_revision;
 INSERT INTO private.tt_department_catalog_audit(
  workspace_id,actor_id,department_id,action,previous_name,name,
  affected_employees,revision)
 VALUES(v_ws,v_actor,v_id,p_action,v_old,
  CASE WHEN p_action='delete' THEN NULL ELSE v_name END,v_count,v_revision);
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-catalog-mutate-1','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'action',p_action,'departmentId',v_id::text,
  'revision',v_revision,'affectedEmployees',v_count);
END;
$mutate$;
REVOKE ALL ON FUNCTION public.timetracker_department_catalog_mutate(
 uuid,text,uuid,text,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_department_catalog_mutate(
 uuid,text,uuid,text,bigint,integer) TO authenticated;

-- The existing assignment write now checks the mutable catalog, not a constant array.
CREATE OR REPLACE FUNCTION public.timetracker_employee_department_set(
 p_board_id uuid,p_target_user_id uuid,p_department text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $set$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;v_before text;v_updated timestamptz;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor)
    NOT IN ('System Admin','IT Administrator')
    OR public.module_role_for('time-tracker',v_actor) IS NULL THEN
   RAISE EXCEPTION 'TimeTracker employee department administration denied'
    USING ERRCODE='42501';
 END IF;
 IF p_target_user_id IS NULL OR p_department IS NULL THEN
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
 PERFORM private.tt_department_catalog_init(v_ws);
 -- Serialize assignments with rename/delete and invalidate stale warning counts.
 PERFORM 1 FROM private.tt_department_catalog_state
  WHERE workspace_id=v_ws FOR UPDATE;
 PERFORM 1 FROM private.tt_department_catalog
  WHERE workspace_id=v_ws AND name=p_department FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Department is not in the current catalog' USING ERRCODE='22023';
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
  UPDATE private.tt_department_catalog_state SET revision=revision+1
    WHERE workspace_id=v_ws;
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

-- The original attendance write still verifies GPS, scope and module access.
-- Only validation of the department's current catalog membership is adjusted.
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

COMMIT;
