-- CP-WS-02A — read-only account/workspace auth baseline and legacy trigger risk.
-- No live users, emails, account IDs, tokens, workspace IDs or private payloads exported.
-- This is a diagnostic readiness assertion, not a replacement migration.
WITH routines AS (
 SELECT
  pg_get_functiondef(to_regprocedure('public.handle_new_user()')) AS on_signup,
  pg_get_functiondef(to_regprocedure('public.ensure_default_workspace_membership()')) AS old_membership,
  pg_get_functiondef(to_regprocedure('public.sync_profile_email_verification()')) AS verify_email
), triggers AS (
 SELECT
  EXISTS (SELECT 1 FROM pg_trigger t
   JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname='auth'
    AND c.relname='users' AND t.tgname='on_auth_user_created')
   AS signup_trigger_exists,
  EXISTS (SELECT 1 FROM pg_trigger t
   JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname='auth'
    AND c.relname='users' AND t.tgname='zz_on_auth_user_verification_sync')
   AS verification_sync_trigger_exists,
  EXISTS (SELECT 1 FROM pg_trigger t
   JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname='public'
    AND c.relname='profiles' AND t.tgname='profiles_default_workspace_membership')
   AS legacy_membership_trigger_exists
)
SELECT
 CASE WHEN t.signup_trigger_exists AND t.legacy_membership_trigger_exists
  AND r.on_signup LIKE '%admin_general_manager%'
  AND r.old_membership LIKE '%ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=true%'
 THEN 'WS02A_BLOCKED_LEGACY_SIGNUP_ROLE_AND_SHARED_MEMBERSHIP_TRIGGERS'
 ELSE 'WS02A_REQUIRES_MANUAL_SECURITY_REVIEW_NOT_PRODUCTION_ADMISSION'
 END AS baseline,
 t.signup_trigger_exists,
 t.verification_sync_trigger_exists,
 t.legacy_membership_trigger_exists,
 (r.on_signup LIKE '%admin_general_manager%') AS signup_email_role_escalation_branch_present,
 (r.old_membership LIKE '%INSERT INTO public.workspace_members%') AS shared_workspace_membership_insert_present,
 (r.old_membership LIKE '%DO UPDATE SET active=true%') AS legacy_reactivation_path_present,
 (r.verify_email LIKE '%email_verified_at%') AS email_verification_sync_present,
 (SELECT count(*) FROM public.profiles) AS existing_profile_count,
 (SELECT count(*) FROM public.workspaces) AS existing_workspace_count,
 (SELECT count(*) FROM public.workspace_members WHERE active) AS existing_active_memberships,
 to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL AS b3_not_activated,
 to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL AS b4_not_activated,
 (SELECT creation_enabled IS FALSE AND selection_enabled IS FALSE
    FROM private.ws01_lifecycle_flags WHERE id IS TRUE) AS lifecycle_disabled
FROM triggers t CROSS JOIN routines r;
