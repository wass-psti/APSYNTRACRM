\set ON_ERROR_STOP on
DO $tests$
DECLARE owner_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 recipient_id uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 owner_ws uuid;recipient_ws uuid;
BEGIN
 IF (SELECT count(*) FROM public.profiles)<>2
    OR (SELECT count(*) FROM public.workspaces)<>2
    OR (SELECT count(*) FROM public.workspace_members)<>2
    OR (SELECT count(*) FROM private.ws01_member_roles WHERE relation='owner')<>2
    OR (SELECT count(*) FROM private.ws01_workspace_policy WHERE privacy='closed')<>2
    OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
    OR (SELECT creation_enabled OR selection_enabled FROM private.ws01_lifecycle_flags WHERE id)
    OR (SELECT count(*) FROM private.ws02d_invitations)<>0
 THEN RAISE EXCEPTION '01D staging onboarding contract violated'; END IF;
 SELECT workspace_id INTO STRICT owner_ws FROM public.workspace_members WHERE user_id=owner_id;
 SELECT workspace_id INTO STRICT recipient_ws FROM public.workspace_members WHERE user_id=recipient_id;
 IF owner_ws=recipient_ws
   OR public.current_workspace_id(owner_id) IS DISTINCT FROM owner_ws
   OR public.current_workspace_id(recipient_id) IS DISTINCT FROM recipient_ws
   OR EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=owner_ws AND user_id=recipient_id)
 THEN RAISE EXCEPTION '01D cross-workspace isolation failed'; END IF;
 RAISE NOTICE 'CP_CRM_WORKSPACE_INVITE_01D_DISPOSABLE_ONBOARDING_PASS';
END $tests$;
