-- CP-TT-OJT-01: read-only deployment readiness probe.
-- Run in a DISPOSABLE STAGING project's Supabase SQL Editor as an authorized DBA.
-- Never paste intern PINs, identity bearer tokens, or service keys into this script.
-- All statements below are SELECT statements; this file does not deploy migrations,
-- change users or roles, activate a roster, or validate live PIN/GPS behavior.
--
-- STEP 1: Run only this SELECT first. Missing ("installed = false") functions
-- mean the schema isn't deployed. Apply the two reviewed migrations IN ORDER:
--   20261123100000_cp_tt_ojt_shared_identities.sql
--   20261123130000_cp_tt_ojt_employee_department_identity.sql
-- If you see NULL from to_regprocedure, the function is NOT installed;
-- it does not mean the account's department/role is NULL.
WITH required_functions(stage, signature) AS (
 VALUES
 ('base','public.timetracker_ojt_admin_snapshot(uuid)'),
 ('base','public.timetracker_ojt_group_set(uuid,uuid,boolean)'),
 ('base','public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,text,boolean)'),
 ('base','public.timetracker_ojt_roster(uuid)'),
 ('base','public.timetracker_ojt_select(uuid,uuid,text)'),
 ('base','public.timetracker_ojt_leave(uuid,text)'),
 ('base','public.timetracker_ojt_snapshot(uuid,text)'),
 ('base','public.timetracker_ojt_commit(uuid,text,text,uuid,text,jsonb,text)'),
 ('base','public.timetracker_ojt_admin_attendance(uuid)'),
 ('base','private.tt_ojt_block_legacy_clock()'),
 ('correction','private.tt_ojt_eligible_shared(uuid,uuid)')
)
SELECT stage, signature,
       to_regprocedure(signature) IS NOT NULL AS installed
FROM required_functions
ORDER BY stage, signature;

-- STEP 2: Run after BOTH migrations are installed. The base migration alone
-- contains the OBSOLETE OJT module-role rule and a hard-coded board UUID.
-- The following must return true in ALL three columns.
SELECT
 COALESCE(position('tt_ojt_eligible_shared' IN
   pg_get_functiondef(to_regprocedure('private.tt_ojt_shared(uuid)'))) > 0,false)
   AS corrected_shared_access_guard,
 COALESCE(position('tt_ojt_eligible_shared' IN
   pg_get_functiondef(to_regprocedure('public.timetracker_ojt_group_set(uuid,uuid,boolean)'))) > 0,false)
   AS corrected_admin_enable_guard,
 COALESCE(position('46bf4ee7-368a-4c35-842c-8593ea1f6ac3' IN
   pg_get_functiondef(to_regprocedure('private.tt_ojt_block_legacy_clock()'))) = 0,false)
   AS legacy_guard_has_no_hard_coded_board;

-- STEP 3: Run only if the existing TimeTracker department and role functions
-- are installed. Match the Work Management workspace_id to the board selected
-- in the CRM. This query is informational and does NOT grant an account access.
-- Expected: exact email, verified=true, profile=active, membership=active,
-- department=OJT, TimeTracker module_role=Employee on the correct workspace.
SELECT u.id AS shared_user_id, u.email,
       (u.email_confirmed_at IS NOT NULL) AS verified,
       p.status AS profile_status,
       m.workspace_id, m.active AS workspace_membership_active,
       d.department,
       public.module_role_for('time-tracker',u.id) AS module_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id=u.id
LEFT JOIN public.workspace_members m ON m.user_id=u.id
LEFT JOIN private.tt_employee_departments d
  ON d.workspace_id=m.workspace_id AND d.user_id=u.id
WHERE u.id='d613280d-907b-418f-b872-c0f6dd53e580'::uuid
  AND lower(u.email)='ojt@watchdogautomation.com.ph'
ORDER BY m.workspace_id;

-- STEP 4: Only after installing BOTH migrations AND admin activation in
-- TimeTracker -> Employees, verify that the designated group is enabled on
-- the intended board. Empty results mean NO shared group is configured.
SELECT workspace_id,board_id,enabled,updated_at
FROM private.tt_ojt_shared_accounts
WHERE shared_user_id='d613280d-907b-418f-b872-c0f6dd53e580'::uuid
ORDER BY updated_at DESC;

-- CAUTION: These queries do NOT prove production readiness. A disposable
-- staging test must also verify wrong PIN and 5-attempt lockout; bearer expiry
-- and revocation; cross-actor, cross-board and cross-workspace denial;
-- GPS freshness; duplicate clock-in denial; and legacy-clock blocking.
