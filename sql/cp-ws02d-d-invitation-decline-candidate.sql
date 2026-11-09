-- CP-WS-02D/D: recipient-verified, atomic decline; staged/disposable only.
-- No production grant or outbound email. Reject foreign, expired, replayed tokens.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('private.ws02d_accept(text)') IS NULL OR
    to_regprocedure('private.ws02d_decline(text)') IS NOT NULL OR
    to_regclass('private.ws02d_invitation_events') IS NULL
 THEN RAISE EXCEPTION 'WS02D decline dependencies or collision' USING ERRCODE='42501'; END IF;
END $guard$;
ALTER TABLE private.ws02d_invitation_events
 DROP CONSTRAINT ws02d_invitation_events_action_check;
ALTER TABLE private.ws02d_invitation_events
 ADD CONSTRAINT ws02d_invitation_events_action_check CHECK(action IN(
 'invitation.issued','invitation.accepted','invitation.revoked','invitation.declined'));
CREATE FUNCTION private.ws02d_decline(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $decline$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_inv private.ws02d_invitations%ROWTYPE;
 v_email text;
 v_secret text;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
   WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation decline disabled' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR pg_catalog.length(p_token)<>101 OR
    p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE='42501'; END IF;
 v_secret:=pg_catalog.split_part(p_token,'.',2);
 SELECT * INTO v_inv FROM private.ws02d_invitations
  WHERE id=pg_catalog.split_part(p_token,'.',1)::uuid FOR UPDATE;
 IF NOT FOUND OR v_inv.state<>'pending' OR v_inv.expires_at<=now()
  OR extensions.digest(v_inv.token_salt||pg_catalog.decode(v_secret,'hex'),'sha256')
     IS DISTINCT FROM v_inv.token_digest
 THEN RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_email
 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL
  AND u.is_anonymous IS FALSE AND p.status='active';
 IF v_email IS NULL OR v_email<>v_inv.recipient_email
 THEN RAISE EXCEPTION 'Invitation recipient denied' USING ERRCODE='42501'; END IF;
 UPDATE private.ws02d_invitations SET state='declined'
 WHERE id=v_inv.id AND state='pending';
 INSERT INTO private.ws02d_invitation_events(
  invitation_id,workspace_id,actor_id,session_id,action
 ) VALUES(v_inv.id,v_inv.workspace_id,v_actor,v_sid,'invitation.declined');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,'state','declined');
END $decline$;
REVOKE ALL ON FUNCTION private.ws02d_decline(text) FROM PUBLIC,anon,authenticated;
COMMIT;
