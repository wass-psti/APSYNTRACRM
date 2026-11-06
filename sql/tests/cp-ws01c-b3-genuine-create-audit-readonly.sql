-- CP-WS-01C/B3 genuine signed create outcome: production READ-ONLY AUDIT.
-- NEVER creates a workspace, signs in a user, reads secrets, changes role/grants or writes data.
-- Counts and Boolean integrity checks only. Requires a separate user-submitted signed receipt.
WITH req AS (
 SELECT r.actor_id,r.workspace_id,r.request_id,r.requested_name,r.requested_privacy,
   w.id IS NOT NULL AND w.name=r.requested_name AS workspace_confirmed,
   wm.active IS TRUE AS active_owner_membership,
   p.created_by=r.actor_id AND p.privacy=r.requested_privacy AS privacy_confirmed,
   role.relation='owner' AS local_owner_role_confirmed,
   (SELECT count(*) FROM private.ws01_events e
     WHERE e.workspace_id=r.workspace_id AND e.actor_id=r.actor_id
       AND e.action='workspace.created'
       AND e.session_id IS NOT NULL) AS event_count
 FROM private.ws01_create_requests r
 LEFT JOIN public.workspaces w ON w.id=r.workspace_id
 LEFT JOIN public.workspace_members wm ON wm.workspace_id=r.workspace_id
   AND wm.user_id=r.actor_id
 LEFT JOIN private.ws01_workspace_policy p ON p.workspace_id=r.workspace_id
 LEFT JOIN private.ws01_member_roles role ON role.workspace_id=r.workspace_id
   AND role.user_id=r.actor_id
),
integrity AS (
 SELECT count(*) AS created_requests,
        count(*) FILTER(WHERE workspace_confirmed AND active_owner_membership
         AND privacy_confirmed AND local_owner_role_confirmed AND event_count=1)
          AS fully_integrated_requests,
        count(*) FILTER(WHERE NOT COALESCE(workspace_confirmed AND active_owner_membership
         AND privacy_confirmed AND local_owner_role_confirmed AND event_count=1,FALSE))
          AS violations
 FROM req
)
SELECT CASE
 WHEN created_requests=0 THEN 'WS01C_B3_GENUINE_CREATE_PENDING__NO_RECORD'
 WHEN created_requests=fully_integrated_requests AND violations=0
  AND created_requests=(SELECT count(*) FROM private.ws01_events
                        WHERE action='workspace.created')
 THEN 'WS01C_B3_GENUINE_CREATE_PERSISTENCE_AND_AUDIT_INTEGRITY_PASS'
 ELSE 'WS01C_B3_GENUINE_CREATE_INTEGRITY_FAILED' END AS acceptance,
 created_requests,fully_integrated_requests,violations,
 (SELECT count(*) FROM public.workspaces) AS total_workspaces,
 (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships,
 (SELECT count(*) FROM private.ws01_events WHERE action='workspace.created') AS creation_events
FROM integrity;