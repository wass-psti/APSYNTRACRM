-- Read-only staging acceptance. Never enable SQL/Edge flags implicitly.
SELECT to_regclass('public.workspace_members') IS NOT NULL AS membership_found,
 to_regclass('private.ws02d_invitations') IS NOT NULL AS invitation_found,
 to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NOT NULL AS issue_found,
 to_regprocedure('private.ws02d_accept(text)') IS NOT NULL AS acceptance_found,
 to_regprocedure('private.ws11_list_invitations(uuid)') IS NOT NULL AS manager_found,
 to_regclass('private.ws02d_invitation_delivery') IS NOT NULL AS delivery_found,
 (SELECT enabled=false AND advanced_roles_enabled=false FROM private.ws02d_invitation_flags WHERE id) AS invites_off,
 (SELECT creation_enabled=false AND selection_enabled=false FROM private.ws01_lifecycle_flags WHERE id) AS workspace_mutation_off,
 (SELECT count(*) FROM public.workspace_members)=0 AS no_real_membership_changes,
 NOT has_table_privilege('authenticated','private.ws02d_invitations','SELECT') AS no_browser_invitation_access;
