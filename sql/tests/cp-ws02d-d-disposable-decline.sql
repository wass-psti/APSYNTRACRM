-- Synthetic confirmed-recipient decline, wrong-email and replay denial.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable' OR
 to_regprocedure('private.ws02d_decline(text)') IS NULL OR
 (SELECT enabled FROM private.ws02d_invitation_flags WHERE id) IS TRUE OR
 has_function_privilege('authenticated','private.ws02d_decline(text)','EXECUTE')
 THEN RAISE EXCEPTION 'WS02D decline not default denied'; END IF;
END $pre$;
BEGIN;
UPDATE auth.users SET email='owner@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='foreign@example.invalid',email_confirmed_at=now()
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE decline_token(token text,inv_id uuid) ON COMMIT DROP;
DO $issue$
DECLARE result jsonb;
BEGIN
 result:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
 'foreign@example.invalid','member','44444444-4444-4444-8444-444444444401');
 INSERT INTO pg_temp.decline_token VALUES(result->>'token',(result->>'invitationId')::uuid);
END $issue$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $wrong$
BEGIN
 BEGIN
  PERFORM private.ws02d_decline((SELECT token FROM pg_temp.decline_token));
  RAISE EXCEPTION 'Wrong recipient declined token' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $wrong$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $verified$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_decline((SELECT token FROM pg_temp.decline_token));
 IF r->>'state'<>'declined' OR
 (SELECT state FROM private.ws02d_invitations WHERE id=(SELECT inv_id FROM pg_temp.decline_token))<>'declined'
 THEN RAISE EXCEPTION 'Decline did not persist'; END IF;
 BEGIN
  PERFORM private.ws02d_accept((SELECT token FROM pg_temp.decline_token));
  RAISE EXCEPTION 'Declined invitation accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM private.ws02d_decline((SELECT token FROM pg_temp.decline_token));
  RAISE EXCEPTION 'Decline replay allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_invitation_events WHERE action='invitation.declined')<>1
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Unexpected decline membership or audit impact'; END IF;
END $verified$;
ROLLBACK;
DO $final$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_invitations)<>0 OR
 (SELECT count(*) FROM private.ws02d_invitation_events)<>0 OR
 (SELECT enabled FROM private.ws02d_invitation_flags WHERE id) IS TRUE
 THEN RAISE EXCEPTION 'WS02D decline rollback failed'; END IF;
 RAISE NOTICE 'WS02D/D declined, recipient binding, replay denial and rollback PASS';
END $final$;
