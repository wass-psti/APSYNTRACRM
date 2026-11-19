-- CP-CRM-NATIVE-ACCESS-FINAL-02 — aggregate and pseudonymous all-user matrix.
-- READ ONLY. Does not infer runtime acceptance from role assignments.
-- Run in the existing authorized database connection; no impersonation.
-- A pseudonymous key is NOT an authorization identity or credential.
WITH assigned AS (
 SELECT a.module_id,a.user_id,a.role AS legacy_role,a.enabled,
        p.status AS profile_status,
        public.current_workspace_id(a.user_id) AS workspace_id,
        public.module_role_for(a.module_id,a.user_id) AS effective_role,
        public.has_module_access(a.module_id,a.user_id) AS effective_access
 FROM public.module_role_assignments a
 LEFT JOIN public.profiles p ON p.id=a.user_id
 WHERE a.enabled IS TRUE
), assessed AS (
 SELECT a.*,
        EXISTS(SELECT 1 FROM public.workspace_members wm
               WHERE wm.user_id=a.user_id AND wm.workspace_id=a.workspace_id
                 AND wm.active IS TRUE) AS member_active,
        CASE WHEN a.module_id='charter-navigator'
             THEN public.apsyntra_charter_current_role(a.user_id,a.workspace_id)
             ELSE NULL END AS charter_scoped_role
 FROM assigned a
), classified AS (
 SELECT module_id,user_id,legacy_role,effective_role,charter_scoped_role,
 CASE
  WHEN profile_status IS DISTINCT FROM 'active' THEN 'INACTIVE_PROFILE'
  WHEN workspace_id IS NULL OR member_active IS DISTINCT FROM TRUE THEN 'WORKSPACE_MEMBERSHIP_UNAVAILABLE'
  WHEN module_id='charter-navigator' AND charter_scoped_role IS NULL THEN 'CHARTER_SCOPED_ROLE_UNRESOLVED'
  WHEN effective_access IS DISTINCT FROM TRUE OR effective_role IS NULL THEN 'EFFECTIVE_ACCESS_UNRESOLVED'
  ELSE 'ELIGIBLE_NOT_RUNTIME_TESTED'
 END AS assignment_state
 FROM assessed
)
SELECT substr(encode(sha256(convert_to(user_id::text,'UTF8')),'hex'),1,16) AS qa_user_key,module_id,
       legacy_role,effective_role,assignment_state,
       'NOT_TESTED'::text AS signed_startup,
       'NOT_TESTED'::text AS permitted_workflow
FROM classified
ORDER BY qa_user_key,module_id;

-- Authoritative Charter evidence: scoped table vs historical assignments.
-- Do not treat these old Employee rows as implicit new 'user' grants.
WITH charter AS (
 SELECT a.user_id,a.role AS legacy_role,a.created_at,a.updated_at,
        public.current_workspace_id(a.user_id) AS workspace_id,
        s.role AS scoped_role,s.enabled AS scoped_enabled
 FROM public.module_role_assignments a
 LEFT JOIN public.apsyntra_charter_workspace_roles s
   ON s.user_id=a.user_id AND s.workspace_id=public.current_workspace_id(a.user_id)
 WHERE a.module_id='charter-navigator' AND a.enabled IS TRUE
)
SELECT legacy_role,scoped_role,coalesce(scoped_enabled,false) AS scoped_enabled,
       count(*)::int AS assignments,
       min(created_at) AS first_legacy_assignment,
       max(updated_at) AS last_legacy_change
FROM charter
GROUP BY legacy_role,scoped_role,coalesce(scoped_enabled,false)
ORDER BY assignments DESC;

-- Authoritative all-12-module projection across active workspace members.
-- Legacy assignments are NOT the complete source (some effective grants are
-- derived from bootstrap or independently scoped module role sources).
-- This output never claims that a live employee browser was tested.
WITH supported(module_id) AS (
  VALUES ('time-tracker'),('fueltrack-plus'),('tradelink'),
         ('toolbox-issues'),('fund-released-tracker'),('fueltrans'),
         ('order-intake'),('tool-traceability'),('material-request-hub'),
         ('aps-aims'),('employee-eval'),('charter-navigator')
), active_members AS (
 SELECT DISTINCT wm.user_id
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.active IS TRUE AND p.status='active'
   AND wm.workspace_id=public.current_workspace_id(wm.user_id)
), effective AS (
 SELECT s.module_id,m.user_id,
        public.module_role_for(s.module_id,m.user_id) AS module_role,
        public.has_module_access(s.module_id,m.user_id) AS module_access
 FROM active_members m CROSS JOIN supported s
)
SELECT module_id,
       count(*) FILTER (WHERE module_role IS NOT NULL AND module_access IS TRUE)::int AS effective_user_modules,
       count(*) FILTER (WHERE module_role IS NULL AND module_access IS TRUE)::int AS access_without_role,
       count(*) FILTER (WHERE module_role IS NOT NULL AND module_access IS DISTINCT FROM TRUE)::int AS role_without_access,
       'NOT_TESTED'::text AS genuine_signed_runtime
FROM effective GROUP BY module_id ORDER BY module_id;
