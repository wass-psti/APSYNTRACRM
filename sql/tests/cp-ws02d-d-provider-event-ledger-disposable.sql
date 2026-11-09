-- CP-WS-02D/D provider webhook correlation and replay denial — disposable PG17.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_record_verified_provider_event(text,uuid,text)') IS NULL
 OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 OR has_function_privilege('authenticated',
  'private.ws02d_record_verified_provider_event(text,uuid,text)','EXECUTE')
 OR has_table_privilege('authenticated','private.ws02d_verified_provider_events','SELECT')
 THEN RAISE EXCEPTION 'WS02D webhook default deny failed' USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
DO $disabled$
BEGIN
 BEGIN
  PERFORM private.ws02d_record_verified_provider_event(
   'msg_test_001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered');
  RAISE EXCEPTION 'Disabled event allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $disabled$;
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
CREATE TEMP TABLE provider_event_invite(id uuid PRIMARY KEY) ON COMMIT DROP;
DO $issue$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
 'webhook-recipient@example.invalid','member',
 '11111111-2222-4333-8444-555566667779');
 INSERT INTO pg_temp.provider_event_invite VALUES((r->>'invitationId')::uuid);
 IF (private.ws02d_record_delivery_outcome(
  (r->>'invitationId')::uuid,'provider-accepted',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))->>'persisted'<>'true'
 THEN RAISE EXCEPTION 'Provider submission not persisted'; END IF;
END $issue$;
DO $webhook$
DECLARE r jsonb;
BEGIN
 BEGIN
  PERFORM private.ws02d_record_verified_provider_event(
   'msg_unknown','cccccccc-cccc-4ccc-8ccc-cccccccccccc','delivered');
  RAISE EXCEPTION 'Unknown provider message accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=private.ws02d_record_verified_provider_event(
  'msg_test_001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitted');
 IF r->>'persisted'<>'true' OR r->>'idempotent'<>'false'
 THEN RAISE EXCEPTION 'Provider submission event failed'; END IF;
 r:=private.ws02d_record_verified_provider_event(
  'msg_test_001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitted');
 IF r->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Provider replay caused second event'; END IF;
 r:=private.ws02d_record_verified_provider_event(
  'msg_test_002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered');
 IF r->>'persisted'<>'true'
 THEN RAISE EXCEPTION 'Delivered webhook not persisted'; END IF;
 BEGIN
  PERFORM private.ws02d_record_verified_provider_event(
   'msg_test_001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','failed');
  RAISE EXCEPTION 'Conflicting webhook replay accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM private.ws02d_record_verified_provider_event(
   'msg_test_003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitted');
  RAISE EXCEPTION 'Delivered state regressed to submitted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=private.ws02d_record_verified_provider_event(
  'msg_test_004','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','failed');
 IF r->>'persisted'<>'true' OR
  (SELECT state FROM private.ws02d_provider_delivery_status
    WHERE invitation_id=(SELECT id FROM pg_temp.provider_event_invite))<>'failed'
 THEN RAISE EXCEPTION 'Failure event not persisted'; END IF;
 BEGIN
  PERFORM private.ws02d_record_verified_provider_event(
   'msg_test_005','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered');
  RAISE EXCEPTION 'Failed event regressed to delivered' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_verified_provider_events)<>3
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Webhook event unexpectedly modified membership/audit'; END IF;
END $webhook$;
ROLLBACK;
DO $after$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_verified_provider_events)<>0
 OR (SELECT count(*) FROM private.ws02d_provider_delivery_status)<>0
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D webhook fixture rollback failed'; END IF;
 RAISE NOTICE 'WS02D webhook correlation, replay, state and rollback PASS';
END $after$;
