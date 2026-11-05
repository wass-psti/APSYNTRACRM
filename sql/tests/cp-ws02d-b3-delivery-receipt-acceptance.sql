-- CP-WS-02D/B3: synthetic provider receipt, uncertainty, idempotency and audit.
-- Disposable PG17 only; no API key, live email or production user.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_record_delivery_outcome(uuid,text,uuid)') IS NULL
 OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 OR (SELECT count(*) FROM private.ws02d_delivery_receipts)<>0
 OR (SELECT count(*) FROM private.ws02d_delivery_events)<>0
 OR has_table_privilege('authenticated','private.ws02d_delivery_receipts','SELECT')
 OR has_table_privilege('anon','private.ws02d_delivery_receipts','INSERT')
 OR has_function_privilege('authenticated',
  'private.ws02d_record_delivery_outcome(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'WS02D/B3 trusted receipt is not dormant/RLS protected'
 USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
DO $disabled$
BEGIN
 BEGIN
  PERFORM private.ws02d_record_delivery_outcome(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','delivery-uncertain',NULL);
  RAISE EXCEPTION 'Disabled delivery audit granted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $disabled$;
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
CREATE TEMP TABLE ws02d_b3_invite_ref(id uuid PRIMARY KEY) ON COMMIT DROP;
DO $issue$
DECLARE result jsonb;
BEGIN
 result:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
  'future-recipient@example.invalid','member',
  '11111111-2222-4333-8444-555566667777');
 IF result->>'tokenAvailable'<>'true'
 THEN RAISE EXCEPTION 'Synthetic invitation not issued'; END IF;
 INSERT INTO pg_temp.ws02d_b3_invite_ref(id)
 VALUES((result->>'invitationId')::uuid);
END $issue$;
DO $uncertain$
DECLARE inv uuid; r jsonb;
BEGIN
 SELECT id INTO STRICT inv FROM pg_temp.ws02d_b3_invite_ref;
 r:=private.ws02d_record_delivery_outcome(inv,'delivery-uncertain',NULL);
 IF r->>'persisted'<>'true' OR r->>'idempotent'<>'false'
 THEN RAISE EXCEPTION 'Uncertain delivery not persisted'; END IF;
 r:=private.ws02d_record_delivery_outcome(inv,'delivery-uncertain',NULL);
 IF r->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Uncertain delivery replay duplicated event'; END IF;
 IF (SELECT count(*) FROM private.ws02d_delivery_events)<>1
  OR (SELECT count(*) FROM private.ws02d_delivery_receipts)<>1
 THEN RAISE EXCEPTION 'Duplicate uncertain delivery record'; END IF;
END $uncertain$;

DO $accepted$
DECLARE inv uuid;r jsonb;
BEGIN
 SELECT id INTO STRICT inv FROM pg_temp.ws02d_b3_invite_ref;
 r:=private.ws02d_record_delivery_outcome(
  inv,'provider-accepted','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 IF r->>'persisted'<>'true' OR r->>'idempotent'<>'false'
 THEN RAISE EXCEPTION 'Provider accepted reconciliation failed'; END IF;
 r:=private.ws02d_record_delivery_outcome(
  inv,'provider-accepted','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 IF r->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Provider accepted replay duplicated receipt'; END IF;
 IF (SELECT count(*) FROM private.ws02d_delivery_events)<>2
  OR (SELECT state FROM private.ws02d_delivery_receipts
   WHERE invitation_id=inv)<>'provider-accepted'
 THEN RAISE EXCEPTION 'Delivery audit transition incorrect'; END IF;
 FOR i IN 1..1 LOOP
  BEGIN
   PERFORM private.ws02d_record_delivery_outcome(inv,'delivery-uncertain',NULL);
   RAISE EXCEPTION 'Accepted delivery downgraded' USING ERRCODE='P9999';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM private.ws02d_record_delivery_outcome(
    inv,'provider-accepted','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   RAISE EXCEPTION 'Conflicting provider identity accepted' USING ERRCODE='P9999';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM private.ws02d_record_delivery_outcome(inv,'provider-accepted',NULL);
   RAISE EXCEPTION 'Provider receipt without ID accepted' USING ERRCODE='P9999';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
END $accepted$;
-- Even if a different signed actor knows an invitation UUID, it cannot
-- persist a receipt or inspect the private audit.
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign_denied$
DECLARE inv uuid;
BEGIN
 SELECT id INTO STRICT inv FROM pg_temp.ws02d_b3_invite_ref;
 BEGIN
  PERFORM private.ws02d_record_delivery_outcome(
   inv,'provider-accepted','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Foreign writer persisted delivery receipt'
  USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_denied$;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
UPDATE auth.sessions SET not_after=now()-interval '1 second'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
DO $expired_denied$
DECLARE inv uuid;
BEGIN
 SELECT id INTO STRICT inv FROM pg_temp.ws02d_b3_invite_ref;
 BEGIN
  PERFORM private.ws02d_record_delivery_outcome(
   inv,'provider-accepted','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Expired owner wrote receipt' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_delivery_events)<>2
  OR (SELECT count(*) FROM private.ws02d_delivery_receipts)<>1
 THEN RAISE EXCEPTION 'Denied receipt mutated audit'; END IF;
END $expired_denied$;
ROLLBACK;
DO $after$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_delivery_receipts)<>0
 OR (SELECT count(*) FROM private.ws02d_delivery_events)<>0
 OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled
    FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B3 delivery receipt fixture rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D/B3 provider outcome audit and denial PASS';
END $after$;
