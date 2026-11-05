-- CP-WS-02D/B3: trusted backend-only execution boundary, PG17 disposable.
-- No real GoTrue, provider, email, production roles, API keys or active grants.
-- Test role is NOLOGIN and transaction-rolled-back. NEVER run on production.
\set ON_ERROR_STOP on
DO $before$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
 OR (SELECT enabled OR advanced_roles_enabled
     FROM private.ws02d_invitation_flags WHERE id)
 OR has_function_privilege('authenticated',
  'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ws02d_b3_trusted_fixture')
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 THEN RAISE EXCEPTION 'Trusted executor requires default-off isolated fixture'
 USING ERRCODE='42501'; END IF;
END $before$;
BEGIN;
CREATE ROLE ws02d_b3_trusted_fixture NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA private TO ws02d_b3_trusted_fixture;
-- Grant exactly one private issuer to a non-login *test* backend role.
-- Ordinary signed clients still cannot invoke token-returning RPCs.
GRANT EXECUTE ON FUNCTION private.ws02d_issue(uuid,text,text,uuid)
 TO ws02d_b3_trusted_fixture;
DO $grants$
BEGIN
 IF NOT has_function_privilege('ws02d_b3_trusted_fixture',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR has_table_privilege('ws02d_b3_trusted_fixture',
   'private.ws02d_invitations','SELECT')
 OR (SELECT rolcanlogin OR rolbypassrls OR rolcreaterole
     FROM pg_roles WHERE rolname='ws02d_b3_trusted_fixture')
 THEN RAISE EXCEPTION 'Trusted no-login issuer scope overbroad' USING ERRCODE='42501'; END IF;
END $grants$;
-- This role is only assumable by the isolated Postgres fixture superuser.
-- A production trusted connection identity/role cannot be activated here.
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
SET LOCAL ROLE ws02d_b3_trusted_fixture;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
DO $default_off$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'staged-invite@example.invalid','member',
   'd0300001-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Disabled trusted issuer returned a token' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $default_off$;
RESET ROLE;
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
SET LOCAL ROLE ws02d_b3_trusted_fixture;
DO $positive$
DECLARE r jsonb; retry jsonb;
BEGIN
 r:=private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'staged-invite@example.invalid','member',
   'd0300001-1111-4111-8111-111111111111');
 IF r->>'tokenAvailable'<>'true'
  OR r->>'state'<>'pending'
  OR pg_catalog.length(r->>'token')<>101
  OR r->>'schemaVersion'<>'1'
 THEN RAISE EXCEPTION 'Backend issuer did not enforce signed owner scope'; END IF;
 retry:=private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'staged-invite@example.invalid','member',
   'd0300001-1111-4111-8111-111111111111');
 IF retry->>'idempotent'<>'true' OR retry ? 'token'
 THEN RAISE EXCEPTION 'Backend issuer replay leaked new token'; END IF;
END $positive$;
-- No issuer data/secret should escape in SQL stdout.
RESET ROLE;
DO $ledger$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_invitations)<>1
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>1
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Trusted no-send issuer audit/membership changed'; END IF;
END $ledger$;
-- Member with active multi-workspace membership cannot elevate to sender.
SET LOCAL ROLE ws02d_b3_trusted_fixture;
SELECT set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000001',true);
DO $nonowner$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'nonowner-denied@example.invalid','member',
   'd0300001-1111-4111-8111-111111111112');
  RAISE EXCEPTION 'Nonowner issued token' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $nonowner$;
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'foreign-denied@example.invalid','member',
   'd0300001-1111-4111-8111-111111111113');
  RAISE EXCEPTION 'Foreign workspace actor issued token' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
-- Stale session: no production Auth mutation; only disposable test session.
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
SET LOCAL ROLE ws02d_b3_trusted_fixture;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
DO $expired$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'expired-denied@example.invalid','member',
   'd0300001-1111-4111-8111-111111111114');
  RAISE EXCEPTION 'Expired owner session issued token' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
RESET ROLE;
DO $final$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_invitations)<>1
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>1
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Denied backend calls created records'; END IF;
END $final$;
ROLLBACK;
DO $after$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ws02d_b3_trusted_fixture')
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
 OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 OR (SELECT count(*) FROM private.ws01_member_roles)<>0
 OR has_function_privilege('authenticated',
  'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Trusted backend test leaked role, grants or invitations'; END IF;
 RAISE NOTICE 'WS02D_B3_NOLOGIN_TRUSTED_ISSUER_PASS isolated owner/foreign/session/no-send';
END $after$;
