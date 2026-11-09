-- CP-WS-ACTIVATE-04 EXPERIMENTAL isolated actor boundary (NOT a production migration).
-- This contract must not be applied until all original caller compatibility and
-- production security approvals are established. No source bodies stored here.
\set ON_ERROR_STOP on
DO $preflight$
DECLARE observed text;
BEGIN
 IF current_database()<>'workspace_disposable'
   OR current_setting('server_version_num')::integer<170000
   OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
   OR to_regprocedure('private.ws01_legacy_has_module_access(text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP_WS_ACTIVATE04_DISPOSABLE_ONLY'
 USING ERRCODE='42501'; END IF;
 SELECT encode(sha256(convert_to(pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure),'UTF8')),'hex')
 INTO observed;
 IF observed<>'58d5af1ddbb54db20a80522335e2ac14bae4e175639cfa4b5da5ad1072f69beb'
 THEN RAISE EXCEPTION 'ORIGINAL_DOMAIN_SOURCE_FINGERPRINT_MISMATCH'
 USING ERRCODE='42501'; END IF;
END $preflight$;

-- Preserve the exact ORIGINAL function body and behavior in an unexposed schema.
-- A SECURITY DEFINER wrapper checks the signed actor before consulting it.
REVOKE ALL ON FUNCTION public.has_module_access(text,uuid)
 FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.has_module_access(text,uuid) SET SCHEMA private;
ALTER FUNCTION private.has_module_access(text,uuid)
 RENAME TO ws01_legacy_has_module_access;
REVOKE ALL ON FUNCTION private.ws01_legacy_has_module_access(text,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $actor$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()
   OR public.current_workspace_id(auth.uid()) IS NULL
 THEN RETURN false; END IF;
 RETURN private.ws01_legacy_has_module_access(p_module_id,p_user_id);
END $actor$;

REVOKE ALL ON FUNCTION public.has_module_access(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(text,uuid)
 TO authenticated;

DO $assert$
BEGIN
 IF has_function_privilege('anon','public.has_module_access(text,uuid)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.has_module_access(text,uuid)','EXECUTE')
   OR has_function_privilege('authenticated','private.ws01_legacy_has_module_access(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'ACTOR_BOUNDARY_PERMISSIONS_UNSAFE'
 USING ERRCODE='42501'; END IF;
END $assert$;
