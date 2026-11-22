-- CP-TT-OJT-03: dropdown-only intern selection; no PINs or identity bearer sessions.
-- Forward migration after 20261123100000 and 20261123130000.
-- The shared Supabase Auth user remains the sole authenticated actor.
BEGIN;
DROP FUNCTION IF EXISTS public.timetracker_ojt_select(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.timetracker_ojt_leave(uuid,text);
DROP FUNCTION IF EXISTS private.tt_ojt_verify(uuid,text);
DROP FUNCTION IF EXISTS public.timetracker_ojt_snapshot(uuid,text);
DROP FUNCTION IF EXISTS public.timetracker_ojt_commit(uuid,text,text,uuid,text,jsonb,text);
DROP FUNCTION IF EXISTS public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,text,boolean);
DROP TABLE IF EXISTS private.tt_ojt_sessions;
ALTER TABLE private.tt_ojt_interns
 DROP COLUMN IF EXISTS pin_hash,
 DROP COLUMN IF EXISTS failed_attempts,
 DROP COLUMN IF EXISTS locked_until;

-- Preserve the intern's display name as it was at clock-in. Renaming a roster
-- entry must not rewrite the name shown on historical attendance.
ALTER TABLE private.tt_ojt_attendance
 ADD COLUMN IF NOT EXISTS intern_name text;
UPDATE private.tt_ojt_attendance a
 SET intern_name=i.display_name
 FROM private.tt_ojt_interns i
 WHERE i.id=a.intern_id AND a.intern_name IS NULL;
ALTER TABLE private.tt_ojt_attendance
 ALTER COLUMN intern_name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.timetracker_ojt_group_set(
 p_board_id uuid,p_shared_user_id uuid,p_enabled boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  IF p_shared_user_id IS NULL OR p_enabled IS NULL THEN
   RAISE EXCEPTION 'OJT account and status are required' USING ERRCODE='22023';
  END IF;
  IF p_enabled AND NOT private.tt_ojt_eligible_shared(v_ws,p_shared_user_id) THEN
   RAISE EXCEPTION 'Only the verified Employee account in the OJT department can be enabled'
    USING ERRCODE='42501';
  END IF;
  IF NOT p_enabled AND NOT EXISTS(
    SELECT 1 FROM private.tt_ojt_shared_accounts g
    WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
     AND g.shared_user_id=p_shared_user_id
  ) THEN
   RAISE EXCEPTION 'The OJT account is not configured on this board'
    USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   v_ws::text||':tt-ojt-group:'||p_shared_user_id::text,0));
  IF NOT p_enabled AND EXISTS(
    SELECT 1 FROM private.tt_ojt_attendance a
    WHERE a.workspace_id=v_ws AND a.board_id=p_board_id
     AND a.shared_user_id=p_shared_user_id AND a.clock_out_at IS NULL
  ) THEN
   RAISE EXCEPTION 'End all active intern sessions before disabling the shared OJT login'
    USING ERRCODE='PT409';
  END IF;
  INSERT INTO private.tt_ojt_shared_accounts
   (workspace_id,board_id,shared_user_id,enabled,updated_by)
  VALUES(v_ws,p_board_id,p_shared_user_id,p_enabled,auth.uid())
  ON CONFLICT(workspace_id,board_id,shared_user_id) DO UPDATE
   SET enabled=excluded.enabled,updated_by=excluded.updated_by,
       updated_at=pg_catalog.clock_timestamp();
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),
    CASE WHEN p_enabled THEN 'group_enabled' ELSE 'group_disabled' END);
  RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-admin-write-1',
   'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'userId',p_shared_user_id::text,'enabled',p_enabled);
 END
 $f$;

