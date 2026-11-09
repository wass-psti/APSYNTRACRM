-- Synthetic backend-only expiry state and audit, no production changes.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable' OR
 to_regprocedure('private.ws02d_expire_due(integer)') IS NULL OR
 has_function_privilege('authenticated','private.ws02d_expire_due(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'WS02D expiry privilege boundary failed'; END IF;
 BEGIN
  PERFORM private.ws02d_expire_due(1);
  RAISE EXCEPTION 'Disabled expiry unexpectedly allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $pre$;
BEGIN;
UPDATE auth.users SET email='owner@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE expiry_fixture(id uuid,token text) ON COMMIT DROP;
DO $issue$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'expired-recipient@example.invalid','member','55555555-5555-4555-8555-555555555501');
 INSERT INTO pg_temp.expiry_fixture VALUES((r->>'invitationId')::uuid,r->>'token');
END $issue$;
UPDATE private.ws02d_invitations SET expires_at=now()-interval '1 second'
 WHERE id=(SELECT id FROM pg_temp.expiry_fixture);
DO $expire$
DECLARE n integer;
BEGIN
 BEGIN
  PERFORM private.ws02d_expire_due(101);
  RAISE EXCEPTION 'Unbounded expiry allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 n:=private.ws02d_expire_due(1);
 IF n<>1 OR (SELECT state FROM private.ws02d_invitations WHERE id=(SELECT id FROM pg_temp.expiry_fixture))<>'expired'
 OR (SELECT count(*) FROM private.ws02d_expiry_events WHERE invitation_id=(SELECT id FROM pg_temp.expiry_fixture))<>1
 THEN RAISE EXCEPTION 'Expiry transition or audit missing'; END IF;
 IF private.ws02d_expire_due(1)<>0 THEN RAISE EXCEPTION 'Expiry not idempotent'; END IF;
 BEGIN
  PERFORM private.ws02d_accept((SELECT token FROM pg_temp.expiry_fixture));
  RAISE EXCEPTION 'Expired invitation accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Expiry modified membership'; END IF;
END $expire$;
ROLLBACK;
DO $final$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws02d_expiry_events) OR
 EXISTS(SELECT 1 FROM private.ws02d_invitations) OR
 (SELECT enabled FROM private.ws02d_invitation_flags WHERE id) IS TRUE
 THEN RAISE EXCEPTION 'Expiry rollback failed'; END IF;
 RAISE NOTICE 'WS02D/D backend expiry, idempotency and denial PASS';
END $final$;
