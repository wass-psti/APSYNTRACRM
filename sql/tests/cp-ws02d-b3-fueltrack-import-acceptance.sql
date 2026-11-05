-- CP-WS-02D/B3 — original FuelTrack Admin import AND workspace edit.
-- Synthetic events/users only, all DML rolled back, no production connection.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR pg_get_functiondef('public.import_fueltrack_activity_backup(jsonb)'::regprocedure)
   NOT LIKE '%private.ws02d_workspace_ceiling(ws,caller,''edit'')%'
 OR (SELECT count(*) FROM public.module_activity_events)<>0
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B3 FuelTrack import fixture invalid'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TEMP TABLE ws02d_b3_import_baseline ON COMMIT PRESERVE ROWS AS SELECT
 (SELECT count(*) FROM public.module_activity_events) AS events,
 (SELECT count(*) FROM public.ws02d_fixture_fueltrack_roles) AS domain_roles,
 (SELECT count(*) FROM private.ws02d_member_access) AS scoped_roles;
BEGIN;
INSERT INTO public.ws02d_fixture_fueltrack_roles(user_id,role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','User'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Admin'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Admin');
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);
DO $member_admin$
DECLARE imported integer;
BEGIN
 imported:=public.import_fueltrack_activity_backup(
  '[{"id":"b3-migration-001","type":"review","title":"Approved synthetic review",
    "actorUserId":"original-fixture-user","payload":{"fixture":true}}]'::jsonb);
 IF imported<>1
  OR (SELECT count(*) FROM public.module_activity_events e
      WHERE e.workspace_id='00000000-0000-4000-8000-000000000001'
      AND e.module_id='fueltrack-plus'
      AND e.actor_user_id=auth.uid()
      AND e.event_id='b3-migration-001'
      AND (e.payload->>'backupImported')::boolean=true)<>1
 THEN RAISE EXCEPTION 'Admin Member original import changed'; END IF;
 imported:=public.import_fueltrack_activity_backup(
  '[{"id":"b3-migration-001","type":"review","title":"Approved synthetic review"}]'::jsonb);
 IF imported<>0 THEN RAISE EXCEPTION 'Existing import idempotency changed'; END IF;
END $member_admin$;
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_off$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(
   '[{"id":"viewer-denied","title":"Should not import"}]'::jsonb);
  RAISE EXCEPTION 'Default-disabled Viewer imported events'
  USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_off$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer_on$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(
   '[{"id":"viewer-denied-enabled","title":"Should not import"}]'::jsonb);
  RAISE EXCEPTION 'Enabled Viewer imported events' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.module_activity_events)<>1
 THEN RAISE EXCEPTION 'Viewer denial mutated audit events'; END IF;
END $viewer_on$;
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $module_role_denial$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(
   '[{"id":"ordinary-user","title":"Not a FuelTrack Admin"}]'::jsonb);
  RAISE EXCEPTION 'Original FuelTrack Admin domain restriction bypassed'
  USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $module_role_denial$;
UPDATE public.ws02d_fixture_fueltrack_roles SET role='Admin'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $legacy_foreign$
DECLARE imported integer;
BEGIN
 imported:=public.import_fueltrack_activity_backup(
  '[{"id":"foreign-owned","type":"submit","title":"Foreign workspace data"}]'::jsonb);
 IF imported<>1 OR
  (SELECT count(*) FROM public.module_activity_events
   WHERE workspace_id='00000000-0000-4000-8000-000000000002'
     AND event_id='foreign-owned')<>1 OR
  (SELECT count(*) FROM public.module_activity_events
   WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'Independent foreign workspace import isolation failed'; END IF;
END $legacy_foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(
   '[{"id":"expired-session","title":"Should never import"}]'::jsonb);
  RAISE EXCEPTION 'Expired signed session imported events'
  USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.module_activity_events)<>2
 THEN RAISE EXCEPTION 'Denied expired import mutated workspace data'; END IF;
END $expired$;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.ws02d_b3_import_baseline;
 IF (SELECT count(*) FROM public.module_activity_events)<>b.events
 OR (SELECT count(*) FROM public.ws02d_fixture_fueltrack_roles)<>b.domain_roles
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.scoped_roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'FuelTrack synthetic import rollback failed'; END IF;
 RAISE NOTICE 'WS02D/B3 FuelTrack Admin import + Viewer deny PASS';
END $rollback$;
DROP TABLE pg_temp.ws02d_b3_import_baseline;
