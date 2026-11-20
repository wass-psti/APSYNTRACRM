-- TimeTracker employees: centralized departments + restricted timestamp corrections.
-- Existing functions are replaced without modifying their historical migration files.
-- System Admin retains full attendance record management; IT Administrator is
-- limited to individual time-only corrections (reason required for both roles).
BEGIN;

-- Bootstrap-only signed department directory for TimeTracker Team management.
-- Depends on 20261120100000_cp_tt_employee_departments_qol.sql.
CREATE OR REPLACE FUNCTION public.timetracker_employee_department_directory_snapshot(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR NOT (
    COALESCE(public.apsyntra_role_is_bootstrap(),FALSE) OR
    COALESCE(public.module_role_for('time-tracker',v_actor)
      IN ('System Admin','IT Administrator'),FALSE)
   ) THEN
  RAISE EXCEPTION 'Bootstrap TimeTracker department directory access denied' USING ERRCODE='42501';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-directory-1',
  'actorId',v_actor::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'assignments',COALESCE((
   SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('userId',d.user_id::text,
     'department',d.department) ORDER BY d.user_id)
   FROM private.tt_employee_departments d
   JOIN public.workspace_members m ON m.workspace_id=d.workspace_id
      AND m.user_id=d.user_id AND m.active IS TRUE
   JOIN public.profiles p ON p.id=d.user_id AND p.status='active'
   WHERE d.workspace_id=v_ws
  ),'[]'::jsonb)
 );
END;
$read$;
REVOKE ALL ON FUNCTION public.timetracker_employee_department_directory_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_employee_department_directory_snapshot(uuid)
 TO authenticated;


