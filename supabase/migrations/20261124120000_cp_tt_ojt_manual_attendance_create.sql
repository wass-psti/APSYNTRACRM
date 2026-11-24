-- CP-TT-OJT-MANUAL-01: signed administrator backfill for missed OJT attendance.
-- Scope: existing OJT identities; does not forge GPS or bypass ordinary clock-in.
BEGIN;

DO $gate$
BEGIN
 IF pg_catalog.to_regclass('private.tt_ojt_attendance') IS NULL OR
    pg_catalog.to_regprocedure('public.timetracker_ojt_admin_mutate(uuid,uuid,text,jsonb,text,bigint)') IS NULL
 THEN
  RAISE EXCEPTION 'Signed OJT attendance administration must be installed before manual entries';
 END IF;
END $gate$;

ALTER TABLE private.tt_ojt_attendance
 ADD COLUMN entry_source text NOT NULL DEFAULT 'app'
 CHECK (entry_source IN ('app','admin-manual'));

-- Same signed snapshot contract, with one allowlisted provenance field.
CREATE OR REPLACE FUNCTION public.timetracker_ojt_admin_attendance(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid;
BEGIN
 v_ws:=private.tt_ojt_admin(p_board_id);
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-ojt-admin-attendance-1',
  'actorId',auth.uid()::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'records',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',a.id::text,'internId',a.intern_id::text,'name',a.intern_name,
    'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
    'location',a.location,'workNote',a.work_note,'revision',a.revision,
    'manualEntry',a.entry_source='admin-manual')
    ORDER BY a.clock_in_at DESC)
   FROM (SELECT * FROM private.tt_ojt_attendance
    WHERE workspace_id=v_ws AND board_id=p_board_id
    ORDER BY clock_in_at DESC LIMIT 100) a
  ),'[]'::jsonb)
 );
END $f$;

CREATE OR REPLACE FUNCTION public.timetracker_ojt_snapshot(p_board_id uuid,p_intern_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid;v_name text;
BEGIN
 v_ws:=private.tt_ojt_shared(p_board_id);
 SELECT display_name INTO v_name FROM private.tt_ojt_interns
 WHERE id=p_intern_id AND workspace_id=v_ws AND board_id=p_board_id
  AND shared_user_id=auth.uid() AND active;
 IF v_name IS NULL THEN
  RAISE EXCEPTION 'Select an active intern from this OJT roster' USING ERRCODE='42501';
 END IF;
 RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-attendance-1',
  'actorId',auth.uid()::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'internId',p_intern_id::text,'name',v_name,
  'records',COALESCE((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',a.id::text,'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
    'location',a.location,'workNote',a.work_note,
    'manualEntry',a.entry_source='admin-manual')
    ORDER BY a.clock_in_at DESC)
   FROM (SELECT * FROM private.tt_ojt_attendance
    WHERE workspace_id=v_ws AND board_id=p_board_id
     AND shared_user_id=auth.uid() AND intern_id=p_intern_id
    ORDER BY clock_in_at DESC LIMIT 50) a
  ),'[]'::jsonb));
END $f$;

