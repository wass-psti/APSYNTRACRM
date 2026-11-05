-- WS02D synthetic sender authorization, token revocation, expiry and sessions.
-- Disposable PG17 ONLY. No real tokens/accounts. All mutations rolled back.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws02d_revoke(uuid)') IS NULL
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D revoke fixture not default-denied'; END IF;
END $pre$;
BEGIN;
CREATE TEMP TABLE ws02d_test_token(kind text PRIMARY KEY,token text,inv_id uuid)
 ON COMMIT DROP;
UPDATE auth.users SET email='owner@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='foreign@example.invalid'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE auth.users SET email='invited-third@example.invalid'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $nonowner$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000002',
   'invited-third@example.invalid','member',
   '22222222-2222-4222-8222-222222222201');
  RAISE EXCEPTION 'Ordinary member issued invitation' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $nonowner$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $owner$
DECLARE r jsonb;
BEGIN
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000002',
   'invited-third@example.invalid','member',
   '22222222-2222-4222-8222-222222222202');
  RAISE EXCEPTION 'Owner invited across foreign workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'invited-third@example.invalid','member',
  '22222222-2222-4222-8222-222222222203');
 INSERT INTO pg_temp.ws02d_test_token VALUES
  ('revoked',r->>'token',(r->>'invitationId')::uuid);
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'invited-third@example.invalid','member',
  '22222222-2222-4222-8222-222222222204');
 INSERT INTO pg_temp.ws02d_test_token VALUES
  ('expired',r->>'token',(r->>'invitationId')::uuid);
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'foreign@example.invalid','member',
  '22222222-2222-4222-8222-222222222205');
 INSERT INTO pg_temp.ws02d_test_token VALUES
  ('session',r->>'token',(r->>'invitationId')::uuid);
END $owner$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $revoke_denied$
BEGIN
 BEGIN
  PERFORM private.ws02d_revoke(
   (SELECT inv_id FROM pg_temp.ws02d_test_token WHERE kind='revoked'));
  RAISE EXCEPTION 'Foreign nonowner revoked invitation' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoke_denied$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $owner_revoke$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_revoke(
  (SELECT inv_id FROM pg_temp.ws02d_test_token WHERE kind='revoked'));
 IF r->>'state'<>'revoked' THEN RAISE EXCEPTION 'Revocation receipt failed'; END IF;
 BEGIN
  PERFORM private.ws02d_revoke(
   (SELECT inv_id FROM pg_temp.ws02d_test_token WHERE kind='revoked'));
  RAISE EXCEPTION 'Repeated final-state revocation allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $owner_revoke$;
UPDATE private.ws02d_invitations SET expires_at=now()-interval '1 minute'
 WHERE id=(SELECT inv_id FROM pg_temp.ws02d_test_token WHERE kind='expired');
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $revoked_expired$
DECLARE purpose text;
BEGIN
 FOREACH purpose IN ARRAY ARRAY['revoked','expired'] LOOP
  BEGIN
   PERFORM private.ws02d_accept(
    (SELECT token FROM pg_temp.ws02d_test_token WHERE kind=purpose));
   RAISE EXCEPTION 'Revoked/expired invitation granted membership'
    USING ERRCODE='P9999';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $revoked_expired$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $session_denial$
BEGIN
 BEGIN
  PERFORM private.ws02d_accept(
   (SELECT token FROM pg_temp.ws02d_test_token WHERE kind='session'));
  RAISE EXCEPTION 'Expired GoTrue session accepted token'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>4
 THEN RAISE EXCEPTION 'Denied operations changed memberships or audit'; END IF;
END $session_denial$;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
 OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D synthetic revoke/denial rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D revoke/expired/session/foreign denial PASS';
END $rollback$;
