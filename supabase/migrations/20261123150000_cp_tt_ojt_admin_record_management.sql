-- CP-TT-OJT-04. Signed intern attendance correction, editing and deletion.
-- OJT identities remain distinct from the shared login; audit is append-only.
BEGIN;

ALTER TABLE private.tt_ojt_attendance
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0);
ALTER TABLE private.tt_ojt_audit
 ADD COLUMN before_row jsonb,
 ADD COLUMN after_row jsonb,
 ADD COLUMN reason text;

-- Every clock-out and every administrative edit advances the same CAS revision.
CREATE FUNCTION private.tt_ojt_attendance_revision_bump()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $f$
BEGIN
 NEW.revision:=OLD.revision+1;
 RETURN NEW;
END $f$;
CREATE TRIGGER tt_ojt_attendance_revision_bump
 BEFORE UPDATE ON private.tt_ojt_attendance
 FOR EACH ROW EXECUTE FUNCTION private.tt_ojt_attendance_revision_bump();
REVOKE ALL ON FUNCTION private.tt_ojt_attendance_revision_bump()
 FROM PUBLIC,anon,authenticated;

-- Only the existing signed OJT administrator scope can read individual intern records.
-- Capture the historical name, not the mutable current roster label.
CREATE OR REPLACE FUNCTION public.timetracker_ojt_admin_attendance(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_ws uuid;
BEGIN
 v_ws:=private.tt_ojt_admin(p_board_id);
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-ojt-admin-attendance-1',
  'actorId',auth.uid()::text,
  'workspaceId',v_ws::text,
  'boardId',p_board_id::text,
  'records',COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'id',a.id::text,'internId',a.intern_id::text,'name',a.intern_name,
     'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
     'location',a.location,'workNote',a.work_note,'revision',a.revision)
     ORDER BY a.clock_in_at DESC)
    FROM (SELECT * FROM private.tt_ojt_attendance
     WHERE workspace_id=v_ws AND board_id=p_board_id
     ORDER BY clock_in_at DESC LIMIT 100) a
   ),'[]'::jsonb)
 );
END $f$;

