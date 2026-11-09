-- Experimental owner-host delegated legacy vs actor-scoped public lookup.
-- The trusted original body is preserved; no production SQL or source changes.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'workspace_disposable'
   OR to_regprocedure('private.ws01_legacy_has_module_access(text,uuid)') IS NULL
   OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
 THEN RAISE EXCEPTION 'ACTOR_BOUNDARY_DISPOSABLE_ONLY' USING ERRCODE='42501'; END IF;
END $guard$;
BEGIN;
INSERT INTO public.module_role_assignments
(user_id,module_id,role,enabled,assigned_by,created_at,updated_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'material-request-hub','MANAGER',true,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now());
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
-- Trusted owner may inspect another user's role, for explicitly authorized
-- delegated code paths. This is NOT a proof that every delegation is permitted.
DO $delegation$
BEGIN
 IF private.ws01_legacy_has_module_access('material-request-hub',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'TRUSTED_ORIGINAL_LEGACY_LOOKUP_NOT_PRESERVED'; END IF;
END $delegation$;
SET LOCAL ROLE authenticated;
DO $actor_scope$
BEGIN
 IF public.has_module_access('material-request-hub',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM FALSE
 THEN RAISE EXCEPTION 'PUBLIC_FOREIGN_ROLE_LOOKUP_STILL_EXPOSED'; END IF;
 IF has_function_privilege('authenticated',
    'private.ws01_legacy_has_module_access(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTHENTICATED_CAN_DIRECTLY_EXECUTE_LEGACY_LOOKUP'; END IF;
END $actor_scope$;
RESET ROLE;
ROLLBACK;
SELECT 'CP_WS_ACTIVATE04_PRIVATE_DELEGATION_AND_PUBLIC_ACTOR_SCOPE_PASS';
