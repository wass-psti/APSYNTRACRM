-- CP-WS-02B production migration-readiness baseline (READ ONLY).
-- No users, emails, UUIDs, tokens or function sources are returned.
-- Exact definition fingerprints guard the planned migration from unnoticed
-- concurrent production changes. Failing this query blocks activation.
-- A passing baseline is NOT permission to apply schema, replace triggers,
-- change Auth settings or enable registration.
WITH existing_triggers AS (
 SELECT
  count(*) FILTER(WHERE n.nspname='auth' AND c.relname='users'
   AND t.tgname='on_auth_user_created' AND t.tgenabled='O') AS signup,
  count(*) FILTER(WHERE n.nspname='auth' AND c.relname='users'
   AND t.tgname='zz_on_auth_user_verification_sync' AND t.tgenabled='O')
   AS verification,
  count(*) FILTER(WHERE n.nspname='public' AND c.relname='profiles'
   AND t.tgname='profiles_default_workspace_membership'
   AND t.tgenabled='O') AS shared_member
 FROM pg_trigger t
 JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal
), candidate_target AS (
 SELECT
  (SELECT md5(pg_get_functiondef(to_regprocedure(
    'public.handle_new_user()'))))='89efd34397c75bb0a823d19c2dbeed75'
    AS signup_def_matches,
  (SELECT md5(pg_get_functiondef(to_regprocedure(
    'public.ensure_default_workspace_membership()'))))=
   'a8b4fff0e5bd27acbb16e3aab3768a25'
    AS shared_member_def_matches,
  (SELECT md5(pg_get_functiondef(to_regprocedure(
    'public.sync_profile_email_verification()'))))=
   '51a5b28aa039e72a1485726071d465fe'
    AS verification_def_matches,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='public.profiles'::regclass
    AND conname='profiles_status_check')=
   'CHECK ((status = ANY (ARRAY[''active''::text, ''disabled''::text])))'
    AS old_profile_status_constraint_matches,
  to_regclass('private.ws02_activation_flags') IS NULL
   AND to_regclass('private.ws02_new_account_admissions') IS NULL
   AND to_regclass('private.ws02_personal_workspaces') IS NULL
   AND to_regclass('private.ws02_provision_events') IS NULL
   AND to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
   AND to_regprocedure('private.ws02_reconcile_verified_admission(uuid)') IS NULL
    AS ws02b_not_installed,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
   AND to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
   AND (SELECT count(*)=1 FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND creation_enabled IS FALSE
     AND selection_enabled IS FALSE) AS b3_b4_disabled,
  (SELECT count(*)=6 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r'
     AND c.relname LIKE 'ws01_%' AND c.relrowsecurity) AS ws01_rls_intact,
  (SELECT count(*) FROM auth.users) AS existing_auth_users,
  (SELECT count(*) FROM public.profiles) AS existing_profiles,
  (SELECT count(*) FROM public.workspaces) AS existing_workspaces,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS existing_active_memberships
)
SELECT
 CASE WHEN t.signup=1 AND t.verification=1 AND t.shared_member=1
   AND c.signup_def_matches AND c.shared_member_def_matches
   AND c.verification_def_matches AND c.old_profile_status_constraint_matches
   AND c.ws02b_not_installed AND c.b3_b4_disabled AND c.ws01_rls_intact
 THEN 'WS02B_BASELINE_VERIFIED__SEPARATE_PRODUCTION_AUTHORIZATION_REQUIRED'
 ELSE 'WS02B_BLOCKED_SCHEMA_OR_TRIGGER_DRIFT'
 END AS readiness_status,
 t.signup=1 AND t.verification=1 AND t.shared_member=1 AS old_triggers_intact,
 c.*
FROM existing_triggers t CROSS JOIN candidate_target c;
