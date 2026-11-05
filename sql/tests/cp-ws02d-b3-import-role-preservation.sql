-- CP-WS-02D/B3 preserve signed FuelTrack Admin import for Workspace Member.
-- Run after staged 24-function source candidate on disposable PG17 only.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR pg_get_functiondef('public.import_fueltrack_activity_backup(jsonb)'::regprocedure)
  NOT LIKE '%ws02d_workspace_ceiling(%'
 OR pg_get_functiondef('public.import_fueltrack_activity_backup(jsonb)'::regprocedure)
  NOT LIKE '%auth.uid(),''edit'')%'
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR to_regclass('public.ws02d_fixture_fueltrack_roles') IS NULL
 THEN RAISE EXCEPTION 'B3 import preservation requires disabled synthetic fixture'
  USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE ws02d_import_baseline ON COMMIT PRESERVE ROWS AS
SELECT (SELECT count(*) FROM public.module_activity_events) AS event_count,
 (SELECT count(*) FROM public.ws02d_fixture_fueltrack_roles) AS domain_count;
BEGIN;
INSERT INTO public.ws02d_fixture_fueltrack_roles(user_id,role) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Admin'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Admin');
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $existing_right$
DECLARE n integer;
BEGIN
 n:=public.import_fueltrack_activity_backup(
 '[{"id":"ws02d-b3-post-all-24","title":"Synthetic Admin Member import","type":"review"}]'::jsonb);
 IF n<>1 OR (SELECT count(*) FROM public.module_activity_events
  WHERE workspace_id='00000000-0000-4000-8000-000000000001'
   AND event_id='ws02d-b3-post-all-24')<>1
 THEN RAISE EXCEPTION 'Previously allowed FuelTrack Admin Member import regressed'; END IF;
 n:=public.import_fueltrack_activity_backup(
 '[{"id":"ws02d-b3-post-all-24","title":"Synthetic Admin Member import","type":"review"}]'::jsonb);
 IF n<>0 THEN RAISE EXCEPTION 'Duplicate import idempotency regressed'; END IF;
END $existing_right$;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_denial$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(
   '[{"id":"ws02d-viewer-denied","title":"Forbidden even for module Admin"}]'::jsonb);
  RAISE EXCEPTION 'Workspace Viewer got import despite Admin domain role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.module_activity_events WHERE event_id='ws02d-viewer-denied')<>0
 THEN RAISE EXCEPTION 'Viewer denial wrote activity'; END IF;
END $viewer_denial$;
RESET ROLE;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.ws02d_import_baseline;
 IF (SELECT count(*) FROM public.module_activity_events)<>b.event_count
 OR (SELECT count(*) FROM public.ws02d_fixture_fueltrack_roles)<>b.domain_count
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 THEN RAISE EXCEPTION 'B3 import preservation rollback failed'; END IF;
 RAISE NOTICE 'B3 FuelTrack module Admin Member import and Viewer denial PASS';
END $rollback$;
DROP TABLE pg_temp.ws02d_import_baseline;
