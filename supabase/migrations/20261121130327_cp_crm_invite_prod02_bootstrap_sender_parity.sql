-- CP-CRM-WORKSPACE-INVITE-BACKEND-02
-- Candidate for a reviewed rollout AFTER real two-user staging SMTP acceptance.
-- Never apply this file by itself to production. No role grants/role mutations.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)') IS NULL
    OR to_regclass('public.apsyntra_role_bootstrap_identities') IS NULL
    OR to_regprocedure('public.apsyntra_crm_effective_role(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'WS02D sender capability prerequisites absent'
   USING ERRCODE='42501';
 END IF;
END $guard$;

-- Only the preexisting canonical bootstrap identities receive bootstrap
-- sender parity, and only in their CURRENT, ACTIVE workspace. The existing
-- workspace-owner/WS02D admin rules remain byte-for-byte equivalent.
CREATE OR REPLACE FUNCTION private.ws02d_sender_authorized(p_workspace uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $sender$
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
   OR EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
    JOIN auth.users u ON u.id=b.user_id
    JOIN public.profiles p ON p.id=b.user_id
    WHERE b.user_id=p_actor AND lower(u.email)=b.canonical_email
      AND lower(p.email)=b.canonical_email
      AND u.email_confirmed_at IS NOT NULL
      AND p.status='active' AND p.platform_role='admin_general_manager'
      AND public.apsyntra_crm_effective_role(p_actor,p_workspace)='admin')
  );
$sender$;
REVOKE ALL ON FUNCTION private.ws02d_sender_authorized(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
;
