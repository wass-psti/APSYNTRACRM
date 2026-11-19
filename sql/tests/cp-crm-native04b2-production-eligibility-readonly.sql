-- CP-CRM-NATIVE-04B2 — production identity / role eligibility inventory
-- READ ONLY. No production account identifiers, emails or business row data.
-- Run in existing project jtlusodorfnyzgyuewkz using a read-only SQL session.
-- "POTENTIAL_ACTORS" means assigned to a role, NOT approved test accounts.
WITH
workspace AS (
 SELECT id FROM public.workspaces WHERE name='Work Management'
 AND id='00000000-0000-4000-8000-000000000001'::uuid
),
active_people AS (
 SELECT DISTINCT p.id,p.email,p.display_name
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.active=true
 JOIN workspace w ON w.id=wm.workspace_id
 WHERE p.status='active'
),
module_roles AS (
 SELECT DISTINCT m.user_id,m.module_id,m.role
 FROM public.module_role_assignments m
 JOIN active_people p ON p.id=m.user_id
 WHERE m.enabled AND m.module_id IN
 ('time-tracker','fund-released-tracker','fueltrack-plus','tradelink')
),
finance_roles AS (
 SELECT DISTINCT fm.user_id,fm.role
 FROM public.frt_memberships fm
 JOIN workspace w ON w.id=fm.workspace_id
 JOIN active_people p ON p.id=fm.user_id
 WHERE fm.enabled AND fm.status='active'
),
gates(gate,eligible,minimum_required) AS (
 VALUES
 ('named_qa_accounts',
  (SELECT count(DISTINCT id) FROM active_people
   WHERE coalesce(email,'') ~* '(qa|test|sandbox|fixture|acceptance|nonprod)'
      OR coalesce(display_name,'') ~* '(qa|test|sandbox|fixture|acceptance|nonprod)'),3::bigint),
 ('attendance_employee',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='time-tracker' AND role='Employee'),1::bigint),
 ('frt_module_requestor',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='fund-released-tracker' AND role='REQUESTOR'),1::bigint),
 ('frt_domain_requestor',
  (SELECT count(DISTINCT user_id) FROM finance_roles
   WHERE role='REQUESTOR'),1::bigint),
 ('frt_domain_finance_manager',
  (SELECT count(DISTINCT user_id) FROM finance_roles
   WHERE role='FINANCE_MANAGER'),1::bigint),
 ('frt_domain_finance_approver',
  (SELECT count(DISTINCT user_id) FROM finance_roles
   WHERE role='FINANCE_APPROVER'),1::bigint),
 ('frt_domain_general_manager',
  (SELECT count(DISTINCT user_id) FROM finance_roles
   WHERE role='GENERAL_MANAGER'),1::bigint),
 ('fueltrack_requestor',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='fueltrack-plus' AND role='User'),1::bigint),
 ('fueltrack_approver',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='fueltrack-plus' AND role='Admin'),1::bigint),
 ('tradelink_document_author',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='tradelink' AND role='General Manager'),1::bigint),
 ('tradelink_distinct_reviewer_candidates',
  (SELECT count(DISTINCT user_id) FROM module_roles
   WHERE module_id='tradelink' AND role IN ('User','General Manager')),2::bigint),
 ('qa_workspace_active_members',
  (SELECT count(DISTINCT wm.user_id) FROM public.workspace_members wm
   JOIN public.workspaces w ON w.id=wm.workspace_id
   WHERE w.name='FRT-ACCEPTANCE-QA-v0.5.0' AND wm.active),3::bigint)
)
SELECT gate,eligible AS potentially_eligible_accounts,minimum_required,
 CASE WHEN eligible>=minimum_required THEN 'POTENTIAL_ACTORS_NOT_QA_APPROVED'
 ELSE 'NO_ELIGIBLE_SET' END AS inventory_status
FROM gates
ORDER BY gate;
