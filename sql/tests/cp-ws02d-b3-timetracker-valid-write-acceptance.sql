-- CP-WS-02D/B3 signed TimeTracker clock-in/out: valid writes + denial.
-- Synthetic GoTrue JWT session claims; disposable PG17 only; full rollback.
-- TimeTracker RPC is INTERNAL-ONLY: do not grant EXECUTE to authenticated.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR has_function_privilege('authenticated',
  'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon',
  'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
 OR (SELECT count(*) FROM public.module_state_entries
    WHERE module_id='time-tracker')<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'TimeTracker positive acceptance not isolated/default denied'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE tt_b3_base ON COMMIT PRESERVE ROWS AS
 SELECT (SELECT count(*) FROM public.module_state_entries) AS states,
  (SELECT count(*) FROM private.ws02d_member_access) AS roles;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);
CREATE TEMP TABLE tt_b3_created(id text PRIMARY KEY) ON COMMIT DROP;
DO $clock_in$
DECLARE r jsonb;record jsonb;geo jsonb:=
 '{"status":"captured","latitude":10.318,"longitude":123.923,"accuracyMeters":9}'::jsonb;
BEGIN
 r:=public.timetracker_commit_attendance_raw_gps03(
  'clock-in',NULL,'Site A','Operations',geo,'Start work','{"shift":"day"}'::jsonb);
 record:=r->'record';
 IF r->>'action'<>'clock-in' OR (r->>'revision')::integer<>1
 OR record->>'ownerId'<>'cloud:cccccccc-cccc-4ccc-8ccc-cccccccccccc'
 OR record->'clockIn'->'geo' IS DISTINCT FROM geo
 OR record->'clockIn'->>'location'<>'Site A'
 OR record->'clockIn'->>'workNote'<>'Start work'
 OR record->'clockOut'<>'null'::jsonb
 OR record->'attendancePolicy'->>'shift'<>'day'
 OR r->>'value' IS NULL
 THEN RAISE EXCEPTION 'Signed clock-in / independent GPS record incorrect'; END IF;
 INSERT INTO pg_temp.tt_b3_created(id) VALUES(record->>'id');
 IF (SELECT revision FROM public.module_state_entries WHERE
  module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND workspace_id='00000000-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'Clock-in authoritative CAS revision incorrect'; END IF;
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
   'clock-in',NULL,'Site A','Operations',geo,NULL,NULL);
  RAISE EXCEPTION 'Duplicate active signed clock-in accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM<>'WM_ATTENDANCE_ACTIVE_EXISTS' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
   'clock-out','other-record','Site A','Operations',geo,NULL,NULL);
  RAISE EXCEPTION 'Stale clock-out record accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM<>'WM_ATTENDANCE_SESSION_CHANGED' THEN RAISE; END IF;
 END;
END $clock_in$;
DO $clock_out$
DECLARE r jsonb;record jsonb;
 geo jsonb:='{"status":"captured","latitude":10.319,"longitude":123.927,"accuracyMeters":7}'::jsonb;
 original jsonb:='{"status":"captured","latitude":10.318,"longitude":123.923,"accuracyMeters":9}'::jsonb;
BEGIN
 r:=public.timetracker_commit_attendance_raw_gps03(
  'clock-out',(SELECT id FROM pg_temp.tt_b3_created),
  'Site B','Operations',geo,'End work',NULL);
 record:=r->'record';
 IF r->>'action'<>'clock-out' OR (r->>'revision')::integer<>2
 OR record->'clockOut'->'geo' IS DISTINCT FROM geo
 OR record->'clockIn'->'geo' IS DISTINCT FROM original
 OR record->'clockIn'->>'location'<>'Site A'
 OR record->'clockOut'->>'location'<>'Site B'
 OR record->'clockOut'->>'workNote'<>'End work'
 OR record->>'id' IS DISTINCT FROM (SELECT id FROM pg_temp.tt_b3_created)
 THEN RAISE EXCEPTION 'Clock-out changed independent GPS or attendance record'; END IF;
 IF (SELECT count(*) FROM public.module_state_entries WHERE
  module_id='time-tracker' AND workspace_id='00000000-0000-4000-8000-000000000001'
  AND state_key IN('timetracker.attendance.v1','timetracker.attendance.v1.backup'))<>2
 OR (SELECT value::jsonb->'records'->0->'clockOut'
  FROM public.module_state_entries WHERE
  module_id='time-tracker' AND state_key='timetracker.attendance.v1.backup') IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'Atomic recovery backup or revision incorrect'; END IF;
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
   'clock-out',(SELECT id FROM pg_temp.tt_b3_created),
   'Site B','Operations',geo,NULL,NULL);
  RAISE EXCEPTION 'Repeat clock-out without active session accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM<>'WM_ATTENDANCE_NO_ACTIVE' THEN RAISE; END IF;
 END;
END $clock_out$;
-- Existing Viewer can have module access but must be unable to clock.
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_disabled$
BEGIN
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
    'clock-in',NULL,'Site A','Operations','{"status":"captured"}'::jsonb,NULL,NULL);
  RAISE EXCEPTION 'Default-disabled Viewer clocked' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $viewer_disabled$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer_enabled$
BEGIN
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
    'clock-in',NULL,'Site A','Operations','{"status":"captured"}'::jsonb,NULL,NULL);
  RAISE EXCEPTION 'Enabled Viewer clocked' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $viewer_enabled$;
-- Foreign member must not read/change the signed actor's attendance state.
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE r jsonb;
BEGIN
 r:=public.timetracker_commit_attendance_raw_gps03(
  'clock-in',NULL,'Site Foreign','Logistics','{"status":"captured","latitude":1}'::jsonb,NULL,NULL);
 IF (r->>'revision')::integer<>1
 OR (SELECT count(*) FROM public.module_state_entries
   WHERE module_id='time-tracker' AND state_key='timetracker.attendance.v1'
    AND workspace_id='00000000-0000-4000-8000-000000000002')<>1
 OR (SELECT revision FROM public.module_state_entries
   WHERE module_id='time-tracker' AND state_key='timetracker.attendance.v1'
    AND workspace_id='00000000-0000-4000-8000-000000000001')<>2
 THEN RAISE EXCEPTION 'Foreign attendance isolation failed'; END IF;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(
    'clock-out',NULL,'Site Foreign','Logistics','{"status":"captured"}'::jsonb,NULL,NULL);
  RAISE EXCEPTION 'Expired signed actor clocked out' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $expired$;
ROLLBACK;
DO $rollback$
DECLARE base record;
BEGIN
 SELECT * INTO STRICT base FROM pg_temp.tt_b3_base;
 IF (SELECT count(*) FROM public.module_state_entries)<>base.states
 OR (SELECT count(*) FROM private.ws02d_member_access)<>base.roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'TimeTracker acceptance rollback changed fixture'; END IF;
 RAISE NOTICE 'WS02D/B3 internal signed TimeTracker clock-in/out positive/negative PASS';
END $rollback$;
DROP TABLE pg_temp.tt_b3_base;
