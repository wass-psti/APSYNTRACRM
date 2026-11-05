-- CP-WS-02D — private signed invitation acceptance, dormant and ungranted.
-- No client EXECUTE grants. Existing user must already own personal membership.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
  OR to_regprocedure('private.ws02d_accept(text)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D acceptance dependencies or collision'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE FUNCTION private.ws02d_accept(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $accept$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_id uuid;
 v_secret text;
 v_inv private.ws02d_invitations%ROWTYPE;
 v_email text;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
  WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation acceptance disabled' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR pg_catalog.length(p_token)<>101 OR
 p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE='42501'; END IF;
 v_id:=pg_catalog.split_part(p_token,'.',1)::uuid;
 v_secret:=pg_catalog.split_part(p_token,'.',2);
 SELECT * INTO v_inv FROM private.ws02d_invitations
  WHERE id=v_id FOR UPDATE;
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
 IF v_inv.role<>'member' AND NOT EXISTS(SELECT 1
 FROM private.ws02d_invitation_flags
 WHERE id IS TRUE AND advanced_roles_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Advanced invitation roles disabled' USING ERRCODE='42501'; END IF;
 -- Existing members cannot use a new invitation to self-elevate or reactivate
 -- a revoked membership. Role changes require a distinct protected procedure.
 IF EXISTS(SELECT 1 FROM public.workspace_members
  WHERE workspace_id=v_inv.workspace_id AND user_id=v_actor)
 THEN RAISE EXCEPTION 'Existing workspace membership cannot be reassigned'
 USING ERRCODE='42501'; END IF;

 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(v_inv.workspace_id,v_actor,true);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(v_inv.workspace_id,v_actor,'member');
 INSERT INTO private.ws02d_member_access(workspace_id,user_id,role)
 VALUES(v_inv.workspace_id,v_actor,v_inv.role);
 UPDATE private.ws02d_invitations
 SET state='accepted',accepted_by=v_actor,accepted_at=now()
 WHERE id=v_id AND state='pending';
 INSERT INTO private.ws02d_invitation_events(
  invitation_id,workspace_id,actor_id,session_id,action
 ) VALUES(v_id,v_inv.workspace_id,v_actor,v_sid,'invitation.accepted');
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'state','accepted','workspaceId',v_inv.workspace_id,
  'role',v_inv.role,'switched',false);
END $accept$;
REVOKE ALL ON FUNCTION private.ws02d_accept(text) FROM PUBLIC,anon,authenticated;
COMMIT;
