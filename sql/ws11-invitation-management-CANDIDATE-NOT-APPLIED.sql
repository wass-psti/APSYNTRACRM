-- WS11: INVITATION MANAGEMENT -- REVIEW CANDIDATE, NOT APPLIED.
-- Install only after WS02D tables, private issuer, acceptance and revoke are
-- verified in an isolated PostgreSQL 17 test database. NO browser grants.
BEGIN;
DO $check$
BEGIN
 IF to_regclass('private.ws02d_invitations') IS NULL
 OR to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regprocedure('private.ws02d_revoke(uuid)') IS NULL
 OR to_regprocedure('private.ws11_list_invitations(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS11 management prerequisites or object collision'
 USING ERRCODE='42501'; END IF;
END $check$;

CREATE FUNCTION private.ws11_list_invitations(p_workspace uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $listing$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_rows jsonb;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF v_sid IS NULL OR v_actor IS NULL OR p_workspace IS NULL OR
    public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace OR
    NOT private.ws02d_sender_authorized(p_workspace,v_actor)
 THEN RAISE EXCEPTION 'Invitation listing denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'email',s.recipient_email,'state',s.state,'role',s.role,
  'issuedAt',to_char(s.issued_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expiresAt',to_char(s.expires_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"')
 ) ORDER BY s.issued_at DESC,s.id DESC),'[]'::jsonb)
 INTO v_rows FROM (
  SELECT i.id,i.recipient_email,i.state,i.role,i.issued_at,i.expires_at
  FROM private.ws02d_invitations i
  WHERE i.workspace_id=p_workspace ORDER BY i.issued_at DESC,i.id DESC
  LIMIT 100
 ) s;
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace,
   'authorized',true,'invitations',v_rows);
END $listing$;
REVOKE ALL ON FUNCTION private.ws11_list_invitations(uuid)
 FROM PUBLIC,anon,authenticated;

-- A thin, private wrapper gives the trusted server a scope-bound receipt.
-- Actual revocation stays in the existing source-authoritative WS02D routine.
CREATE FUNCTION private.ws11_revoke_invitation(
 p_workspace uuid,p_invitation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $revoke$
DECLARE
 v_actor uuid:=auth.uid();v_sid uuid;
 v_revoke jsonb;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF v_sid IS NULL OR v_actor IS NULL OR
    NOT private.ws02d_sender_authorized(p_workspace,v_actor) OR
    NOT EXISTS(SELECT 1 FROM private.ws02d_invitations
     WHERE id=p_invitation AND workspace_id=p_workspace)
 THEN RAISE EXCEPTION 'Invitation revocation denied' USING ERRCODE='42501'; END IF;
 v_revoke:=private.ws02d_revoke(p_invitation);
 IF v_revoke->>'state' IS DISTINCT FROM 'revoked'
 THEN RAISE EXCEPTION 'Invitation revocation not committed' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace,
  'invitationId',p_invitation,'state','revoked');
END $revoke$;
REVOKE ALL ON FUNCTION private.ws11_revoke_invitation(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Production feature flags stay untouched; no role grants or emails.
COMMIT;
