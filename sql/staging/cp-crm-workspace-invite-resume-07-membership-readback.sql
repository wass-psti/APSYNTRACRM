-- Read-only, exact-workspace acceptance and membership reconciliation.
-- Run against the existing apsyntra-invites-staging project after recipient acceptance.
SELECT
  (u.id IS NOT NULL) AS recipient_account_found,
  i.id AS invitation_id,
  i.state AS invitation_state,
  (i.accepted_by = u.id) AS accepted_by_recipient,
  i.accepted_at,
  COALESCE(m.active, false) AS active_workspace_membership,
  ma.role AS invitation_membership_role
FROM auth.users u
LEFT JOIN private.ws02d_invitations i
  ON i.workspace_id = '6a051705-e141-44d2-bb87-cf8a124ab17e'::uuid
 AND i.recipient_email = lower(btrim(u.email))
LEFT JOIN public.workspace_members m
  ON m.workspace_id = '6a051705-e141-44d2-bb87-cf8a124ab17e'::uuid
 AND m.user_id = u.id
LEFT JOIN private.ws02d_member_access ma
  ON ma.workspace_id = '6a051705-e141-44d2-bb87-cf8a124ab17e'::uuid
 AND ma.user_id = u.id
WHERE lower(u.email) = 'jspagsuguiron@watchdogautomation.com.ph';