-- Same signed privileges as ordinary attendance administration:
-- IT Administrator: time correction only; System Admin: time/edit/delete.
-- Revision CAS prevents overwriting another admin's edits or an intern clock-out.
CREATE FUNCTION public.timetracker_ojt_admin_mutate(
 p_board_id uuid,p_record_id uuid,p_action text,p_patch jsonb,
 p_reason text,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_ws uuid;
 v_existing private.tt_ojt_attendance%ROWTYPE;
 v_updated private.tt_ojt_attendance%ROWTYPE;
 v_intern uuid;
 v_role text;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_clock_in timestamptz;
 v_clock_out timestamptz;
 v_location text;
 v_note text;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_revision bigint;
BEGIN
 v_ws:=private.tt_ojt_admin(p_board_id);
 v_role:=public.module_role_for('time-tracker',auth.uid());
 IF p_record_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
   OR p_action NOT IN ('correct-time','edit','delete') OR p_action IS NULL
   OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch)<>'object'
   OR pg_catalog.length(v_reason)>500 THEN
  RAISE EXCEPTION 'Invalid signed intern attendance administration request'
   USING ERRCODE='22023';
 END IF;
 IF p_action IN ('edit','delete') AND NOT (
   v_role='System Admin' OR COALESCE(public.apsyntra_role_is_bootstrap(),false)) THEN
  RAISE EXCEPTION 'System Admin required for intern edit or delete'
   USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS k(key)
     WHERE k.key NOT IN ('clockInAt','clockOutAt','location','workNote')) OR
    (p_action='correct-time' AND EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS k(key)
      WHERE k.key NOT IN ('clockInAt','clockOutAt'))) OR
    (p_action='delete' AND p_patch<>'{}'::jsonb) OR
    (p_action<>'delete' AND p_patch='{}'::jsonb) THEN
  RAISE EXCEPTION 'Unsupported intern attendance patch'
   USING ERRCODE='22023';
 END IF;
 SELECT intern_id INTO v_intern
 FROM private.tt_ojt_attendance
 WHERE id=p_record_id AND workspace_id=v_ws AND board_id=p_board_id;
 IF v_intern IS NULL THEN
  RAISE EXCEPTION 'Intern attendance record unavailable' USING ERRCODE='PT409';
 END IF;
 -- Matches the intern-scoped lock used by the regular OJT clock-in/out RPC.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_ws::text||':tt-ojt:'||v_intern::text,0));
 SELECT * INTO v_existing FROM private.tt_ojt_attendance
 WHERE id=p_record_id AND workspace_id=v_ws AND board_id=p_board_id
 FOR UPDATE;
 IF NOT FOUND OR v_existing.intern_id IS DISTINCT FROM v_intern OR
    v_existing.revision IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'OJT_REVISION_CONFLICT: refresh attendance before making changes'
   USING ERRCODE='40001';
 END IF;
 IF p_action='delete' THEN
  INSERT INTO private.tt_ojt_audit(
    workspace_id,board_id,actor_id,intern_id,record_id,action,
    before_row,after_row,reason)
   VALUES(v_ws,p_board_id,auth.uid(),v_intern,p_record_id,'admin-delete',
     pg_catalog.to_jsonb(v_existing),NULL,v_reason);
  DELETE FROM private.tt_ojt_attendance WHERE id=p_record_id;
  v_revision:=p_expected_revision+1;
 ELSE
  v_clock_in:=v_existing.clock_in_at;
  v_clock_out:=v_existing.clock_out_at;
  v_location:=v_existing.location;
  v_note:=v_existing.work_note;
  IF p_patch ? 'clockInAt' THEN
   IF pg_catalog.jsonb_typeof(p_patch->'clockInAt')<>'string' THEN
    RAISE EXCEPTION 'Invalid corrected clock-in timestamp' USING ERRCODE='22023';
   END IF;
   v_clock_in:=(p_patch->>'clockInAt')::timestamptz;
  END IF;
  IF p_patch ? 'clockOutAt' THEN
   IF pg_catalog.jsonb_typeof(p_patch->'clockOutAt')<>'string' THEN
    RAISE EXCEPTION 'Invalid corrected clock-out timestamp' USING ERRCODE='22023';
   END IF;
   IF v_existing.clock_out_at IS NULL AND p_action='correct-time' THEN
    RAISE EXCEPTION 'Time corrections cannot create a clock-out'
     USING ERRCODE='22023';
   END IF;
   v_clock_out:=(p_patch->>'clockOutAt')::timestamptz;
  END IF;
  IF p_patch ? 'location' THEN
   IF pg_catalog.jsonb_typeof(p_patch->'location')<>'string' THEN
    RAISE EXCEPTION 'Invalid attendance location' USING ERRCODE='22023';
   END IF;
   v_location:=p_patch->>'location';
  END IF;
  IF p_patch ? 'workNote' THEN
   IF pg_catalog.jsonb_typeof(p_patch->'workNote')<>'string' THEN
    RAISE EXCEPTION 'Invalid attendance work note' USING ERRCODE='22023';
   END IF;
   v_note:=NULLIF(pg_catalog.btrim(p_patch->>'workNote'),'');
  END IF;
  IF v_clock_in IS NULL OR v_clock_in>v_now+INTERVAL '2 minutes'
    OR (v_clock_out IS NOT NULL AND
      (v_clock_out<v_clock_in OR v_clock_out>v_now+INTERVAL '2 minutes'))
    OR v_location NOT IN (
      'Office-Base Duty','Offsite (Home)','Local Field Works',
      'Out of Town Assignment','International Field Assignments')
    OR pg_catalog.length(COALESCE(v_note,''))>500
    OR (v_location='Offsite (Home)' AND COALESCE(v_note,'')='') THEN
   RAISE EXCEPTION 'Invalid corrected attendance timestamps, location or work note'
     USING ERRCODE='22023';
  END IF;
  UPDATE private.tt_ojt_attendance SET
   clock_in_at=v_clock_in,clock_out_at=v_clock_out,
   location=v_location,work_note=v_note,
   clock_out_actor=CASE WHEN v_existing.clock_out_at IS NULL
     AND v_clock_out IS NOT NULL THEN auth.uid() ELSE clock_out_actor END
  WHERE id=p_record_id
  RETURNING * INTO v_updated;
  v_revision:=v_updated.revision;
  INSERT INTO private.tt_ojt_audit(
    workspace_id,board_id,actor_id,intern_id,record_id,action,
    before_row,after_row,reason)
   VALUES(v_ws,p_board_id,auth.uid(),v_intern,p_record_id,
     'admin-'||p_action,pg_catalog.to_jsonb(v_existing),
     pg_catalog.to_jsonb(v_updated),v_reason);
 END IF;
 RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-admin-mutate-1',
   'mode','COMMITTED','actorId',auth.uid()::text,
   'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'recordId',p_record_id::text,'action',p_action,
   'revision',v_revision,'committedAt',v_now);
END $f$;

REVOKE ALL ON FUNCTION public.timetracker_ojt_admin_mutate(
 uuid,uuid,text,jsonb,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_admin_mutate(
 uuid,uuid,text,jsonb,text,bigint) TO authenticated;
COMMIT;
