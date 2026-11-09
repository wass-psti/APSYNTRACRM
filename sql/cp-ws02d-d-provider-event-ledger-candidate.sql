-- CP-WS-02D/D — durable provider webhook evidence, default-deny.
-- Install in disposable PostgreSQL only until recovery, verified sender and
-- a dedicated trusted webhook writer role have passed production review.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('private.ws02d_delivery_receipts') IS NULL
 OR to_regclass('private.ws02d_invitations') IS NULL
 OR to_regclass('private.ws02d_verified_provider_events') IS NOT NULL
 OR to_regprocedure('private.ws02d_record_verified_provider_event(text,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D provider event prerequisites/collision'
  USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TABLE private.ws02d_verified_provider_events(
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 4 AND 128
  AND event_id ~ '^[A-Za-z0-9_-]+$'),
 invitation_id uuid NOT NULL REFERENCES private.ws02d_invitations(id),
 provider_message_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('submitted','delivered','failed')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ws02d_webhook_events_invitation
 ON private.ws02d_verified_provider_events(invitation_id,occurred_at);
CREATE TABLE private.ws02d_provider_delivery_status(
 invitation_id uuid PRIMARY KEY REFERENCES private.ws02d_invitations(id),
 provider_message_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN('submitted','delivered','failed')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.ws02d_verified_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02d_provider_delivery_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02d_verified_provider_events,
 private.ws02d_provider_delivery_status FROM PUBLIC,anon,authenticated;

-- The caller is a trusted server which independently verifies the raw
-- provider webhook HMAC, timestamp and message correlation. NO public grants.
-- Never use this private function as a browser-accessible webhook.
CREATE FUNCTION private.ws02d_record_verified_provider_event(
 p_event_id text,p_provider_message_id uuid,p_outcome text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record$
DECLARE
 v_receipt private.ws02d_delivery_receipts%ROWTYPE;
 v_old private.ws02d_verified_provider_events%ROWTYPE;
 v_state private.ws02d_provider_delivery_status%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
  WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation delivery events disabled' USING ERRCODE='42501'; END IF;
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 4 AND 128
  OR p_event_id !~ '^[A-Za-z0-9_-]+$'
  OR p_provider_message_id IS NULL OR
  p_outcome NOT IN('submitted','delivered','failed') OR p_outcome IS NULL
 THEN RAISE EXCEPTION 'Invalid provider event' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_receipt FROM private.ws02d_delivery_receipts
  WHERE provider_message_id=p_provider_message_id AND state='provider-accepted'
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Uncorrelated provider event'
  USING ERRCODE='42501'; END IF;
 SELECT * INTO v_old FROM private.ws02d_verified_provider_events
  WHERE event_id=p_event_id;
 IF FOUND THEN
  IF v_old.provider_message_id<>p_provider_message_id OR
     v_old.invitation_id<>v_receipt.invitation_id OR v_old.outcome<>p_outcome
  THEN RAISE EXCEPTION 'Conflicting provider event replay'
   USING ERRCODE='40001'; END IF;
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'state','recorded','persisted',true,'idempotent',true);
 END IF;
 SELECT * INTO v_state FROM private.ws02d_provider_delivery_status
  WHERE invitation_id=v_receipt.invitation_id FOR UPDATE;
 IF FOUND AND (
   (v_state.state='failed' AND p_outcome<>'failed') OR
   (v_state.state='delivered' AND p_outcome='submitted'))
 THEN RAISE EXCEPTION 'Provider delivery status regression'
  USING ERRCODE='42501'; END IF;
 IF NOT FOUND THEN
  INSERT INTO private.ws02d_provider_delivery_status(
   invitation_id,provider_message_id,state
  ) VALUES(v_receipt.invitation_id,p_provider_message_id,p_outcome);
 ELSIF v_state.state<>p_outcome THEN
  UPDATE private.ws02d_provider_delivery_status SET
   state=p_outcome,updated_at=now()
  WHERE invitation_id=v_receipt.invitation_id;
 END IF;
 INSERT INTO private.ws02d_verified_provider_events(
  event_id,invitation_id,provider_message_id,outcome
 ) VALUES(p_event_id,v_receipt.invitation_id,p_provider_message_id,p_outcome);
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'state','recorded','persisted',true,'idempotent',false);
END $record$;
REVOKE ALL ON FUNCTION private.ws02d_record_verified_provider_event(text,uuid,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