CREATE FUNCTION public.timetracker_ojt_intern_set(
 p_board_id uuid,p_shared_user_id uuid,p_intern_id uuid,
 p_name text,p_active boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_id uuid;v_name text:=pg_catalog.btrim(COALESCE(p_name,''));
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  IF p_active IS NULL OR pg_catalog.length(v_name) NOT BETWEEN 2 AND 100
   OR NOT EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts g
    WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
     AND g.shared_user_id=p_shared_user_id) THEN
   RAISE EXCEPTION 'Valid OJT roster group, name and status are required'
    USING ERRCODE='22023';
  END IF;
  IF p_intern_id IS NULL THEN
   INSERT INTO private.tt_ojt_interns
    (workspace_id,board_id,shared_user_id,display_name,active,created_by)
   VALUES(v_ws,p_board_id,p_shared_user_id,v_name,p_active,auth.uid())
   RETURNING id INTO v_id;
  ELSE
   SELECT id INTO v_id FROM private.tt_ojt_interns
    WHERE id=p_intern_id AND workspace_id=v_ws AND board_id=p_board_id
     AND shared_user_id=p_shared_user_id FOR UPDATE;
   IF v_id IS NULL THEN
    RAISE EXCEPTION 'Intern record not found in this roster' USING ERRCODE='42501';
   END IF;
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_ws::text||':tt-ojt:'||v_id::text,0));
   IF NOT p_active AND EXISTS(
    SELECT 1 FROM private.tt_ojt_attendance a
    WHERE a.workspace_id=v_ws AND a.board_id=p_board_id
     AND a.shared_user_id=p_shared_user_id AND a.intern_id=v_id
     AND a.clock_out_at IS NULL
   ) THEN
    RAISE EXCEPTION 'End this intern active session before deactivating the profile'
     USING ERRCODE='PT409';
   END IF;
   UPDATE private.tt_ojt_interns SET
    display_name=v_name,active=p_active,updated_at=pg_catalog.clock_timestamp()
   WHERE id=v_id;
  END IF;
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,intern_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),v_id,
    CASE WHEN p_intern_id IS NULL THEN 'intern_created'
     WHEN NOT p_active THEN 'intern_disabled' ELSE 'intern_updated' END);
  RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-admin-write-1',
   'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'internId',v_id::text,'active',p_active);
 END
 $f$;

CREATE FUNCTION public.timetracker_ojt_snapshot(p_board_id uuid,p_intern_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_name text;
 BEGIN
  v_ws:=private.tt_ojt_shared(p_board_id);
  SELECT display_name INTO v_name FROM private.tt_ojt_interns
   WHERE id=p_intern_id AND workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=auth.uid() AND active;
  IF v_name IS NULL THEN
   RAISE EXCEPTION 'Select an active intern from this OJT roster'
    USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-attendance-1',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'internId',p_intern_id::text,'name',v_name,
   'records',COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'id',a.id::text,'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
     'location',a.location,'workNote',a.work_note)
     ORDER BY a.clock_in_at DESC)
    FROM (SELECT * FROM private.tt_ojt_attendance
     WHERE workspace_id=v_ws AND board_id=p_board_id
      AND shared_user_id=auth.uid() AND intern_id=p_intern_id
     ORDER BY clock_in_at DESC LIMIT 50) a
   ),'[]'::jsonb));
 END
 $f$;

