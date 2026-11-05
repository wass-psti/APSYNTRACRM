-- CP-WS-02D/B3 — synthetic independent domain writer, never production.
-- No application-owned domain function is replaced by this test.
-- Demonstrates required AND-composition of existing domain RBAC and workspace
-- maximum permission, including signed-session, Viewer and foreign denial.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR to_regclass('public.ws02d_fixture_domain_permissions') IS NOT NULL
 OR to_regclass('public.ws02d_fixture_domain_events') IS NOT NULL
 THEN RAISE EXCEPTION 'Disposable independent-domain fixture only'
  USING ERRCODE='42501'; END IF;
END $guard$;

CREATE TABLE public.ws02d_fixture_domain_permissions(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 can_edit boolean NOT NULL DEFAULT false,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.ws02d_fixture_domain_events(
 workspace_id uuid NOT NULL, actor_id uuid NOT NULL, payload text NOT NULL
);
CREATE FUNCTION public.ws02d_fixture_domain_write(p_workspace uuid,p_payload text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $write$
DECLARE actor uuid:=auth.uid();ws uuid;
BEGIN
 ws:=public.current_workspace_id(actor);
 IF actor IS NULL OR ws IS NULL OR ws IS DISTINCT FROM p_workspace
 OR NOT private.ws02d_workspace_ceiling(ws,actor,'edit')
 OR NOT EXISTS (
  SELECT 1 FROM public.ws02d_fixture_domain_permissions g
  WHERE g.workspace_id=ws AND g.user_id=actor AND g.can_edit
 ) THEN RAISE EXCEPTION 'Independent domain write denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.ws02d_fixture_domain_events(workspace_id,actor_id,payload)
 VALUES(ws,actor,p_payload);
 RETURN true;
END $write$;
REVOKE ALL ON FUNCTION public.ws02d_fixture_domain_write(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws02d_fixture_domain_write(uuid,text)
 TO authenticated;

INSERT INTO public.ws02d_fixture_domain_permissions(workspace_id,user_id,can_edit)
VALUES
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true),
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true),
 ('00000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
-- Existing C session ...0003 remains active after WS01B revocation regression.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_allowed$
BEGIN
 IF NOT public.ws02d_fixture_domain_write(
 '00000000-0000-4000-8000-000000000001','member-edits')
 THEN RAISE EXCEPTION 'Member with independent domain grant denied'; END IF;
END $member_allowed$;
-- No domain grant: workspace ceiling alone is never sufficient.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $no_domain_grant$
BEGIN
 BEGIN
  PERFORM public.ws02d_fixture_domain_write(
   '00000000-0000-4000-8000-000000000001','unauthorized');
  RAISE EXCEPTION 'Workspace ceiling alone granted domain write' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $no_domain_grant$;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_disabled$
BEGIN
 BEGIN
  PERFORM public.ws02d_fixture_domain_write(
   '00000000-0000-4000-8000-000000000001','viewer-disabled');
  RAISE EXCEPTION 'Disabled Viewer wrote domain data' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_disabled$;
RESET ROLE;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
SET ROLE authenticated;
DO $viewer_enabled$
BEGIN
 BEGIN
  PERFORM public.ws02d_fixture_domain_write(
   '00000000-0000-4000-8000-000000000001','viewer-enabled');
  RAISE EXCEPTION 'Enabled Viewer wrote domain data' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_enabled$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign_denial$
BEGIN
 BEGIN
  PERFORM public.ws02d_fixture_domain_write(
   '00000000-0000-4000-8000-000000000001','foreign');
  RAISE EXCEPTION 'Foreign user wrote domain data' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_denial$;
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='cccccccc-0000-4000-8000-000000000003';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $revoked_denial$
BEGIN
 BEGIN
  PERFORM public.ws02d_fixture_domain_write(
   '00000000-0000-4000-8000-000000000001','expired');
  RAISE EXCEPTION 'Expired session wrote domain data' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked_denial$;
RESET ROLE;
DO $before_rollback$
BEGIN
 IF (SELECT count(*) FROM public.ws02d_fixture_domain_events)<>1
 THEN RAISE EXCEPTION 'Independent domain denial did not protect writes'; END IF;
 RAISE NOTICE 'WS02D/B3 independent domain ceiling AND signed denial PASS';
END $before_rollback$;
ROLLBACK;
DO $after_rollback$
BEGIN
 IF to_regclass('public.ws02d_fixture_domain_permissions') IS NOT NULL
 OR to_regclass('public.ws02d_fixture_domain_events') IS NOT NULL
 OR to_regprocedure('public.ws02d_fixture_domain_write(uuid,text)') IS NOT NULL
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Independent-domain fixture rollback failed'; END IF;
END $after_rollback$;