-- Request id doubles as the record id, so an uncertain network response can
-- be retried without producing a duplicate attendance row.
CREATE FUNCTION public.timetracker_ojt_admin_create(
 p_board_id uuid,p_request_id uuid,p_intern_id uuid,
 p_clock_in timestamptz,p_clock_out timestamptz,p_location text,
 p_work_note text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_actor uuid:=auth.uid();
 v_ws uuid;
 v_role text;
 v_shared uuid;
 v_name text;
 v_note text:=NULLIF(pg_catalog.btrim(COALESCE(p_work_note,'')),'');
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_existing private.tt_ojt_attendance%ROWTYPE;
 v_inserted private.tt_ojt_attendance%ROWTYPE;
 v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
 v_ws:=private.tt_ojt_admin(p_board_id);
 v_role:=public.module_role_for('time-tracker',v_actor);
 IF v_role IS DISTINCT FROM 'System Admin'
    AND COALESCE(public.apsyntra_role_is_bootstrap(),false) IS NOT TRUE THEN
  RAISE EXCEPTION 'System Admin required for manual attendance creation'
   USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_intern_id IS NULL OR p_clock_in IS NULL
   OR p_clock_in>v_now+INTERVAL '2 minutes'
   OR p_clock_in<v_now-INTERVAL '365 days'
   OR (p_clock_out IS NOT NULL AND
     (p_clock_out<=p_clock_in OR p_clock_out>v_now+INTERVAL '2 minutes'))
   OR p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments')
   OR pg_catalog.length(COALESCE(v_note,''))>500
   OR (p_location='Offsite (Home)' AND v_note IS NULL)
   OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500
 THEN
  RAISE EXCEPTION 'Valid missed shift times, location and reason are required'
   USING ERRCODE='22023';
 END IF;
 SELECT shared_user_id INTO v_shared FROM private.tt_ojt_interns
 WHERE id=p_intern_id AND workspace_id=v_ws AND board_id=p_board_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Intern is not registered on this TimeTracker board'
   USING ERRCODE='42501';
 END IF;
 -- Match the shared-group then per-intern order used by normal Clock-In.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':tt-ojt-group:'||v_shared::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':tt-ojt:'||p_intern_id::text,0));
 SELECT i.display_name INTO v_name
 FROM private.tt_ojt_interns i
 JOIN private.tt_ojt_shared_accounts g
  ON g.workspace_id=i.workspace_id AND g.board_id=i.board_id
  AND g.shared_user_id=i.shared_user_id
 WHERE i.id=p_intern_id AND i.workspace_id=v_ws AND i.board_id=p_board_id
  AND i.active AND g.enabled;
 IF v_name IS NULL THEN
  RAISE EXCEPTION 'Active OJT roster identity required' USING ERRCODE='42501';
 END IF;

 SELECT * INTO v_existing FROM private.tt_ojt_attendance
 WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF v_existing.workspace_id=v_ws AND v_existing.board_id=p_board_id
    AND v_existing.intern_id=p_intern_id
    AND v_existing.entry_source='admin-manual'
    AND v_existing.clock_in_actor=v_actor
    AND v_existing.clock_in_at=p_clock_in
    AND v_existing.location=p_location
    AND v_existing.work_note IS NOT DISTINCT FROM v_note
    AND (p_clock_out IS NULL OR v_existing.clock_out_at=p_clock_out)
    AND EXISTS (
     SELECT 1 FROM private.tt_ojt_audit a
     WHERE a.workspace_id=v_ws AND a.board_id=p_board_id
       AND a.record_id=p_request_id AND a.action='admin-manual-create'
       AND a.actor_id=v_actor AND a.reason=v_reason)
  THEN
   RETURN pg_catalog.jsonb_build_object(
    'contract','tt-ojt-admin-create-1','mode','COMMITTED',
    'actorId',v_actor::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'internId',p_intern_id::text,'recordId',p_request_id::text,
    'manualEntry',true,'replayed',true,'committedAt',v_now);
  END IF;
  RAISE EXCEPTION 'Manual attendance request ID already used with different details'
   USING ERRCODE='PT409';
 END IF;

 -- Reject overlaps, including an existing active record. Do not create a
 -- duplicate shift when a clock-in was already recorded by the app.
 IF EXISTS (
  SELECT 1 FROM private.tt_ojt_attendance a
  WHERE a.workspace_id=v_ws AND a.board_id=p_board_id
    AND a.intern_id=p_intern_id
    AND pg_catalog.tstzrange(
       a.clock_in_at,COALESCE(a.clock_out_at,'infinity'::timestamptz),'[)')
      && pg_catalog.tstzrange(
       p_clock_in,COALESCE(p_clock_out,'infinity'::timestamptz),'[)')
 ) THEN
  RAISE EXCEPTION 'An overlapping attendance record already exists for this intern'
   USING ERRCODE='PT409';
 END IF;

 INSERT INTO private.tt_ojt_attendance(
  id,workspace_id,board_id,shared_user_id,intern_id,intern_name,
  clock_in_at,clock_out_at,location,work_note,
  clock_in_geo,clock_out_geo,clock_in_actor,clock_out_actor,entry_source)
 VALUES(
  p_request_id,v_ws,p_board_id,v_shared,p_intern_id,v_name,
  p_clock_in,p_clock_out,p_location,v_note,
  pg_catalog.jsonb_build_object(
   'status','not_captured','source','admin-manual-entry','recordedAt',v_now),
  CASE WHEN p_clock_out IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
   'status','not_captured','source','admin-manual-entry','recordedAt',v_now) END,
  v_actor,NULL,'admin-manual')
 RETURNING * INTO v_inserted;

 INSERT INTO private.tt_ojt_audit(
  workspace_id,board_id,actor_id,intern_id,record_id,action,
  before_row,after_row,reason)
 VALUES(v_ws,p_board_id,v_actor,p_intern_id,p_request_id,'admin-manual-create',
  NULL,pg_catalog.to_jsonb(v_inserted),v_reason);

 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-ojt-admin-create-1','mode','COMMITTED',
  'actorId',v_actor::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'internId',p_intern_id::text,'recordId',p_request_id::text,
  'manualEntry',true,'replayed',false,'committedAt',v_now);
END $f$;

REVOKE ALL ON FUNCTION public.timetracker_ojt_admin_create(
 uuid,uuid,uuid,timestamptz,timestamptz,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_admin_create(
 uuid,uuid,uuid,timestamptz,timestamptz,text,text,text) TO authenticated;
COMMIT;
