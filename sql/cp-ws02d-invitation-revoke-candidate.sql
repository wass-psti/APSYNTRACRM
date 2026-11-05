-- CP-WS-02D — private signed revocation; never exposed to browser yet.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('private.ws02d_accept(text)') IS NULL
 OR to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)') IS NULL
 OR to_regprocedure('private.ws02d_revoke(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D revoke prerequisites or collision'
  USING ERRCODE='42501'; END IF;
END $guard$;
CREATE FUNCTION private.ws02d_revoke(p_invitation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $revoke$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_inv private.ws02d_invitations%ROWTYPE;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
   WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation revocation disabled' USING ERRCODE='42501'; END IF;
 IF p_invitation IS NULL
 THEN RAISE EXCEPTION 'Invalid invitation reference' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_inv FROM private.ws02d_invitations
  WHERE id=p_invitation FOR UPDATE;
 IF NOT FOUND OR NOT private.ws02d_sender_authorized(v_inv.workspace_id,v_actor)
 THEN RAISE EXCEPTION 'Invitation revocation denied' USING ERRCODE='42501'; END IF;
 IF v_inv.state<>'pending'
 THEN RAISE EXCEPTION 'Final invitation state cannot be revoked'
 USING ERRCODE='42501'; END IF;
 UPDATE private.ws02d_invitations
 SET state='revoked',revoked_by=v_actor,revoked_at=now()
 WHERE id=p_invitation;
 INSERT INTO private.ws02d_invitation_events(
  invitation_id,workspace_id,actor_id,session_id,action
 ) VALUES(p_invitation,v_inv.workspace_id,v_actor,v_sid,'invitation.revoked');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,'state','revoked');
END $revoke$;
REVOKE ALL ON FUNCTION private.ws02d_revoke(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
