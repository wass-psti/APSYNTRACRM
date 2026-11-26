-- CP-TT-ADMIN-MANUAL-CLOCKIN-SCHEDULER-GATE
-- A manual active session is permitted only while the isolated regular
-- nine-credited-hour scheduler is verifiably active. Enrollment remains in
-- the independent 30-second reconciler; never reintroduce synchronous
-- scheduler writes into the attendance transaction.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

DO $preflight$
BEGIN
 IF pg_catalog.to_regprocedure('private.tt_auto_clockout_mode()') IS NULL
  OR pg_catalog.to_regprocedure('private.tt_admin_manual_clockin_ready()') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_attendance_admin_create_capability(uuid)') IS NULL
  OR pg_catalog.to_regprocedure(
   'public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)') IS NULL
 THEN
  RAISE EXCEPTION 'Manual clock-in and isolated scheduler prerequisites are missing'
   USING ERRCODE='55000';
 END IF;
 IF private.tt_auto_clockout_mode() NOT IN ('active','suspended') THEN
  RAISE EXCEPTION 'Regular auto-clockout scheduler state is invalid; review before applying this gate'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- Do not expose Add Log while the regular employee processor/reconciler is
-- suspended, malformed, or only partially active. OJT remains independent.
CREATE OR REPLACE FUNCTION private.tt_admin_manual_clockin_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $ready$
 SELECT private.tt_auto_clockout_mode() IS NOT DISTINCT FROM 'active';
$ready$;
REVOKE ALL ON FUNCTION private.tt_admin_manual_clockin_ready()
 FROM PUBLIC,anon,authenticated,service_role;


-- Version the capability handshake so an older frontend/backend pair fails
-- closed during either deployment order. The scheduler mode is explicit and
-- the ready flag must agree with it.
CREATE OR REPLACE FUNCTION public.timetracker_attendance_admin_create_capability(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $capability$
DECLARE v_actor uuid:=auth.uid(); v_ws uuid; v_mode text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.module_role_for('time-tracker',v_actor) IS DISTINCT FROM 'System Admin'
 THEN RAISE EXCEPTION 'System Admin attendance management required' USING ERRCODE='42501'; END IF;
 v_mode:=private.tt_auto_clockout_mode();
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-admin-clockin-capability-2','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'ready',v_mode IS NOT DISTINCT FROM 'active',
  'schedulerMode',v_mode);
END;
$capability$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_admin_create_capability(uuid) TO authenticated;

-- Recheck under the scheduler's shared control lock inside the signed create
-- transaction. The operator's activation/suspension functions take the
-- exclusive form of this lock, so scheduler mode cannot change mid-write.
-- The independent reconciler still enrolls the committed session on its
-- normal 30-second sweep; no scheduler table is written from this transaction.
DO $patch$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef(
  'public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)'::pg_catalog.regprocedure);
 old:=$old$ IF NOT private.tt_admin_manual_clockin_ready()
 THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;$old$;
 replacement:=$new$ IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(
  pg_catalog.hashtextextended('tt-auto-clockout-control',0)) THEN
  RAISE EXCEPTION 'Automatic clock-out scheduler is changing; retry manual clock-in'
   USING ERRCODE='55P03';
 END IF;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Manual clock-in requires active regular nine-hour auto-clock-out'
   USING ERRCODE='55000';
 END IF;$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual clock-in create-function baseline differs; refusing an unsafe patch'
   USING ERRCODE='55000';
 END IF;
 EXECUTE pg_catalog.replace(d,old,replacement);
END;
$patch$;

NOTIFY pgrst,'reload schema';
COMMIT;
