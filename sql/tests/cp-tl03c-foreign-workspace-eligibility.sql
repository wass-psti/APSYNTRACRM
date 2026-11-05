-- CP-TL-03C: foreign-workspace genuine-session eligibility inventory.
-- READ-ONLY production query. No user identifiers, email addresses, role
-- assignments, token material, data mutations, or session impersonation.
-- A nonexpired auth.sessions row is a PREREQUISITE INDICATOR only, not
-- proof of a genuine live bearer or successful signed-session acceptance.
WITH target(workspace_id) AS (
 VALUES ('00000000-0000-4000-8000-000000000001'::uuid)
),
 foreign_workspace AS (
 SELECT w.id
 FROM public.workspaces AS w CROSS JOIN target AS t
 WHERE w.id<>t.workspace_id
),
 member_eligibility AS (
 SELECT
  f.id AS workspace_id,
  count(DISTINCT m.user_id) FILTER (WHERE m.active IS TRUE)
   AS active_members,
  count(DISTINCT m.user_id) FILTER (
   WHERE m.active IS TRUE AND pr.status='active'
  ) AS active_profile_members,
  count(DISTINCT m.user_id) FILTER (
   WHERE m.active IS TRUE AND pr.status='active' AND EXISTS (
    SELECT 1 FROM auth.sessions AS s
    WHERE s.user_id=m.user_id
      AND (s.not_after IS NULL OR s.not_after>now())
   )
  ) AS members_with_nonexpired_session_row
 FROM foreign_workspace f
 LEFT JOIN public.workspace_members m ON m.workspace_id=f.id
 LEFT JOIN public.profiles pr ON pr.id=m.user_id
 GROUP BY f.id
),
 summary AS (
 SELECT
  (SELECT count(*) FROM public.workspaces) AS total_workspaces,
  (SELECT count(*) FROM foreign_workspace) AS foreign_workspaces,
  (SELECT count(*) FROM member_eligibility WHERE active_members>0)
   AS foreign_workspaces_with_active_members,
  (SELECT count(*) FROM member_eligibility WHERE active_profile_members>0)
   AS foreign_workspaces_with_active_profiles,
  (SELECT count(*) FROM member_eligibility WHERE members_with_nonexpired_session_row>0)
   AS foreign_workspaces_with_session_candidates,
  coalesce(sum(active_members),0)::bigint AS active_foreign_memberships,
  coalesce(sum(active_profile_members),0)::bigint AS active_foreign_profile_memberships,
  coalesce(sum(members_with_nonexpired_session_row),0)::bigint
   AS foreign_members_with_nonexpired_session_rows
 FROM member_eligibility
)
SELECT *,
 CASE
  WHEN foreign_workspaces=0 THEN 'BLOCKED_NO_FOREIGN_WORKSPACE'
  WHEN active_foreign_memberships=0 THEN 'BLOCKED_NO_ACTIVE_FOREIGN_MEMBERS'
  WHEN active_foreign_profile_memberships=0 THEN 'BLOCKED_NO_ACTIVE_FOREIGN_PROFILE'
  WHEN foreign_members_with_nonexpired_session_rows=0
   THEN 'BLOCKED_NO_NONEXPIRED_FOREIGN_SESSION_ROW'
  ELSE 'CANDIDATE_ONLY__GENUINE_SIGNED_USER_ACCEPTANCE_STILL_REQUIRED'
 END AS foreign_workspace_readiness,
 'NO_WRITES__NO_MEMBERSHIP_CHANGES__NO_IMPERSONATION'::text AS safety_boundary
FROM summary;
