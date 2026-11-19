-- CP-CRM-NATIVE-ACCESS-FINAL: production-safe, read-only native assignment audit.
-- This is an aggregate diagnostic, NOT an access activation or signed-user browser test.
-- Run with a read-only SQL client. Do not run privileged writes or impersonate users.
-- One row per configured module: no user IDs or personal data are exposed.
WITH assignments AS (
  SELECT a.module_id, a.user_id, p.status AS profile_status,
         public.current_workspace_id(a.user_id) AS workspace_id,
         public.module_role_for(a.module_id,a.user_id) AS effective_role,
         public.has_module_access(a.module_id,a.user_id) AS effective_access
  FROM public.module_role_assignments a
  LEFT JOIN public.profiles p ON p.id=a.user_id
  WHERE a.enabled IS TRUE
), assessed AS (
  SELECT a.*,
         EXISTS (
           SELECT 1 FROM public.workspace_members w
           WHERE w.workspace_id=a.workspace_id AND w.user_id=a.user_id
             AND w.active IS TRUE
         ) AS active_member
  FROM assignments a
)
SELECT module_id,
       count(*)::int AS enabled_assignments,
       count(*) FILTER (WHERE profile_status='active' AND active_member)::int AS eligible_assignments,
       count(*) FILTER (WHERE effective_access AND effective_role IS NOT NULL)::int AS effective_assignments,
       count(*) FILTER (
         WHERE profile_status='active' AND active_member
           AND (effective_access IS DISTINCT FROM TRUE OR effective_role IS NULL)
       )::int AS active_but_denied,
       count(*) FILTER (WHERE profile_status IS DISTINCT FROM 'active')::int AS inactive_profile_assignments
FROM assessed GROUP BY module_id ORDER BY module_id;

-- Four native applications: exact canonical Board identity and workspace match.
WITH canonical(module_id,board_id,board_name,marker) AS (
  VALUES
    ('time-tracker','46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid,'TimeTracker Attendance','[APSYNTRA:MODULE:timetracker:v1]'),
    ('fund-released-tracker','f36da8fe-8d9d-4629-9938-12533cb3ca39'::uuid,'Fund Released Tracker','[APSYNTRA:MODULE:frt:v1]'),
    ('fueltrack-plus','7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid,'FuelTrack+ v3','[APSYNTRA:MODULE:fueltrack:v1]'),
    ('tradelink','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid,'TradeLink','[APSYNTRA:MODULE:tradelink:v1]')
), eligible AS (
  SELECT a.module_id,a.user_id,public.current_workspace_id(a.user_id) AS workspace_id
  FROM public.module_role_assignments a
  JOIN canonical c ON c.module_id=a.module_id
  WHERE a.enabled IS TRUE
    AND public.has_module_access(a.module_id,a.user_id) IS TRUE
    AND public.module_role_for(a.module_id,a.user_id) IS NOT NULL
)
SELECT c.module_id,count(*)::int AS effective_assignments,
       count(*) FILTER (WHERE b.id IS NOT NULL)::int AS canonical_board_matches,
       count(*) FILTER (WHERE b.id IS NULL)::int AS unresolved_boards
FROM eligible e
JOIN canonical c ON c.module_id=e.module_id
LEFT JOIN public.work_boards b ON b.id=c.board_id
  AND b.workspace_id=e.workspace_id AND b.name=c.board_name
  AND b.description LIKE c.marker||'%'
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
GROUP BY c.module_id ORDER BY c.module_id;

-- Charter Navigator: distinguish legacy enabled grants from the actual
-- workspace-scoped role source. This query does not grant or revoke anything.
WITH charter AS (
  SELECT a.user_id,a.role,
         public.current_workspace_id(a.user_id) AS workspace_id,
         public.has_module_access('charter-navigator',a.user_id) AS effective_access,
         public.module_role_for('charter-navigator',a.user_id) AS effective_role
  FROM public.module_role_assignments a
  WHERE a.enabled IS TRUE AND a.module_id='charter-navigator'
)
SELECT role,
       (public.apsyntra_charter_current_role(user_id,workspace_id) IS NOT NULL) AS scoped_role_present,
       effective_access,
       (effective_role IS NOT NULL) AS effective_role_present,
       count(*)::int AS assignments
FROM charter
GROUP BY 1,2,3,4 ORDER BY assignments DESC;
