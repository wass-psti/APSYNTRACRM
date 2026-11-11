-- WS10: atomic restricted-workspace-creator cutover candidate.
-- NOT APPROVED / NOT APPLIED. IT partner review and genuine signed acceptance
-- required. Existing platform RPC hashes may have changed; fail closed.
-- First install ws10-restricted-workspace-ownership-CANDIDATE-NOT-APPLIED.sql
-- and have the authorized IT owner seed exact verified creator approvals.
-- No one may gain creator eligibility solely from owning a personal workspace.
BEGIN;
DO $check$
DECLARE old_hash text;
BEGIN
 IF to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regprocedure('public.wm_ws10_create_restricted(text,text,uuid)') IS NULL
 OR to_regprocedure('public.wm_ws10_creator_readiness()') IS NULL
 OR to_regclass('private.ws10_creator_grants') IS NULL
 OR to_regclass('private.ws10_flags') IS NULL
 OR to_regclass('private.ws01_lifecycle_flags') IS NULL
 OR (SELECT creation_enabled FROM private.ws10_flags WHERE id IS TRUE) IS DISTINCT FROM FALSE
 OR (SELECT creation_enabled FROM private.ws01_lifecycle_flags WHERE id IS TRUE) IS DISTINCT FROM TRUE
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws10_create_restricted(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_ws10_create_restricted(text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'WS10 activation prerequisites/permissions differ'
 USING ERRCODE='42501'; END IF;

 SELECT md5(pg_get_functiondef('public.wm_ws01_create(text,text,uuid)'::regprocedure))
 INTO old_hash;
 -- Exact source lock from the reviewed CP-WS-01C/B3 activation file.
 -- Any newer production change requires a NEW review, not removal of this guard.
 IF old_hash <> '63395e8cb451560b16fd2ccb07a8d20c'
 OR NOT has_function_privilege('authenticated',
  'public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR (SELECT count(*) FROM private.ws10_creator_grants
    WHERE revoked_at IS NULL)<1
 THEN RAISE EXCEPTION 'WS10 source drift, legacy privilege, or no approved creators'
 USING ERRCODE='42501'; END IF;
END $check$;

-- Atomically remove the broad legacy ability and grant only signed restricted
-- wrapper. No direct public tables or private schema access is ever granted.
REVOKE EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid)
 FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wm_ws10_creator_readiness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_ws10_create_restricted(text,text,uuid)
 TO authenticated;
UPDATE private.ws10_flags SET creation_enabled=TRUE WHERE id IS TRUE;

DO $verify$
BEGIN
 IF has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws10_create_restricted(text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.wm_ws10_create_restricted(text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.wm_ws10_creator_readiness()','EXECUTE')
 OR (SELECT creation_enabled FROM private.ws10_flags WHERE id IS TRUE) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Restricted creation activation postcondition failed'
 USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;
