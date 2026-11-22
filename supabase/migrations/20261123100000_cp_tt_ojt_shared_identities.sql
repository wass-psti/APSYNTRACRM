-- CP-TT-OJT-01: multiple verified intern identities under one existing OJT login.
-- No synthetic auth.users, shared PIN, or client-owned employee identity.
-- Migration requires pgcrypto, installed in Supabase's extensions schema.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE private.tt_ojt_shared_accounts(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 board_id uuid NOT NULL,
 shared_user_id uuid NOT NULL REFERENCES public.profiles(id),
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,board_id,shared_user_id)
);
CREATE TABLE private.tt_ojt_interns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 shared_user_id uuid NOT NULL,
 display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 100),
 pin_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(workspace_id,board_id,shared_user_id) REFERENCES
  private.tt_ojt_shared_accounts(workspace_id,board_id,shared_user_id)
);
CREATE UNIQUE INDEX tt_ojt_intern_name_unique
 ON private.tt_ojt_interns(workspace_id,board_id,shared_user_id,lower(display_name));

CREATE TABLE private.tt_ojt_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 shared_user_id uuid NOT NULL,
 intern_id uuid NOT NULL REFERENCES private.tt_ojt_interns(id),
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX tt_ojt_session_actor ON private.tt_ojt_sessions
 (workspace_id,board_id,shared_user_id,intern_id);

CREATE TABLE private.tt_ojt_attendance(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 shared_user_id uuid NOT NULL,
 intern_id uuid NOT NULL REFERENCES private.tt_ojt_interns(id),
 clock_in_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 clock_out_at timestamptz,
 location text NOT NULL CHECK(location IN (
  'Office-Base Duty','Offsite (Home)','Local Field Works',
  'Out of Town Assignment','International Field Assignments')),
 work_note text,
 clock_in_geo jsonb NOT NULL,
 clock_out_geo jsonb,
 clock_in_actor uuid NOT NULL REFERENCES public.profiles(id),
 clock_out_actor uuid REFERENCES public.profiles(id),
 CHECK(clock_out_at IS NULL OR clock_out_at>=clock_in_at)
);
CREATE UNIQUE INDEX tt_ojt_one_active_per_intern
 ON private.tt_ojt_attendance(intern_id) WHERE clock_out_at IS NULL;
CREATE INDEX tt_ojt_attendance_history ON private.tt_ojt_attendance
 (workspace_id,board_id,intern_id,clock_in_at DESC);

CREATE TABLE private.tt_ojt_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 intern_id uuid,
 record_id uuid,
 action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION private.tt_ojt_audit_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=''
 AS $$ BEGIN RAISE EXCEPTION 'Intern audit is append-only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER tt_ojt_audit_immutable BEFORE UPDATE OR DELETE ON private.tt_ojt_audit
 FOR EACH ROW EXECUTE FUNCTION private.tt_ojt_audit_immutable();
ALTER TABLE private.tt_ojt_shared_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_ojt_interns ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_ojt_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_ojt_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_ojt_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tt_ojt_shared_accounts,private.tt_ojt_interns,
 private.tt_ojt_sessions,private.tt_ojt_attendance,private.tt_ojt_audit
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.tt_ojt_audit_immutable() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tt_ojt_scope(p_board_id uuid) RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Signed TimeTracker session required' USING ERRCODE='42501';
  END IF;
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  IF v_ws IS NULL THEN
   RAISE EXCEPTION 'TimeTracker board unavailable' USING ERRCODE='42501';
  END IF;
  RETURN v_ws;
 END $f$;
CREATE FUNCTION private.tt_ojt_admin(p_board_id uuid) RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  IF NOT (
   COALESCE(public.apsyntra_role_is_bootstrap(),false)
   OR COALESCE(public.module_role_for('time-tracker',auth.uid())
     IN ('System Admin','IT Administrator'),false)
  ) THEN
   RAISE EXCEPTION 'TimeTracker intern administration denied' USING ERRCODE='42501';
  END IF;
  RETURN v_ws;
 END $f$;
CREATE FUNCTION private.tt_ojt_shared(p_board_id uuid) RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  IF public.module_role_for('time-tracker',auth.uid()) IS DISTINCT FROM 'OJT'
     OR NOT EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts g
       WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
        AND g.shared_user_id=auth.uid() AND g.enabled) THEN
   RAISE EXCEPTION 'Active shared OJT identity required' USING ERRCODE='42501';
  END IF;
  RETURN v_ws;
 END $f$;

