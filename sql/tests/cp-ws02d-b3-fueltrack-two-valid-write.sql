-- CP-WS-02D/B3 two original FuelTrack write RPCs, synthetic signed fixtures.
-- SOURCE: existing 24-function manifest, not modified code. DISPOSABLE ONLY.
\set ON_ERROR_STOP on
DO $pre$ BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.module_activity_events)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'FuelTrack fixture must be isolated and default-off' USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE fuel_b3_baseline ON COMMIT PRESERVE ROWS AS SELECT
 (SELECT count(*) FROM public.module_activity_events) AS events,
 (SELECT count(*) FROM public.module_state_entries) AS states,
 (SELECT count(*) FROM private.ws02d_member_access) AS roles;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $valid$
DECLARE r jsonb;again jsonb;event jsonb;
BEGIN
 event:=public.append_module_activity('fueltrack-plus','b3-event-000001','submit',
   'Synthetic FuelTrack event','fixture event message','req-b3-1','{"test":true}'::jsonb);
 IF event->>'id'<>'b3-event-000001' OR event->>'type'<>'submit'
  OR (event->>'sequence')::bigint<1
  OR (event->>'actorUserId')::uuid IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'FuelTrack source-preserved activity insert incorrect'; END IF;
 again:=public.append_module_activity('fueltrack-plus','b3-event-000001','submit',
    'Synthetic FuelTrack event','fixture event message','req-b3-1','{"test":true}'::jsonb);
 IF again->>'id'<>'b3-event-000001'
 OR (again->>'sequence')::bigint<>(event->>'sequence')::bigint
 OR (SELECT count(*) FROM public.module_activity_events WHERE event_id='b3-event-000001')<>1
 THEN RAISE EXCEPTION 'FuelTrack activity replay duplicated event'; END IF;
 r:=public.commit_fueltrack_requests_with_activity('{"requests":[]}',0,
  'b3-commit-000001','review','Synthetic request committed','','req-b3-2','{"test":true}'::jsonb);
 IF (r->>'revision')::bigint<>1 OR r->>'idempotent'<>'false'
  OR r->'activity'->>'id'<>'b3-commit-000001'
  OR (SELECT value FROM public.module_state_entries WHERE module_id='fueltrack-plus'
    AND state_key='fueltrackplus.requests.v3'
    AND workspace_id='00000000-0000-4000-8000-000000000001')<>'{"requests":[]}'
 THEN RAISE EXCEPTION 'Atomic FuelTrack state/activity commit incorrect'; END IF;
 r:=public.commit_fueltrack_requests_with_activity('{"requests":[]}',0,
  'b3-commit-000001','review','Synthetic request committed','','req-b3-2','{"test":true}'::jsonb);
 IF (r->>'revision')::bigint<>1 OR r->>'idempotent'<>'true'
 OR (SELECT count(*) FROM public.module_activity_events WHERE event_id='b3-commit-000001')<>1
 THEN RAISE EXCEPTION 'FuelTrack request replay not idempotent'; END IF;
 BEGIN
  PERFORM public.commit_fueltrack_requests_with_activity('{"requests":[1]}',0,
   'b3-commit-stale1','review','Stale request','',NULL,'{}'::jsonb);
  RAISE EXCEPTION 'Stale FuelTrack request revision accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM public.module_activity_events WHERE event_id='b3-commit-stale1')<>0
 THEN RAISE EXCEPTION 'Stale request created orphan activity'; END IF;
END $valid$;
-- Workspace Viewer can still have valid module access, but never mutate.
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer$
BEGIN
 BEGIN
  PERFORM public.append_module_activity('fueltrack-plus','viewer-00000001','review',
   'Should not append','','','{}'::jsonb);
  RAISE EXCEPTION 'Viewer appended FuelTrack event' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.commit_fueltrack_requests_with_activity('{"requests":[]}',1,
   'viewer-commit001','submit','Should not commit','','','{}'::jsonb);
  RAISE EXCEPTION 'Viewer committed FuelTrack request' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $viewer$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE e jsonb;
BEGIN
 e:=public.append_module_activity('fueltrack-plus','b3-event-000001','issue',
   'Foreign workspace event','','','{}'::jsonb);
 IF e->>'type'<>'issue'
 OR (SELECT count(*) FROM public.module_activity_events WHERE event_id='b3-event-000001')<>2
 THEN RAISE EXCEPTION 'FuelTrack foreign same-id workspace isolation violated'; END IF;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.append_module_activity('fueltrack-plus','expired-000001','issue',
   'Expired event','','','{}'::jsonb);
  RAISE EXCEPTION 'Expired FuelTrack session appended activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $expired$;
ROLLBACK;
DO $verify$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.fuel_b3_baseline;
 IF (SELECT count(*) FROM public.module_activity_events)<>b.events
 OR (SELECT count(*) FROM public.module_state_entries)<>b.states
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'FuelTrack two-path rollback failed'; END IF;
 RAISE NOTICE 'WS02D/B3 FuelTrack append and atomic commit positive/negative PASS';
END $verify$;
DROP TABLE pg_temp.fuel_b3_baseline;
