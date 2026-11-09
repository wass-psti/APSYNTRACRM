-- CP-WS-02D/B: sender/recipient limits, one-time receipt and no send grants.
-- Disposable PostgreSQL 17 only; synthetic users/emails, transaction rolled back.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id IS TRUE)
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 THEN RAISE EXCEPTION 'WS02D/B rate fixture is not dormant and isolated'
 USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
UPDATE auth.users SET email='owner@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='foreign-owner@example.invalid'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id IS TRUE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $sender_quota$
DECLARE n integer; first jsonb; replay jsonb; r jsonb;
BEGIN
 FOR n IN 1..5 LOOP
  r:=private.ws02d_issue(
    '00000000-0000-4000-8000-000000000001',
    'candidate'||n||'@example.invalid','member',
    ('11111111-1111-4111-8111-'||pg_catalog.lpad(n::text,12,'0'))::uuid);
  IF r->>'tokenAvailable'<>'true' OR r->>'idempotent'<>'false'
  THEN RAISE EXCEPTION 'Fresh authorized invitation failed'; END IF;
  IF n=1 THEN first:=r; END IF;
 END LOOP;
 replay:=private.ws02d_issue(
  '00000000-0000-4000-8000-000000000001',
  'candidate1@example.invalid','member',
  '11111111-1111-4111-8111-000000000001');
 IF replay ? 'token' OR replay->>'tokenAvailable'<>'false'
  OR replay->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Replay leaked another token under quota'; END IF;
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000001',
   'candidate6@example.invalid','member',
   '11111111-1111-4111-8111-000000000006');
  RAISE EXCEPTION 'Sender burst quota bypassed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_invitations)<>5
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>5
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Denied sender quota inserted a record/membership'; END IF;
END $sender_quota$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $recipient_quota$
DECLARE n integer; r jsonb;
BEGIN
 FOR n IN 1..2 LOOP
  r:=private.ws02d_issue(
   '00000000-0000-4000-8000-000000000002',
   'repeat@example.invalid','member',
   ('22222222-2222-4222-8222-'||pg_catalog.lpad(n::text,12,'0'))::uuid);
  IF r->>'idempotent'<>'false' THEN
   RAISE EXCEPTION 'Recipient quota prematurely denied first two'; END IF;
  -- Distinct pending invitations are forbidden. First revoke through the
  -- signed contract, then verify its finalized history still counts toward
  -- the daily recipient quota rather than allowing unlimited reissues.
  IF n=1 THEN
   IF (private.ws02d_revoke((r->>'invitationId')::uuid))->>'state'<>'revoked'
   THEN RAISE EXCEPTION 'First invitation revocation not recorded'; END IF;
  END IF;
 END LOOP;
 BEGIN
  PERFORM private.ws02d_issue(
   '00000000-0000-4000-8000-000000000002',
   'repeat@example.invalid','member',
   '22222222-2222-4222-8222-000000000003');
  RAISE EXCEPTION 'Recipient daily quota bypassed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_invitations)<>7
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>8
 THEN RAISE EXCEPTION 'Recipient quota denial changed records'; END IF;
END $recipient_quota$;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_invitations)<>0
 OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id IS TRUE)
 THEN RAISE EXCEPTION 'WS02D/B quotas fixture not rolled back'; END IF;
 RAISE NOTICE 'CP-WS-02D/B sender/recipient rate limits PASS';
END $rollback$;
