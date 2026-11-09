-- CP-WS-ACTIVATE-04 protected ORIGINAL domain caller subset (not synthetic proxies).
-- Owner-host isolated PostgreSQL 17 workspace_disposable only.
-- The domain-role sample is not a substitute for all 73 source caller paths.
\set ON_ERROR_STOP on
DO $gate$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR current_setting('server_version_num')::int<170000
  OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
  OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
  OR to_regprocedure('public.wm_auth_access_context()') IS NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'CP_WS_ACTIVATE04_DOMAIN_OWNER_DISPOSABLE_ONLY'
  USING ERRCODE='42501'; END IF;
END $gate$;
BEGIN;
-- The source replay depends on profile columns absent from the earliest B1 fixture.
-- These changes are scoped to the uncommitted disposable transaction.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS revision bigint DEFAULT 1;
-- Match known production entrypoint grants for these three original functions.
REVOKE ALL ON FUNCTION public.has_module_access(text,uuid),
  public.module_role_for(text,uuid),public.wm_auth_access_context()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(text,uuid),
  public.wm_auth_access_context() TO authenticated;
DO $acl$
BEGIN
 IF has_function_privilege('anon','public.has_module_access(text,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.wm_auth_access_context()','EXECUTE')
  OR has_function_privilege('anon','public.module_role_for(text,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.module_role_for(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'ORIGINAL_ENTRYPOINT_EXECUTE_GRANT_LEAK'; END IF;
END $acl$;
-- Synthetic user C is a signed member of both workspaces; B belongs only to foreign.
-- Real original has_module_access reads module_role_assignments, not a proxy.
INSERT INTO public.module_role_assignments
 (user_id,module_id,role,enabled,assigned_by,created_at,updated_at)
 VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','order-intake','MANAGER',true,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','order-intake','VIEWER',false,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',true);
DO $allowed$
DECLARE ctx jsonb;
BEGIN
 IF public.has_module_access('order-intake',auth.uid()) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'ORIGINAL_DOMAIN_ROLE_ASSIGNED_MEMBER_NOT_ALLOWED'; END IF;
 IF public.has_module_access('order-intake','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    IS DISTINCT FROM FALSE
 THEN RAISE EXCEPTION 'ORIGINAL_DOMAIN_DISABLED_FOREIGN_ROLE_ALLOWED'; END IF;
 ctx:=public.wm_auth_access_context();
 IF ctx IS NULL THEN RAISE EXCEPTION 'ORIGINAL_ACCESS_CONTEXT_MISSING'; END IF;
END $allowed$;
-- Suppression of directly selected foreign-domain table data is independent of
-- role-function success. Neither privileges nor synthetic stubs establish RLS.
DO $table_priv$
BEGIN
 IF has_table_privilege('authenticated','public.module_role_assignments','SELECT')
 THEN RAISE EXCEPTION 'DOMAIN_ROLE_TABLE_READ_LEAK'; END IF;
END $table_priv$;
RESET ROLE;
ROLLBACK;
SELECT 'CP_WS_ACTIVATE04_ORIGINAL_DOMAIN_ROLE_SUBSET_PASS' AS result;
