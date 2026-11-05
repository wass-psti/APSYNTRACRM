-- CP-WS-02D/B: maximum workspace permissions; legacy ACL still required.
-- Runs on disposable PG17, synthetic members, transaction rollback.
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
DO $disabled_advanced$
BEGIN
 IF private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view') IS DISTINCT FROM false
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','manage') IS DISTINCT FROM false
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manage') IS DISTINCT FROM true
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','view') IS DISTINCT FROM false
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000002',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','edit') IS DISTINCT FROM true
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000002',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','manage') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Disabled advanced roles or workspace scope escaped'; END IF;
END $disabled_advanced$;
UPDATE private.ws02d_invitation_flags
 SET advanced_roles_enabled=true WHERE id IS TRUE;
DO $advanced$
BEGIN
 IF private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view') IS DISTINCT FROM true
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','edit') IS DISTINCT FROM false
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','manage') IS DISTINCT FROM false
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','manage') IS DISTINCT FROM true
 OR private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','undefined') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Advanced role ceiling predicate failed'; END IF;
END $advanced$;
UPDATE public.workspace_members SET active=false WHERE
 workspace_id='00000000-0000-4000-8000-000000000001'
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $revoked$
BEGIN
 IF private.ws02d_workspace_ceiling(
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','view') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Revoked viewer still authorized'; END IF;
END $revoked$;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT count(*) FROM private.ws01_member_roles)<>0
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B role acceptance rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D/B role permission ceilings PASS';
END $rollback$;
