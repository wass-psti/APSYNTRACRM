-- CP-WS-02D — dormant trusted invitation issuance; disposable only.
-- Returns a secret ONCE to a FUTURE trusted mail process, never to browsers.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws02d_invitations') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D issuer dependencies unavailable'
  USING ERRCODE='42501'; END IF;
END $guard$;

CREATE FUNCTION private.ws02d_sender_authorized(p_workspace uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $s$
 SELECT p_workspace IS NOT NULL AND p_actor IS NOT NULL
  AND public.current_workspace_id(p_actor)=p_workspace
  AND EXISTS(SELECT 1 FROM public.workspace_members m
   WHERE m.workspace_id=p_workspace AND m.user_id=p_actor AND m.active)
  AND (
   EXISTS(SELECT 1 FROM private.ws01_member_roles r
    WHERE r.workspace_id=p_workspace AND r.user_id=p_actor AND r.relation='owner')
   OR EXISTS(SELECT 1 FROM private.ws02d_member_access a
    JOIN private.ws02d_invitation_flags f ON f.id IS TRUE
    WHERE a.workspace_id=p_workspace AND a.user_id=p_actor
     AND a.role='admin' AND f.advanced_roles_enabled IS TRUE)
  );
$s$;
REVOKE ALL ON FUNCTION private.ws02d_sender_authorized(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.ws02d_issue(
 p_workspace uuid,p_email text,p_role text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $issue$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_email text:=pg_catalog.lower(pg_catalog.btrim(p_email));
 v_token text;
 v_salt bytea;
 v_row private.ws02d_invitations%ROWTYPE;
 v_prior private.ws02d_invitations%ROWTYPE;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
   WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Invitation issuance disabled' USING ERRCODE='42501'; END IF;
 IF NOT private.ws02d_sender_authorized(p_workspace,v_actor)
 THEN RAISE EXCEPTION 'Invitation sender denied' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR v_email IS NULL OR
   pg_catalog.length(v_email) NOT BETWEEN 6 AND 254 OR
   v_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$'
  OR p_role IS NULL OR p_role NOT IN('admin','member','viewer')
 THEN RAISE EXCEPTION 'Invalid invitation request' USING ERRCODE='22023'; END IF;
 IF p_role<>'member' AND NOT EXISTS(
  SELECT 1 FROM private.ws02d_invitation_flags
  WHERE id IS TRUE AND advanced_roles_enabled IS TRUE
 ) THEN RAISE EXCEPTION 'Advanced invitation roles disabled' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=v_actor AND status='active' FOR UPDATE;
 SELECT * INTO v_prior FROM private.ws02d_invitations
 WHERE workspace_id=p_workspace AND issued_by=v_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.recipient_email<>v_email OR v_prior.role<>p_role
  THEN RAISE EXCEPTION 'Conflicting invitation retry' USING ERRCODE='40001'; END IF;
  RETURN pg_catalog.jsonb_build_object(
   'schemaVersion',1,'invitationId',v_prior.id,
   'idempotent',true,'tokenAvailable',false,'state',v_prior.state);
 END IF;
 v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 v_salt:=extensions.gen_random_bytes(16);
 INSERT INTO private.ws02d_invitations(
  workspace_id,issued_by,issued_session,request_id,recipient_email,role,
  token_salt,token_digest,expires_at
 ) VALUES(p_workspace,v_actor,v_sid,p_request_id,v_email,p_role,
   v_salt,extensions.digest(v_salt||pg_catalog.decode(v_token,'hex'),'sha256'),
   now()+interval '24 hours')
 RETURNING * INTO v_row;
 INSERT INTO private.ws02d_invitation_events(
  invitation_id,workspace_id,actor_id,session_id,action
 ) VALUES(v_row.id,p_workspace,v_actor,v_sid,'invitation.issued');
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'invitationId',v_row.id,'idempotent',false,
  'tokenAvailable',true,'state','pending','expiresAt',v_row.expires_at,
  'token',v_row.id::text||'.'||v_token);
END $issue$;
REVOKE ALL ON FUNCTION private.ws02d_issue(uuid,text,text,uuid)
 FROM PUBLIC,anon,authenticated;
-- NO trusted role is granted at installation. No mail is sent.
COMMIT;