-- Administrator sees only workspace-scoped roster metadata, never a PIN/hash/session token.
CREATE FUNCTION public.timetracker_ojt_admin_snapshot(p_board_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  RETURN jsonb_build_object('contract','tt-ojt-admin-1',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,
   'boardId',p_board_id::text,
   'groups',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'userId',g.shared_user_id::text,'enabled',g.enabled,
      'interns',coalesce((
       SELECT jsonb_agg(jsonb_build_object(
        'id',i.id::text,'name',i.display_name,'active',i.active)
        ORDER BY i.display_name,i.id)
       FROM private.tt_ojt_interns i
       WHERE i.workspace_id=g.workspace_id AND i.board_id=g.board_id
        AND i.shared_user_id=g.shared_user_id
      ),'[]'::jsonb)) ORDER BY g.shared_user_id)
    FROM private.tt_ojt_shared_accounts g
    WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
   ),'[]'::jsonb));
 END $f$;

-- Explicitly designate an EXISTING, assigned OJT module user as the shared login.
CREATE FUNCTION public.timetracker_ojt_group_set(
 p_board_id uuid,p_shared_user_id uuid,p_enabled boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  IF p_shared_user_id IS NULL OR p_enabled IS NULL
    OR public.module_role_for('time-tracker',p_shared_user_id) IS DISTINCT FROM 'OJT'
    OR NOT EXISTS(
      SELECT 1 FROM public.workspace_members m
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.workspace_id=v_ws AND m.user_id=p_shared_user_id
        AND m.active AND p.status='active'
    ) THEN
   RAISE EXCEPTION 'Active OJT shared account is required' USING ERRCODE='42501';
  END IF;
  INSERT INTO private.tt_ojt_shared_accounts
    (workspace_id,board_id,shared_user_id,enabled,updated_by)
  VALUES(v_ws,p_board_id,p_shared_user_id,p_enabled,auth.uid())
  ON CONFLICT(workspace_id,board_id,shared_user_id) DO UPDATE
    SET enabled=excluded.enabled,updated_by=excluded.updated_by,
        updated_at=clock_timestamp();
  IF NOT p_enabled THEN
   UPDATE private.tt_ojt_sessions SET revoked_at=clock_timestamp()
   WHERE workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=p_shared_user_id AND revoked_at IS NULL;
  END IF;
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),
     CASE WHEN p_enabled THEN 'group_enabled' ELSE 'group_disabled' END);
  RETURN jsonb_build_object('contract','tt-ojt-admin-write-1',
    'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'userId',p_shared_user_id::text,'enabled',p_enabled);
 END $f$;

-- PIN is write-only; rotation revokes existing identity sessions.
CREATE FUNCTION public.timetracker_ojt_intern_set(
 p_board_id uuid,p_shared_user_id uuid,p_intern_id uuid,
 p_name text,p_pin text,p_active boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid; v_id uuid; v_name text:=trim(coalesce(p_name,''));
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  IF p_active IS NULL OR length(v_name) NOT BETWEEN 2 AND 100
     OR NOT EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts g
       WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
       AND g.shared_user_id=p_shared_user_id) THEN
   RAISE EXCEPTION 'Valid OJT roster group and name required' USING ERRCODE='22023';
  END IF;
  IF p_pin IS NOT NULL AND (p_pin !~ '^[0-9]{8,12}$'
     OR p_pin ~ '^([0-9])\1+$') THEN
   RAISE EXCEPTION 'Identity PIN must contain 8–12 nonrepeating digits'
    USING ERRCODE='22023';
  END IF;
  IF p_intern_id IS NULL THEN
   IF p_pin IS NULL THEN
    RAISE EXCEPTION 'New interns require an individual PIN' USING ERRCODE='22023';
   END IF;
   INSERT INTO private.tt_ojt_interns
    (workspace_id,board_id,shared_user_id,display_name,pin_hash,active,created_by)
   VALUES(v_ws,p_board_id,p_shared_user_id,v_name,
     extensions.crypt(p_pin,extensions.gen_salt('bf',12)),p_active,auth.uid())
   RETURNING id INTO v_id;
  ELSE
   UPDATE private.tt_ojt_interns SET
    display_name=v_name,active=p_active,
    pin_hash=CASE WHEN p_pin IS NOT NULL
      THEN extensions.crypt(p_pin,extensions.gen_salt('bf',12))
      ELSE pin_hash END,
    failed_attempts=0,locked_until=NULL,updated_at=clock_timestamp()
   WHERE id=p_intern_id AND workspace_id=v_ws
    AND board_id=p_board_id AND shared_user_id=p_shared_user_id
   RETURNING id INTO v_id;
   IF v_id IS NULL THEN
    RAISE EXCEPTION 'Intern record not found in this roster' USING ERRCODE='42501';
   END IF;
   IF p_pin IS NOT NULL OR NOT p_active THEN
    UPDATE private.tt_ojt_sessions SET revoked_at=clock_timestamp()
    WHERE intern_id=v_id AND revoked_at IS NULL;
   END IF;
  END IF;
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,intern_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),v_id,
     CASE WHEN p_intern_id IS NULL THEN 'intern_created'
      WHEN NOT p_active THEN 'intern_disabled'
      WHEN p_pin IS NOT NULL THEN 'pin_rotated' ELSE 'intern_updated' END);
  RETURN jsonb_build_object('contract','tt-ojt-admin-write-1',
    'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'internId',v_id::text,'active',p_active);
 END $f$;

-- Shared account gets names only. Selecting a name alone gives no attendance access.
CREATE FUNCTION public.timetracker_ojt_roster(p_board_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid; v_group record;
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  SELECT enabled INTO v_group FROM private.tt_ojt_shared_accounts
   WHERE workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=auth.uid();
  IF NOT FOUND THEN
   RETURN jsonb_build_object('contract','tt-ojt-roster-1',
     'actorId',auth.uid()::text,'workspaceId',v_ws::text,
     'boardId',p_board_id::text,'mode','PERSONAL','interns','[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('contract','tt-ojt-roster-1',
     'actorId',auth.uid()::text,'workspaceId',v_ws::text,
     'boardId',p_board_id::text,
     'mode',CASE WHEN v_group.enabled THEN 'SHARED_LOGIN' ELSE 'SHARED_DISABLED' END,
     'interns',CASE WHEN NOT v_group.enabled THEN '[]'::jsonb ELSE
      coalesce((SELECT jsonb_agg(
       jsonb_build_object('id',id::text,'name',display_name) ORDER BY display_name,id)
       FROM private.tt_ojt_interns WHERE workspace_id=v_ws
        AND board_id=p_board_id AND shared_user_id=auth.uid() AND active
      ),'[]'::jsonb) END);
 END $f$;

CREATE FUNCTION public.timetracker_ojt_select(
 p_board_id uuid,p_intern_id uuid,p_pin text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_profile private.tt_ojt_interns%ROWTYPE;
   v_token text;v_until timestamptz;
 BEGIN
  v_ws:=private.tt_ojt_shared(p_board_id);
  SELECT * INTO v_profile FROM private.tt_ojt_interns
   WHERE id=p_intern_id AND workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=auth.uid() AND active FOR UPDATE;
  IF NOT FOUND THEN
   RETURN jsonb_build_object('contract','tt-ojt-select-1','ok',false);
  END IF;
  IF v_profile.locked_until>clock_timestamp() THEN
   RETURN jsonb_build_object('contract','tt-ojt-select-1','ok',false);
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{8,12}$'
    OR extensions.crypt(p_pin,v_profile.pin_hash)<>v_profile.pin_hash THEN
   UPDATE private.tt_ojt_interns
    SET failed_attempts=CASE WHEN failed_attempts>=4 THEN 0 ELSE failed_attempts+1 END,
     locked_until=CASE WHEN failed_attempts>=4 THEN clock_timestamp()+interval '15 minutes'
      ELSE NULL END WHERE id=v_profile.id;
   INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,intern_id,action)
    VALUES(v_ws,p_board_id,auth.uid(),v_profile.id,'verification_failed');
   RETURN jsonb_build_object('contract','tt-ojt-select-1','ok',false);
  END IF;
  UPDATE private.tt_ojt_interns SET failed_attempts=0,locked_until=NULL
   WHERE id=v_profile.id;
  -- Only one active identity session per intern. Other interns remain independent.
  UPDATE private.tt_ojt_sessions SET revoked_at=clock_timestamp()
    WHERE intern_id=v_profile.id AND revoked_at IS NULL;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_until:=clock_timestamp()+interval '8 hours';
  INSERT INTO private.tt_ojt_sessions(
    workspace_id,board_id,shared_user_id,intern_id,token_hash,expires_at)
  VALUES(v_ws,p_board_id,auth.uid(),v_profile.id,
    encode(extensions.digest(v_token,'sha256'),'hex'),v_until);
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,intern_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),v_profile.id,'identity_selected');
  RETURN jsonb_build_object('contract','tt-ojt-select-1','ok',true,
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,
   'boardId',p_board_id::text,'internId',v_profile.id::text,
   'name',v_profile.display_name,'token',v_token,'expiresAt',v_until);
 END $f$;

