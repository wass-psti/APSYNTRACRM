-- CP-WS-02D/B3 — dormant trusted delivery receipt and audit contract.
-- Disposable only. NO browser grants, NO provider integration, NO real email.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws02d_invitations') IS NULL
  OR to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regclass('private.ws02d_delivery_receipts') IS NOT NULL
  OR to_regclass('private.ws02d_delivery_events') IS NOT NULL
  OR to_regprocedure('private.ws02d_record_delivery_outcome(uuid,text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D/B3 delivery receipt prerequisite or collision'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE private.ws02d_delivery_receipts(
 invitation_id uuid PRIMARY KEY REFERENCES private.ws02d_invitations(id),
 state text NOT NULL CHECK(state IN ('provider-accepted','delivery-uncertain')),
 provider_message_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='provider-accepted')=(provider_message_id IS NOT NULL))
);
CREATE UNIQUE INDEX ws02d_delivery_provider_unique
 ON private.ws02d_delivery_receipts(provider_message_id)
 WHERE provider_message_id IS NOT NULL;
CREATE TABLE private.ws02d_delivery_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invitation_id uuid NOT NULL REFERENCES private.ws02d_invitations(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('provider-accepted','delivery-uncertain')),
 provider_message_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK((outcome='provider-accepted')=(provider_message_id IS NOT NULL))
);
CREATE INDEX ws02d_delivery_events_by_invite
 ON private.ws02d_delivery_events(invitation_id,occurred_at DESC,id DESC);
ALTER TABLE private.ws02d_delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02d_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02d_delivery_receipts,private.ws02d_delivery_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws02d_delivery_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- This private function is only a future trusted-backend callback contract.
-- It is deliberately ungranted to anon/authenticated. A live GoTrue user
-- context plus current issue authority is required even for a trusted caller.
CREATE FUNCTION private.ws02d_record_delivery_outcome(
 p_invitation_id uuid,p_state text,p_provider_message_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record$
DECLARE
 v_actor uuid:=auth.uid();
 v_session uuid;
 v_inv private.ws02d_invitations%ROWTYPE;
 v_previous private.ws02d_delivery_receipts%ROWTYPE;
 v_replayed boolean:=false;
BEGIN
 v_session:=private.ws01_signed_actor_session();
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags f
   WHERE f.id IS TRUE AND f.enabled IS TRUE)
 THEN RAISE EXCEPTION 'Delivery outcome recording not activated'
  USING ERRCODE='42501'; END IF;
 IF p_invitation_id IS NULL OR p_state IS NULL
  OR p_state NOT IN('provider-accepted','delivery-uncertain')
  OR (p_state='provider-accepted') IS DISTINCT FROM
       (p_provider_message_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid delivery outcome'
 USING ERRCODE='22023'; END IF;
 SELECT * INTO v_inv FROM private.ws02d_invitations i
  WHERE i.id=p_invitation_id FOR UPDATE;
 IF NOT FOUND OR v_actor IS NULL OR v_inv.issued_by IS DISTINCT FROM v_actor
  OR NOT private.ws02d_sender_authorized(v_inv.workspace_id,v_actor)
 THEN RAISE EXCEPTION 'Delivery outcome signer denied'
 USING ERRCODE='42501'; END IF;

 SELECT * INTO v_previous FROM private.ws02d_delivery_receipts r
  WHERE r.invitation_id=p_invitation_id FOR UPDATE;
 IF FOUND THEN
  IF v_previous.state=p_state AND
   v_previous.provider_message_id IS NOT DISTINCT FROM p_provider_message_id
  THEN
   v_replayed:=true;
  ELSIF v_previous.state='delivery-uncertain'
   AND p_state='provider-accepted'
  THEN
   UPDATE private.ws02d_delivery_receipts SET state=p_state,
    provider_message_id=p_provider_message_id,updated_at=now()
   WHERE invitation_id=p_invitation_id;
  ELSE
   RAISE EXCEPTION 'Conflicting or downgraded delivery receipt'
   USING ERRCODE='40001';
  END IF;
 ELSE
  INSERT INTO private.ws02d_delivery_receipts(
   invitation_id,state,provider_message_id
  ) VALUES(p_invitation_id,p_state,p_provider_message_id);
 END IF;
 IF NOT v_replayed THEN
  INSERT INTO private.ws02d_delivery_events(
   invitation_id,actor_id,session_id,outcome,provider_message_id
  ) VALUES(p_invitation_id,v_actor,v_session,p_state,p_provider_message_id);
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'invitationId',p_invitation_id,
  'state',p_state,'persisted',true,'idempotent',v_replayed);
END $record$;
REVOKE ALL ON FUNCTION private.ws02d_record_delivery_outcome(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
-- No provider webhooks, no secret key, no email or live membership change.
COMMIT;
