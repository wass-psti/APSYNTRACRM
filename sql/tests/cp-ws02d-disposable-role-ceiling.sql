-- CP-WS-02D/B role ceiling: live actor/session bound, maximum scope only.
-- Disposable PG17, synthetic identities, all changes rolled back.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR has_function_privilege('authenticated',
  'private.ws02d_workspace_ceiling(uuid,uuid,text)','EXECUTE')
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B role ceiling fixture not default-deny'; END IF;
END $pre$;
BEGIN;
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin'),
 ('00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member');
-- Never infer role permissions for someone else's actor ID or missing session.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $owner$
BEGIN
 IF NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manage')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','view')
 THEN RAISE EXCEPTION 'Owner or cross-identity ceiling failed'; END IF;
END $owner$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',true);
DO $viewer_disabled$
BEGIN
 IF private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view')
 THEN RAISE EXCEPTION 'Advanced Viewer activated before permission integration'; END IF;
END $viewer_disabled$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer$
BEGIN
 IF NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','edit')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','manage')
 THEN RAISE EXCEPTION 'Viewer write ceiling failure'; END IF;
END $viewer$;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $admin$
BEGIN
 IF NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','manage')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','invalid')
 THEN RAISE EXCEPTION 'Admin role maximum failed'; END IF;
END $admin$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $member$
BEGIN
 IF NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','edit')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','manage')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view')
 THEN RAISE EXCEPTION 'Member foreign-scope ceiling escaped'; END IF;
END $member$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $revoked$
BEGIN
 IF private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view')
 THEN RAISE EXCEPTION 'Expired GoTrue session retained ceiling'; END IF;
END $revoked$;
ROLLBACK;
DO $after$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT count(*) FROM private.ws01_member_roles)<>0
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Role ceiling disposable rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D/B scoped signed role ceiling PASS';
END $after$;