CREATE OR REPLACE FUNCTION public.timetracker_attendance_admin_snapshot(
  p_board_id uuid,
  p_record_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_role text;
  v_value text;
  v_revision bigint;
  v_state jsonb;
  v_records jsonb;
  v_count integer;
  v_directory jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'A signed CRM session is required' USING ERRCODE='42501'; END IF;
  v_workspace := public.timetracker_ot_require_scope(p_board_id);
  v_role := public.module_role_for('time-tracker',v_actor);
  IF v_role IS NULL OR v_role NOT IN ('System Admin','IT Administrator') THEN
    RAISE EXCEPTION 'TimeTracker System Admin or IT Administrator required' USING ERRCODE='42501';
  END IF;
  IF p_record_ids IS NULL OR pg_catalog.cardinality(p_record_ids) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_record_ids) id
       WHERE COALESCE(id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(p_record_ids)) <>
        (SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_record_ids) id) THEN
    RAISE EXCEPTION 'Attendance record selection is invalid' USING ERRCODE='22023';
  END IF;
  SELECT e.value,e.revision INTO v_value,v_revision
  FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
  IF v_value IS NULL THEN RAISE EXCEPTION 'Attendance state is unavailable' USING ERRCODE='P0002'; END IF;
  BEGIN v_state:=v_value::jsonb; EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Attendance state is malformed' USING ERRCODE='22023'; END;
  IF v_state->>'version'<>'1' OR pg_catalog.jsonb_typeof(v_state->'records')<>'array' THEN
    RAISE EXCEPTION 'Attendance state contract is invalid' USING ERRCODE='22023';
  END IF;
  SELECT pg_catalog.jsonb_agg(r.value ORDER BY r.ordinality),pg_catalog.count(*)
    INTO v_records,v_count
  FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY r(value,ordinality)
  WHERE r.value->>'id'=ANY(p_record_ids);
  IF v_count<>pg_catalog.cardinality(p_record_ids) THEN
    RAISE EXCEPTION 'One or more selected attendance records no longer exist' USING ERRCODE='P0002';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'displayName',COALESCE(NULLIF(pg_catalog.btrim(p.display_name),''),p.email,'Workforce member')
  ) ORDER BY pg_catalog.lower(COALESCE(p.display_name,p.email))), '[]'::jsonb)
  INTO v_directory
  FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=v_workspace AND wm.active=true
  WHERE p.status='active' AND public.has_module_access('time-tracker',p.id);

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-attendance-admin-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,'boardId',p_board_id::text,
    'revision',v_revision,'records',COALESCE(v_records,'[]'::jsonb),
    'directory',v_directory
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_snapshot(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_snapshot(uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.timetracker_attendance_admin_mutate(
  p_board_id uuid,
  p_action text,
  p_record_ids text[],
  p_patch jsonb,
  p_reason text,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_role text;
  v_current_value text;
  v_current_revision bigint;
  v_new_revision bigint;
  v_state jsonb;
  v_updated_state jsonb;
  v_updated_records jsonb;
  v_before_records jsonb;
  v_after_records jsonb;
  v_record jsonb;
  v_item uuid;
  v_count integer;
  v_deleted integer := 0;
  v_reason text := NULLIF(pg_catalog.btrim(p_reason),'');
  v_committed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'A signed CRM session is required' USING ERRCODE='42501'; END IF;
  v_workspace := public.timetracker_ot_require_scope(p_board_id);
  v_role := public.module_role_for('time-tracker',v_actor);
  IF v_role IS NULL OR v_role NOT IN ('System Admin','IT Administrator') THEN
    RAISE EXCEPTION 'TimeTracker System Admin or IT Administrator required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('edit','bulk-edit','delete','bulk-delete') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Unsupported attendance management action' USING ERRCODE='22023';
  END IF;
  IF p_record_ids IS NULL OR pg_catalog.cardinality(p_record_ids) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_record_ids) id
       WHERE COALESCE(id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(p_record_ids)) <>
        (SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_record_ids) id) THEN
    RAISE EXCEPTION 'Attendance record selection is invalid' USING ERRCODE='22023';
  END IF;
  IF p_action IN ('edit','delete') AND pg_catalog.cardinality(p_record_ids)<>1 THEN
    RAISE EXCEPTION 'Individual attendance actions require exactly one record' USING ERRCODE='22023';
  END IF;
  IF p_action IN ('bulk-edit','bulk-delete') AND pg_catalog.cardinality(p_record_ids)<1 THEN
    RAISE EXCEPTION 'At least one attendance record must be selected' USING ERRCODE='22023';
  END IF;
  IF p_action IN ('edit','bulk-edit') AND
     (p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch)<>'object'
       OR p_patch='{}'::jsonb OR pg_catalog.octet_length(p_patch::text)>65536) THEN
    RAISE EXCEPTION 'Attendance correction fields are empty or invalid' USING ERRCODE='22023';
  END IF;
  -- IT administrators may adjust one session's recorded times only.
  -- No GPS spoofing, employee reassignment, status change, deletion or bulk writes.
  IF v_role='IT Administrator' THEN
    IF p_action IS DISTINCT FROM 'edit' OR
       p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch)<>'object' OR
       p_patch='{}'::jsonb THEN
      RAISE EXCEPTION 'IT Administrator corrections must be individual time edits' USING ERRCODE='42501';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) k
               WHERE k NOT IN ('clockInAt','clockOutAt')) THEN
      RAISE EXCEPTION 'IT Administrator may only correct Clock-In and Clock-Out times' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_action IN ('delete','bulk-delete') AND COALESCE(p_patch,'{}'::jsonb)<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Delete actions do not accept an edit payload' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.length(COALESCE(v_reason,''))>500 THEN
    RAISE EXCEPTION 'Attendance correction reason exceeds 500 characters' USING ERRCODE='22023';
  END IF;
  -- Every timestamp correction is attributable to a stated discrepancy.
  IF (COALESCE(p_patch,'{}'::jsonb) ? 'clockInAt' OR
      COALESCE(p_patch,'{}'::jsonb) ? 'clockOutAt') AND
     pg_catalog.length(COALESCE(v_reason,''))<10 THEN
    RAISE EXCEPTION 'Time correction requires a reason of at least 10 characters' USING ERRCODE='22023';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<1 THEN
    RAISE EXCEPTION 'Current attendance revision is required' USING ERRCODE='22023';
  END IF;

  SELECT e.value,e.revision INTO v_current_value,v_current_revision
  FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*'
  FOR UPDATE;
  IF v_current_value IS NULL THEN RAISE EXCEPTION 'Attendance state is unavailable' USING ERRCODE='P0002'; END IF;
  IF v_current_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'TT_ATTENDANCE_REVISION_CONFLICT expected %, current %',p_expected_revision,v_current_revision
      USING ERRCODE='40001';
  END IF;
  BEGIN v_state:=v_current_value::jsonb; EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Attendance state is malformed' USING ERRCODE='22023'; END;
  IF v_state->>'version'<>'1' OR pg_catalog.jsonb_typeof(v_state->'records')<>'array'
     OR pg_catalog.jsonb_array_length(v_state->'records')>25000 THEN
    RAISE EXCEPTION 'Attendance state contract is invalid' USING ERRCODE='22023';
  END IF;

  SELECT pg_catalog.jsonb_agg(r.value ORDER BY r.ordinality),pg_catalog.count(*)
    INTO v_before_records,v_count
  FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY r(value,ordinality)
  WHERE r.value->>'id'=ANY(p_record_ids);
  IF v_count<>pg_catalog.cardinality(p_record_ids) THEN
    RAISE EXCEPTION 'One or more selected attendance records no longer exist' USING ERRCODE='P0002';
  END IF;

  IF p_action IN ('edit','bulk-edit') THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(
      CASE WHEN r.value->>'id'=ANY(p_record_ids)
        THEN private.tt_attendance_admin_apply_patch(r.value,p_patch,v_actor,v_workspace)
        ELSE r.value END
      ORDER BY r.ordinality),'[]'::jsonb)
    INTO v_updated_records
    FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY r(value,ordinality);

    SELECT pg_catalog.jsonb_agg(r.value ORDER BY r.ordinality)
    INTO v_after_records
    FROM pg_catalog.jsonb_array_elements(v_updated_records) WITH ORDINALITY r(value,ordinality)
    WHERE r.value->>'id'=ANY(p_record_ids);
  ELSE
    SELECT COALESCE(pg_catalog.jsonb_agg(r.value ORDER BY r.ordinality),'[]'::jsonb)
    INTO v_updated_records
    FROM pg_catalog.jsonb_array_elements(v_state->'records') WITH ORDINALITY r(value,ordinality)
    WHERE NOT (r.value->>'id'=ANY(p_record_ids));
    v_after_records := '[]'::jsonb;
    v_deleted := pg_catalog.cardinality(p_record_ids);
  END IF;

  v_updated_state := pg_catalog.jsonb_set(v_state,ARRAY['records'],v_updated_records,true);
  IF NOT public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',v_updated_state::text) THEN
    RAISE EXCEPTION 'Attendance management mutation violates record integrity or active-session invariants'
      USING ERRCODE='23514';
  END IF;

  -- Preserve the existing rolling recovery copy and revision contract.
  INSERT INTO public.module_state_entries(
    workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at
  ) VALUES(v_workspace,'time-tracker','timetracker.attendance.v1.backup','shared','*',
    v_current_value,1,v_actor,v_committed_at)
  ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE SET
    value=EXCLUDED.value,revision=public.module_state_entries.revision+1,
    updated_by=v_actor,updated_at=v_committed_at;

  UPDATE public.module_state_entries SET value=v_updated_state::text,
    revision=revision+1,updated_by=v_actor,updated_at=v_committed_at
  WHERE workspace_id=v_workspace AND module_id='time-tracker'
    AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*'
  RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL OR v_new_revision<=v_current_revision THEN
    RAISE EXCEPTION 'Attendance management revision was not committed' USING ERRCODE='40001';
  END IF;

  IF p_action IN ('edit','bulk-edit') THEN
    FOR v_record IN SELECT r.value
      FROM pg_catalog.jsonb_array_elements(v_after_records) r(value)
    LOOP
      PERFORM private.tt_attendance_admin_sync_projection(
        p_board_id,v_workspace,v_actor,v_record,v_new_revision);
    END LOOP;
  ELSE
    FOR v_record IN SELECT r.value
      FROM pg_catalog.jsonb_array_elements(v_before_records) r(value)
    LOOP
      IF COALESCE(v_record->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT p.board_item_id INTO v_item
        FROM private.tt_attendance_board_projection p
        WHERE p.board_id=p_board_id AND p.workspace_id=v_workspace
          AND p.record_id=(v_record->>'id')::uuid
        FOR UPDATE;
        IF FOUND THEN
          DELETE FROM private.tt_attendance_board_projection
          WHERE board_id=p_board_id AND record_id=(v_record->>'id')::uuid;
          DELETE FROM public.work_board_items WHERE id=v_item AND board_id=p_board_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'Attendance board projection item is missing during deletion' USING ERRCODE='23503'; END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO private.tt_attendance_admin_audit(
    workspace_id,board_id,actor_id,action,record_ids,base_revision,
    committed_revision,before_records,after_records,reason,committed_at
  ) VALUES(
    v_workspace,p_board_id,v_actor,p_action,p_record_ids,v_current_revision,
    v_new_revision,v_before_records,v_after_records,v_reason,v_committed_at
  );

  RETURN pg_catalog.jsonb_build_object(
    'mode','COMMITTED','contract','tt-attendance-admin-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,'boardId',p_board_id::text,
    'action',p_action,'recordIds',pg_catalog.to_jsonb(p_record_ids),
    'changedCount',CASE WHEN p_action IN ('edit','bulk-edit') THEN pg_catalog.cardinality(p_record_ids) ELSE 0 END,
    'deletedCount',v_deleted,'baseRevision',v_current_revision,
    'revision',v_new_revision,'committedAt',v_committed_at
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint) TO authenticated;

COMMIT;
