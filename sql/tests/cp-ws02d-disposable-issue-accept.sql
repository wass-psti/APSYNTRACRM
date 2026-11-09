-- WS02D synthetic signed issuance and verified recipient acceptance.
-- Disposable PG17 ONLY. No real email delivery. All writes rolled back.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
  OR to_regprocedure('private.ws02d_accept(text)') IS NULL
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
  OR has_function_privilege('authenticated',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon','private.ws02d_accept(text)','EXECUTE')
 THEN RAISE EXCEPTION 'WS02D signed contract is not dormant'; END IF;
END $guard$;
BEGIN;
CREATE TEMP TABLE ws02d_tokens(token text NOT NULL) ON COMMIT DROP;
UPDATE auth.users SET email='owner@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='recipient@example.invalid'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE auth.users SET email='other@example.invalid'
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $off$
BEGIN
 BEGIN
  PERFORM private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'recipient@example.invalid','member',
   '11111111-1111-4111-8111-111111111101');
  RAISE EXCEPTION 'Disabled issue succeeded' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $off$;
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
DO $issue$
DECLARE r jsonb; retry jsonb;
BEGIN
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  ' Recipient@Example.Invalid ','member',
  '11111111-1111-4111-8111-111111111101');
 INSERT INTO pg_temp.ws02d_tokens VALUES(r->>'token');
 IF length(r->>'token')<>101 OR r->>'tokenAvailable'<>'true'
 THEN RAISE EXCEPTION 'One-time trusted token unavailable'; END IF;
 retry:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'recipient@example.invalid','member',
  '11111111-1111-4111-8111-111111111101');
 IF retry->>'idempotent'<>'true' OR retry ? 'token'
 THEN RAISE EXCEPTION 'Retry issued second token'; END IF;
 BEGIN
  PERFORM private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'RECIPIENT@example.invalid','member',
   '11111111-1111-4111-8111-111111111199');
  RAISE EXCEPTION 'Second pending invite issued for same recipient'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'viewer@example.invalid','viewer',
   '11111111-1111-4111-8111-111111111102');
  RAISE EXCEPTION 'Advanced viewer role issued while blocked'
  USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_invitation_events)<>1
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Issuance mutated membership or duplicated audit'; END IF;
END $issue$;

SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',true);
DO $wrong_recipient$
BEGIN
 BEGIN
  PERFORM private.ws02d_accept((SELECT token FROM pg_temp.ws02d_tokens));
  RAISE EXCEPTION 'Mismatched email accepted invite' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $wrong_recipient$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $accept$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_accept((SELECT token FROM pg_temp.ws02d_tokens));
 IF r->>'state'<>'accepted' OR r->>'role'<>'member'
 OR r->>'switched'<>'false'
 THEN RAISE EXCEPTION 'Valid recipient acceptance receipt invalid'; END IF;
 BEGIN
  PERFORM private.ws02d_accept((SELECT token FROM pg_temp.ws02d_tokens));
  RAISE EXCEPTION 'Consumed token replay succeeded' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>6
  OR (SELECT count(*) FROM private.ws02d_member_access
   WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND role='member')<>1
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>2
  OR public.current_workspace_id('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>
   '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Atomic member acceptance or no-switch failed'; END IF;
END $accept$;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
  OR (SELECT count(*) FROM private.ws02d_member_access)<>0
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D synthetic issue/accept rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D issue/accept signed denial PASS';
END $rollback$;