CREATE FUNCTION private.tt_ojt_verify(p_board_id uuid,p_token text)
 RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_intern uuid;
 BEGIN
  v_ws:=private.tt_ojt_shared(p_board_id);
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Intern verification required' USING ERRCODE='42501';
  END IF;
  SELECT s.intern_id INTO v_intern
   FROM private.tt_ojt_sessions s JOIN private.tt_ojt_interns i ON i.id=s.intern_id
   WHERE s.workspace_id=v_ws AND s.board_id=p_board_id
    AND s.shared_user_id=auth.uid()
    AND s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND i.active
    AND EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts g
       WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
        AND g.shared_user_id=auth.uid() AND g.enabled);
  IF v_intern IS NULL THEN
   RAISE EXCEPTION 'Intern verification expired or revoked' USING ERRCODE='42501';
  END IF;
  RETURN v_intern;
 END $f$;
CREATE FUNCTION public.timetracker_ojt_leave(p_board_id uuid,p_token text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_id uuid;v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_shared(p_board_id);
  v_id:=private.tt_ojt_verify(p_board_id,p_token);
  UPDATE private.tt_ojt_sessions SET revoked_at=clock_timestamp()
   WHERE intern_id=v_id AND shared_user_id=auth.uid()
     AND workspace_id=v_ws AND board_id=p_board_id
     AND token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  RETURN jsonb_build_object('contract','tt-ojt-leave-1','ok',true);
 END $f$;
CREATE FUNCTION public.timetracker_ojt_snapshot(p_board_id uuid,p_token text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_id uuid;v_name text;
 BEGIN
  v_id:=private.tt_ojt_verify(p_board_id,p_token);
  v_ws:=private.tt_ojt_shared(p_board_id);
  SELECT display_name INTO v_name FROM private.tt_ojt_interns WHERE id=v_id;
  RETURN jsonb_build_object('contract','tt-ojt-attendance-1',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'internId',v_id::text,'name',v_name,
   'records',coalesce((
     SELECT jsonb_agg(jsonb_build_object(
       'id',a.id::text,'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
       'location',a.location,'workNote',a.work_note)
      ORDER BY a.clock_in_at DESC)
     FROM (SELECT * FROM private.tt_ojt_attendance
       WHERE workspace_id=v_ws AND board_id=p_board_id AND intern_id=v_id
       ORDER BY clock_in_at DESC LIMIT 50) a
   ),'[]'::jsonb));
 END $f$;

CREATE FUNCTION public.timetracker_ojt_commit(
 p_board_id uuid,p_token text,p_action text,p_record_id uuid,
 p_location text,p_geo jsonb,p_work_note text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_id uuid;v_record uuid;v_stamp timestamptz;
   v_geo_time timestamptz;v_note text:=trim(coalesce(p_work_note,''));
 BEGIN
  v_id:=private.tt_ojt_verify(p_board_id,p_token);
  v_ws:=private.tt_ojt_shared(p_board_id);
  IF p_action NOT IN ('clock-in','clock-out')
    OR p_location NOT IN (
      'Office-Base Duty','Offsite (Home)','Local Field Works',
      'Out of Town Assignment','International Field Assignments')
    OR length(v_note)>500
    OR (p_action='clock-in' AND p_location='Offsite (Home)' AND length(v_note)=0)
    OR jsonb_typeof(p_geo)<>'object'
    OR p_geo->>'status' IS DISTINCT FROM 'captured'
    OR jsonb_typeof(p_geo->'latitude')<>'number'
    OR jsonb_typeof(p_geo->'longitude')<>'number'
    OR jsonb_typeof(p_geo->'accuracy')<>'number'
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
  IF v_geo_time IS NULL OR v_geo_time<clock_timestamp()-interval '10 minutes'
     OR v_geo_time>clock_timestamp()+interval '2 minutes' THEN
   RAISE EXCEPTION 'GPS fix is expired or in the future' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_ws::text||':tt-ojt:'||v_id::text,0));
  -- Recheck the session following the per-intern lock.
  IF private.tt_ojt_verify(p_board_id,p_token) IS DISTINCT FROM v_id THEN
   RAISE EXCEPTION 'Intern verification changed' USING ERRCODE='42501';
  END IF;
  v_stamp:=clock_timestamp();
  IF p_action='clock-in' THEN
   IF p_record_id IS NOT NULL OR EXISTS(SELECT 1 FROM private.tt_ojt_attendance
     WHERE intern_id=v_id AND clock_out_at IS NULL) THEN
    RAISE EXCEPTION 'An attendance session is already active' USING ERRCODE='PT409';
   END IF;
   INSERT INTO private.tt_ojt_attendance(
     workspace_id,board_id,shared_user_id,intern_id,clock_in_at,location,
     work_note,clock_in_geo,clock_in_actor)
    VALUES(v_ws,p_board_id,auth.uid(),v_id,v_stamp,p_location,
     nullif(v_note,''),p_geo,auth.uid()) RETURNING id INTO v_record;
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
  RETURN jsonb_build_object('contract','tt-ojt-commit-1','mode','COMMITTED',
    'actorId',auth.uid()::text,'workspaceId',v_ws::text,
    'boardId',p_board_id::text,'internId',v_id::text,
    'recordId',v_record::text,'action',p_action,'committedAt',v_stamp);
 END $f$;

-- Administrators can review identity-specific attendance but never receive GPS or PINs.
CREATE FUNCTION public.timetracker_ojt_admin_attendance(p_board_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  RETURN jsonb_build_object('contract','tt-ojt-admin-attendance-1',
    'actorId',auth.uid()::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'records',coalesce((
     SELECT jsonb_agg(jsonb_build_object(
      'id',a.id::text,'internId',a.intern_id::text,
      'name',i.display_name,'clockIn',a.clock_in_at,
      'clockOut',a.clock_out_at,'location',a.location)
      ORDER BY a.clock_in_at DESC)
     FROM (SELECT * FROM private.tt_ojt_attendance
       WHERE workspace_id=v_ws AND board_id=p_board_id
       ORDER BY clock_in_at DESC LIMIT 100) a
     JOIN private.tt_ojt_interns i ON i.id=a.intern_id
    ),'[]'::jsonb));
 END $f$;

-- Registered shared accounts cannot write the legacy PERSONAL attendance state:
-- their records must always be attributed to a verified intern profile.
CREATE FUNCTION private.tt_ojt_block_legacy_clock() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $f$
 BEGIN
  IF auth.uid() IS NOT NULL
   AND NEW.module_id='time-tracker'
   AND NEW.state_key='timetracker.attendance.v1'
   AND NEW.scope='shared'
   AND EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts g
     WHERE g.workspace_id=NEW.workspace_id AND g.shared_user_id=auth.uid()
      AND g.board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid) THEN
   RAISE EXCEPTION 'Use an individually verified OJT attendance identity'
     USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END $f$;
CREATE TRIGGER tt_ojt_block_legacy_clock
 BEFORE INSERT OR UPDATE OF value ON public.module_state_entries
 FOR EACH ROW EXECUTE FUNCTION private.tt_ojt_block_legacy_clock();

-- No direct table access or private helper RPCs.
REVOKE ALL ON FUNCTION private.tt_ojt_scope(uuid),
 private.tt_ojt_admin(uuid),private.tt_ojt_shared(uuid),
 private.tt_ojt_verify(uuid,text),private.tt_ojt_block_legacy_clock()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_admin_snapshot(uuid),
 public.timetracker_ojt_roster(uuid),
 public.timetracker_ojt_select(uuid,uuid,text),
 public.timetracker_ojt_leave(uuid,text),
 public.timetracker_ojt_snapshot(uuid,text),
 public.timetracker_ojt_admin_attendance(uuid),
 public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,text,boolean),
 public.timetracker_ojt_commit(uuid,text,text,uuid,text,jsonb,text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ojt_admin_snapshot(uuid),
 public.timetracker_ojt_roster(uuid),
 public.timetracker_ojt_select(uuid,uuid,text),
 public.timetracker_ojt_leave(uuid,text),
 public.timetracker_ojt_snapshot(uuid,text),
 public.timetracker_ojt_admin_attendance(uuid),
 public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,text,boolean),
 public.timetracker_ojt_commit(uuid,text,text,uuid,text,jsonb,text)
 FROM PUBLIC,anon;
COMMIT;
