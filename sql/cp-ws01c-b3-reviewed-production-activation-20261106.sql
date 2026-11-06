-- CP-WS-01C/B3 — CONTROLLED PRODUCTION ACTIVATE candidate, NOT automatically executed.
-- REQUIRES independent approval for production role grant and workspace write enablement.
-- Prerequisite: separately approved, source-locked installation of
-- sql/cp-ws01c-b3-create-contract-candidate.sql (installs functions DEFAULT-OFF).
-- No workspace is created by this activation script. B4 switching remains OFF.
-- Must be run only in an approved release window after reviewed disposable acceptance.
BEGIN;
DO $ws01_activation_source_lock$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='wm_ws01_create'
     AND pg_get_function_identity_arguments(p.oid)='p_name text, p_privacy text, p_request_id uuid'
     AND md5(pg_get_functiondef(p.oid))='63395e8cb451560b16fd2ccb07a8d20c'
     AND pg_get_userbyid(p.proowner)='postgres'
     AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']::text[]
 ) OR NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='private' AND p.proname='ws01_signed_actor_session'
     AND md5(pg_get_functiondef(p.oid))='25a49e8acb1429110456c4de2211691e'
     AND pg_get_userbyid(p.proowner)='postgres'
     AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']::text[]
 ) OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','private.ws01_signed_actor_session()','EXECUTE')
    OR has_function_privilege('anon','private.ws01_signed_actor_session()','EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE ((n.nspname='public' AND p.proname='wm_ws01_create')
         OR (n.nspname='private' AND p.proname='ws01_signed_actor_session'))
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
 OR (SELECT count(*) FROM private.ws01_create_requests)<>0
 OR (SELECT count(*) FROM private.ws01_events)<>0
 THEN RAISE EXCEPTION 'CP-WS-01C/B3 source lock or default-off ACL mismatch'
 USING ERRCODE='42501'; END IF;
END $ws01_activation_source_lock$;

DO $ws01_activate_preflight$
DECLARE
 flags record;
 exposed_count integer;
BEGIN
 IF to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
 OR to_regprocedure('public.wm_ws01_list()') IS NULL
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 OR to_regclass('private.ws01_workspace_policy') IS NULL
 OR to_regclass('private.ws01_member_roles') IS NULL
 OR to_regclass('private.ws01_create_requests') IS NULL
 OR to_regclass('private.ws01_events') IS NULL
 OR to_regclass('private.ws01_lifecycle_flags') IS NULL
 OR NOT has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 THEN
  RAISE EXCEPTION 'Creation activation prerequisites or existing grants unexpected'
   USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT flags FROM private.ws01_lifecycle_flags WHERE id IS TRUE;
 IF flags.creation_enabled IS NOT FALSE OR flags.selection_enabled IS NOT FALSE
 THEN RAISE EXCEPTION 'Creation or switching already enabled; refuse ambiguous activation'
  USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO exposed_count
 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname='private' AND c.relkind='r'
 AND c.relname IN ('ws01_workspace_policy','ws01_member_roles',
                  'ws01_create_requests','ws01_session_choices',
                  'ws01_lifecycle_flags','ws01_events')
 AND (
  c.relrowsecurity IS NOT TRUE
  OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 );
 IF exposed_count<>0 THEN
  RAISE EXCEPTION 'Private workspace RLS/table grant boundary changed'
   USING ERRCODE='42501'; END IF;
END $ws01_activate_preflight$;

-- Dedicated, narrowly scoped authenticated entry point.
-- SECURITY DEFINER is permitted ONLY after review of the embedded
-- caller JWT/session, active membership, profile and lifecycle checks.
-- No direct table INSERT/UPDATE/DELETE grant is introduced.
GRANT EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid) TO authenticated;
UPDATE private.ws01_lifecycle_flags
 SET creation_enabled=TRUE
 WHERE id IS TRUE AND creation_enabled IS FALSE AND selection_enabled IS FALSE;

DO $ws01_activate_verify$
BEGIN
 IF (SELECT count(*) FROM private.ws01_lifecycle_flags
      WHERE id IS TRUE AND creation_enabled IS TRUE
        AND selection_enabled IS FALSE)<>1
 OR NOT has_function_privilege('authenticated',
      'public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_table_privilege('authenticated','public.workspaces','INSERT')
 OR has_table_privilege('authenticated','public.workspace_members','INSERT')
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'Controlled activation postcondition failed'
  USING ERRCODE='42501'; END IF;
END $ws01_activate_verify$;

-- No workspace creation is implied by the permission/feature release.
DO $ws01_activation_extra_assert$
BEGIN
 IF has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','private.ws01_signed_actor_session()','EXECUTE')
 OR has_function_privilege('anon','private.ws01_signed_actor_session()','EXECUTE')
 OR has_table_privilege('authenticated','public.workspaces','INSERT')
 OR has_table_privilege('authenticated','public.workspace_members','INSERT')
 OR (SELECT count(*) FROM private.ws01_lifecycle_flags
       WHERE id IS TRUE AND creation_enabled IS TRUE
        AND selection_enabled IS FALSE)<>1
 OR (SELECT count(*) FROM private.ws01_create_requests)<>0
 OR (SELECT count(*) FROM private.ws01_events)<>0
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-WS-01C/B3 activation source-lock postcondition failed'
 USING ERRCODE='42501'; END IF;
END $ws01_activation_extra_assert$;

COMMIT;
