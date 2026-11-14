-- CP-DB-CPU-07 read-only production parity checks.
-- Run as a privileged diagnostic role; this never impersonates a user or writes data.

WITH active_memberships AS (
  SELECT
    p.id AS user_id,
    membership.workspace_id,
    p.platform_role,
    assignment.role AS explicit_role
  FROM public.profiles p
  JOIN public.workspace_members membership
    ON membership.user_id = p.id
   AND membership.active IS TRUE
  LEFT JOIN public.apsyntra_crm_platform_roles assignment
    ON assignment.user_id = p.id
   AND assignment.workspace_id = membership.workspace_id
  WHERE p.status = 'active'
), role_parity AS (
  SELECT
    active_memberships.*,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM private.ws02_personal_workspaces personal
        JOIN private.ws01_member_roles owner_role
          ON owner_role.workspace_id = personal.workspace_id
         AND owner_role.user_id = personal.user_id
        WHERE personal.user_id = active_memberships.user_id
          AND personal.workspace_id = active_memberships.workspace_id
          AND lower(btrim(owner_role.relation)) = 'owner'
      ) THEN 'admin'
      ELSE COALESCE(
        explicit_role,
        CASE platform_role
          WHEN 'admin_general_manager' THEN 'admin'
          WHEN 'hr' THEN 'supervisor'
          WHEN 'supervisor' THEN 'supervisor'
          ELSE 'employee'
        END
      )
    END AS expected_effective_role
  FROM active_memberships
)
SELECT
  count(*) AS active_membership_pairs,
  count(*) FILTER (
    WHERE public.apsyntra_crm_effective_role(user_id, workspace_id)
      IS DISTINCT FROM expected_effective_role
  ) AS effective_role_mismatches,
  count(*) FILTER (
    WHERE explicit_role IS DISTINCT FROM
      public.apsyntra_crm_explicit_role(user_id, workspace_id)
  ) AS explicit_role_mismatches
FROM role_parity;

SELECT
  has_function_privilege('anon', 'public.apsyntra_crm_my_effective_access()', 'EXECUTE')
    AS anon_execute,
  has_function_privilege('authenticated', 'public.apsyntra_crm_my_effective_access()', 'EXECUTE')
    AS authenticated_execute,
  has_table_privilege('authenticated', 'public.apsyntra_crm_platform_roles', 'SELECT')
    AS authenticated_role_table_select;

WITH function_body AS (
  SELECT regexp_replace(prosrc, '--[^\n]*', '', 'g') AS source
  FROM pg_proc
  WHERE oid = 'public.apsyntra_crm_my_effective_access()'::regprocedure
)
SELECT
  source LIKE '%current_workspace_id(v_actor)%' AS existing_workspace_resolver_retained,
  source LIKE '%apsyntra_role_is_bootstrap()%' AS existing_bootstrap_verifier_retained,
  source NOT LIKE '%public.apsyntra_crm_effective_role(%' AS duplicate_effective_role_call_removed,
  source NOT LIKE '%public.apsyntra_crm_explicit_role(%' AS duplicate_explicit_role_call_removed,
  regexp_count(source, 'JOIN public[.]workspace_members') AS workspace_member_joins,
  regexp_count(source, 'LEFT JOIN public[.]apsyntra_crm_platform_roles') AS role_assignment_joins,
  source LIKE '%CROSS JOIN LATERAL%' AS module_rank_computed_once
FROM function_body;

-- Verify the one-rank-expression implementation against the former two-call
-- module-role ceiling expression for every active membership/module pair.
WITH active_memberships AS (
  SELECT
    p.id AS user_id,
    membership.workspace_id,
    p.platform_role,
    public.apsyntra_crm_effective_role(p.id, membership.workspace_id) AS effective_role,
    public.apsyntra_crm_explicit_role(p.id, membership.workspace_id) AS explicit_role,
    p.platform_role = 'admin_general_manager' AS is_admin
  FROM public.profiles p
  JOIN public.workspace_members membership
    ON membership.user_id = p.id
   AND membership.active IS TRUE
  WHERE p.status = 'active'
), requested_modules(id) AS (
  SELECT unnest(ARRAY[
    'aps-aims', 'charter-navigator', 'employee-eval', 'fueltrack-plus',
    'fueltrans', 'fund-released-tracker', 'material-request-hub',
    'order-intake', 'time-tracker', 'tool-traceability', 'toolbox-issues', 'tradelink'
  ]::text[])
), raw_roles AS (
  SELECT
    active_memberships.*,
    requested_modules.id,
    CASE WHEN is_admin THEN
      CASE requested_modules.id
        WHEN 'time-tracker' THEN 'System Admin'
        WHEN 'fueltrack-plus' THEN 'Admin'
        WHEN 'tradelink' THEN 'General Manager'
        WHEN 'fund-released-tracker' THEN 'GENERAL_MANAGER'
        WHEN 'tool-traceability' THEN 'ADMIN'
        WHEN 'toolbox-issues' THEN 'admin'
        WHEN 'material-request-hub' THEN 'ADMIN'
        WHEN 'aps-aims' THEN 'Administrator'
        WHEN 'employee-eval' THEN 'admin'
        ELSE 'Admin'
      END
    ELSE assignment.role
    END AS raw_role
  FROM active_memberships
  CROSS JOIN requested_modules
  LEFT JOIN public.module_role_assignments assignment
    ON assignment.user_id = active_memberships.user_id
   AND assignment.module_id = requested_modules.id
   AND assignment.enabled
), parity AS (
  SELECT
    raw_roles.*,
    CASE
      WHEN explicit_role IS NOT NULL
       AND (
         public.apsyntra_crm_module_role_rank(id, raw_role) IS NULL
         OR public.apsyntra_crm_module_role_rank(id, raw_role)
            > public.apsyntra_crm_role_rank(effective_role)
       ) THEN NULL
      ELSE raw_role
    END AS reference_role,
    CASE
      WHEN explicit_role IS NOT NULL
       AND (
         ranked.role_rank IS NULL
         OR ranked.role_rank > public.apsyntra_crm_role_rank(effective_role)
       ) THEN NULL
      ELSE raw_role
    END AS optimized_role
  FROM raw_roles
  CROSS JOIN LATERAL (
    SELECT public.apsyntra_crm_module_role_rank(raw_roles.id, raw_roles.raw_role) AS role_rank
  ) ranked
)
SELECT
  count(*) AS membership_module_pairs,
  count(*) FILTER (WHERE reference_role IS DISTINCT FROM optimized_role)
    AS module_role_mismatches
FROM parity;
