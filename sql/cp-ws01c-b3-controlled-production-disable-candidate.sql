-- CP-WS-01C/B3 — EMERGENCY FAIL-CLOSED ROLLBACK candidate. NOT automatically executed.
-- Requires operator approval; disables NEW creation, preserves historical
-- workspaces/memberships/requests and audit trail for integrity/recovery.
-- B4 workspace selection is deliberately not modified.
BEGIN;
DO $disable_preflight$
BEGIN
 IF to_regclass('private.ws01_lifecycle_flags') IS NULL
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 THEN RAISE EXCEPTION 'Missing workspace creation rollback prerequisite'
  USING ERRCODE='42501'; END IF;
END $disable_preflight$;
UPDATE private.ws01_lifecycle_flags
 SET creation_enabled=FALSE WHERE id IS TRUE;
REVOKE EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid)
 FROM authenticated;
DO $disable_verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND creation_enabled IS FALSE)
 OR has_function_privilege('authenticated',
      'public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon',
      'public.wm_ws01_create(text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Workspace creation rollback failed closed'
  USING ERRCODE='42501'; END IF;
END $disable_verify$;
COMMIT;
