-- Emergency stop only; separately authorized production operation.
-- Rejects new signed selection immediately. Existing effective context
-- returns to the deterministic active-membership fallback.
BEGIN;
UPDATE private.ws01_lifecycle_flags
 SET selection_enabled=FALSE
 WHERE id IS TRUE AND selection_enabled=TRUE;
REVOKE EXECUTE ON FUNCTION public.wm_ws01_select(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Retained choices are purged to prevent revival during a later activation.
DELETE FROM private.ws01_session_choices;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags WHERE selection_enabled)
 OR has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR EXISTS(SELECT 1 FROM private.ws01_session_choices)
 THEN RAISE EXCEPTION 'Workspace emergency disable failed' USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;