CREATE FUNCTION public.timetracker_ojt_commit(
 p_board_id uuid,p_intern_id uuid,p_action text,p_record_id uuid,
 p_location text,p_geo jsonb,p_work_note text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE
  v_ws uuid;v_id uuid:=p_intern_id;v_record uuid;v_stamp timestamptz;
  v_name text;v_geo_time timestamptz;
  v_note text:=pg_catalog.btrim(COALESCE(p_work_note,''));
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   v_ws::text||':tt-ojt-group:'||auth.uid()::text,0));
  v_ws:=private.tt_ojt_shared(p_board_id);
  IF v_id IS NULL THEN
   RAISE EXCEPTION 'Select an active intern before clocking' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   v_ws::text||':tt-ojt:'||v_id::text,0));
  SELECT i.display_name INTO v_name FROM private.tt_ojt_interns i
   WHERE i.id=v_id AND i.workspace_id=v_ws AND i.board_id=p_board_id
    AND i.shared_user_id=auth.uid() AND i.active;
  IF v_name IS NULL THEN
   RAISE EXCEPTION 'Selected intern is not active in this OJT roster'
    USING ERRCODE='42501';
  END IF;
  PERFORM private.tt_ojt_shared(p_board_id);
  IF p_action IS NULL OR p_action NOT IN ('clock-in','clock-out')
   OR p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments')
   OR pg_catalog.length(v_note)>500
   OR (p_action='clock-in' AND p_location='Offsite (Home)' AND pg_catalog.length(v_note)=0)
   OR p_geo IS NULL OR pg_catalog.jsonb_typeof(p_geo)<>'object'
   OR p_geo->>'status' IS DISTINCT FROM 'captured'
   OR pg_catalog.jsonb_typeof(p_geo->'latitude')<>'number'
   OR pg_catalog.jsonb_typeof(p_geo->'longitude')<>'number'
   OR pg_catalog.jsonb_typeof(p_geo->'accuracy')<>'number'
   OR p_geo->>'capturedAt' IS NULL THEN
   RAISE EXCEPTION 'Valid location, GPS fix and work note are required' USING ERRCODE='22023';
  END IF;
  IF (p_geo->>'latitude')::numeric NOT BETWEEN -90 AND 90
   OR (p_geo->>'longitude')::numeric NOT BETWEEN -180 AND 180
   OR (p_geo->>'accuracy')::numeric NOT BETWEEN 0 AND 100000 THEN
   RAISE EXCEPTION 'GPS coordinates invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
   v_geo_time:=(p_geo->>'capturedAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
   RAISE EXCEPTION 'GPS capture time invalid' USING ERRCODE='22023';
  END;
  IF v_geo_time IS NULL OR v_geo_time<pg_catalog.clock_timestamp()-interval '10 minutes'
   OR v_geo_time>pg_catalog.clock_timestamp()+interval '2 minutes' THEN
   RAISE EXCEPTION 'GPS fix is expired or in the future' USING ERRCODE='22023';
  END IF;
  v_stamp:=pg_catalog.clock_timestamp();
  IF p_action='clock-in' THEN
   IF p_record_id IS NOT NULL OR EXISTS(SELECT 1 FROM private.tt_ojt_attendance a
    WHERE a.workspace_id=v_ws AND a.board_id=p_board_id
     AND a.shared_user_id=auth.uid() AND a.intern_id=v_id
     AND a.clock_out_at IS NULL) THEN
    RAISE EXCEPTION 'An attendance session is already active' USING ERRCODE='PT409';
   END IF;
   INSERT INTO private.tt_ojt_attendance(
    workspace_id,board_id,shared_user_id,intern_id,intern_name,
    clock_in_at,location,work_note,clock_in_geo,clock_in_actor)
   VALUES(v_ws,p_board_id,auth.uid(),v_id,v_name,v_stamp,p_location,
    NULLIF(v_note,''),p_geo,auth.uid()) RETURNING id INTO v_record;
  ELSE
   IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'A verified active record is required' USING ERRCODE='22023';
   END IF;
   UPDATE private.tt_ojt_attendance SET
    clock_out_at=v_stamp,clock_out_geo=p_geo,clock_out_actor=auth.uid()
   WHERE id=p_record_id AND workspace_id=v_ws AND board_id=p_board_id
    AND intern_id=v_id AND shared_user_id=auth.uid() AND clock_out_at IS NULL
   RETURNING id INTO v_record;
   IF v_record IS NULL THEN
    RAISE EXCEPTION 'Attendance record already completed or unavailable' USING ERRCODE='PT409';
   END IF;
  END IF;
  INSERT INTO private.tt_ojt_audit(
   workspace_id,board_id,actor_id,intern_id,record_id,action)
  VALUES(v_ws,p_board_id,auth.uid(),v_id,v_record,p_action);
  RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-commit-1','mode','COMMITTED',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,
   'boardId',p_board_id::text,'internId',v_id::text,
   'recordId',v_record::text,'action',p_action,'committedAt',v_stamp);
 END
 $f$;

-- Admin attendance reads use the immutable name captured at clock-in.
CREATE OR REPLACE FUNCTION public.timetracker_ojt_admin_attendance(p_board_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  RETURN pg_catalog.jsonb_build_object('contract','tt-ojt-admin-attendance-1',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,
   'boardId',p_board_id::text,
   'records',COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'id',a.id::text,'internId',a.intern_id::text,'name',a.intern_name,
     'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,'location',a.location)
     ORDER BY a.clock_in_at DESC)
    FROM (SELECT * FROM private.tt_ojt_attendance
     WHERE workspace_id=v_ws AND board_id=p_board_id
     ORDER BY clock_in_at DESC LIMIT 100) a
   ),'[]'::jsonb));
 END
 $f$;

REVOKE ALL ON FUNCTION public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,boolean),
 public.timetracker_ojt_snapshot(uuid,uuid),
 public.timetracker_ojt_commit(uuid,uuid,text,uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,boolean),
 public.timetracker_ojt_snapshot(uuid,uuid),
 public.timetracker_ojt_commit(uuid,uuid,text,uuid,text,jsonb,text)
 TO authenticated;
COMMIT;
