-- CP-WS-02D/D: backend-only durable expiry maintenance. STAGED ONLY.
-- No automatic scheduler, production installation or public EXECUTE grant.
-- Expiry is attributed to the system lifecycle rather than impersonating the issuer.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws02d_invitations') IS NULL OR
    to_regprocedure('private.ws02d_expire_due(integer)') IS NOT NULL OR
    to_regclass('private.ws02d_expiry_events') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D expiry prerequisites or collision' USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE private.ws02d_expiry_events(
 invitation_id uuid PRIMARY KEY REFERENCES private.ws02d_invitations(id),
 expired_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.ws02d_expiry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02d_expiry_events FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.ws02d_expire_due(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $expire$
DECLARE
 v_count integer;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100
 THEN RAISE EXCEPTION 'Invalid expiry batch limit' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation expiry disabled' USING ERRCODE='42501'; END IF;
 WITH due AS(
  SELECT i.id FROM private.ws02d_invitations i
  WHERE i.state='pending' AND i.expires_at<=now()
  ORDER BY i.expires_at,i.id
  LIMIT p_limit FOR UPDATE SKIP LOCKED
 ),changed AS(
  UPDATE private.ws02d_invitations i SET state='expired'
  FROM due WHERE i.id=due.id AND i.state='pending'
  RETURNING i.id
 ),logged AS(
  INSERT INTO private.ws02d_expiry_events(invitation_id)
  SELECT id FROM changed ON CONFLICT DO NOTHING
  RETURNING invitation_id
 ) SELECT count(*)::integer INTO v_count FROM logged;
 RETURN v_count;
END $expire$;
REVOKE ALL ON FUNCTION private.ws02d_expire_due(integer) FROM PUBLIC,anon,authenticated;
COMMIT;
