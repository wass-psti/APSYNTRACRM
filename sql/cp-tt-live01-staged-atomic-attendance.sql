-- CP-TT-LIVE-01: staged atomic TimeTracker activation.
-- REQUIRES CP-TT-GPS-03 in the same controlled release, BEFORE this migration.
-- DO NOT APPLY TO PRODUCTION without a separate access-policy change approval,
-- a tested rollback, and genuine signed-session acceptance.
-- No existing attendance or employee records are rewritten by this migration.
BEGIN;

DO $preflight$
DECLARE
  v_raw oid:=pg_catalog.to_regprocedure(
    'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)');
  v_legacy oid:=pg_catalog.to_regprocedure(
    'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)');
BEGIN
  IF v_raw IS NULL OR v_legacy IS NULL OR
    pg_catalog.to_regprocedure('public.timetracker_redact_commit_receipt(jsonb)') IS NULL OR
    pg_catalog.to_regprocedure('public.timetracker_ot_require_scope(uuid)') IS NULL OR
    pg_catalog.to_regprocedure('public.module_role_for(text,uuid)') IS NULL OR
    NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid=v_raw) THEN
    RAISE EXCEPTION 'GPS-03 and signed TimeTracker write prerequisites required'
      USING ERRCODE='22023';
  END IF;
END;
$preflight$;

CREATE TABLE public.timetracker_attendance_mutation_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  board_id uuid NOT NULL REFERENCES public.work_boards(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  record_id text NOT NULL CHECK(length(record_id) BETWEEN 1 AND 150),
  action text NOT NULL CHECK(action IN ('clock-in','clock-out')),
  revision bigint NOT NULL CHECK(revision > 0),
  committed_at timestamptz NOT NULL,
  offsite_note_supplied boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT tt_attendance_audit_revision_unique UNIQUE(workspace_id,revision)
);
CREATE INDEX tt_attendance_audit_actor_time
 ON public.timetracker_attendance_mutation_audit(workspace_id,actor_id,committed_at DESC);
ALTER TABLE public.timetracker_attendance_mutation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetracker_attendance_mutation_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.timetracker_attendance_mutation_audit
 FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.timetracker_attendance_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $audit$
BEGIN
  RAISE EXCEPTION 'TimeTracker attendance audit is immutable' USING ERRCODE='42501';
END;
$audit$;
CREATE TRIGGER timetracker_attendance_immutable
 BEFORE UPDATE OR DELETE ON public.timetracker_attendance_mutation_audit
 FOR EACH ROW EXECUTE FUNCTION public.timetracker_attendance_audit_immutable();
REVOKE ALL ON FUNCTION public.timetracker_attendance_audit_immutable()
 FROM PUBLIC, anon, authenticated;

-- Existing OT scope guard checks auth.sessions revocation and expiry, active
-- central module membership, exact active board, board grant and workspace.
CREATE FUNCTION public.timetracker_attendance_capabilities(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $cap$
DECLARE
  v_ws uuid;
  v_user uuid:=auth.uid();
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  IF public.module_role_for('time-tracker',v_user) IS NULL THEN
    RAISE EXCEPTION 'Current TimeTracker role required' USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-attendance-1',
    'actorId',v_user::text,'workspaceId',v_ws::text,
    'boardId',p_board_id::text,'canClock',true);
END;
$cap$;

-- This is the ONLY authenticated attendance-write endpoint after activation.
-- No client-supplied platform role, workspace, server time, or policy authority.
CREATE FUNCTION public.timetracker_attendance_commit_v2(
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
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_user);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Current TimeTracker role required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('clock-in','clock-out') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Unsupported attendance action' USING ERRCODE='22023';
  END IF;
  IF p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments') OR
    p_department IS NULL OR p_department NOT IN (
    'HR','Materials and Logistics','Engineering','Finance and Accounting',
    'Sales and Marketing','Information Technology') THEN
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

REVOKE ALL ON FUNCTION public.timetracker_attendance_capabilities(uuid)
 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_capabilities(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text)
 TO authenticated;

-- Retire the legacy public writer: it lacks the dedicated-board/session/audit
-- contract and must NEVER be an alternate authenticated write path.
REVOKE ALL ON FUNCTION public.commit_timetracker_attendance_action(
 text,text,text,text,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
