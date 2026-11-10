-- CP-WS-01-SWITCH — CONTROLLED SIGNED SELECTION ACTIVATION CANDIDATE.
-- NOT APPLIED. Requires separately approved production authorization change.
-- Prerequisites: existing reviewed CP-WS-01B session cutover, genuine signed
-- Admin/Member and foreign/revoked-session acceptance, recovery readiness.
-- This does NOT grant direct workspace/role/membership table access.
BEGIN;
DO $ws_switch_preflight$
DECLARE
 v_flag record;
 v_source text;
BEGIN
 IF to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
   OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
   OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
   OR to_regprocedure('private.ws01_prune_session_choices()') IS NULL
   OR to_regclass('private.ws01_session_choices') IS NULL
   OR to_regclass('private.ws01_lifecycle_flags') IS NULL
   OR to_regclass('private.ws01_events') IS NULL
   OR to_regclass('auth.sessions') IS NULL
   OR to_regclass('public.workspace_members') IS NULL
 THEN RAISE EXCEPTION 'Workspace switching prerequisites missing'
   USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT v_flag FROM private.ws01_lifecycle_flags WHERE id IS TRUE;
 IF v_flag.selection_enabled IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Workspace switching state is not disabled'
   USING ERRCODE='42501'; END IF;
 IF has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  OR has_table_privilege('anon','private.ws01_session_choices','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','private.ws01_session_choices','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','public.workspace_members','INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'Unsafe existing workspace selection/table grants'
   USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_trigger t
  WHERE t.tgrelid='public.workspace_members'::regclass
   AND t.tgname='ws01_prune_session_choices' AND t.tgenabled='O'
 ) THEN RAISE EXCEPTION 'Membership revocation pruning trigger missing'
   USING ERRCODE='42501'; END IF;
 SELECT pg_get_functiondef('public.current_workspace_id(uuid)'::regprocedure)
 INTO v_source;
 IF position('private.ws01_session_choices' IN v_source)=0
   OR position('private.wm_board_config_session_active()' IN v_source)=0
   OR position('selection_enabled' IN v_source)=0
 THEN RAISE EXCEPTION 'Active workspace resolver is not session scoped'
   USING ERRCODE='42501'; END IF;
END $ws_switch_preflight$;

GRANT EXECUTE ON FUNCTION public.wm_ws01_select(uuid,uuid) TO authenticated;
UPDATE private.ws01_lifecycle_flags
 SET selection_enabled=TRUE
 WHERE id IS TRUE AND selection_enabled=FALSE;

DO $ws_switch_verify$
BEGIN
 IF (SELECT count(*) FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND selection_enabled IS TRUE)<>1
  OR NOT has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  OR has_table_privilege('authenticated','private.ws01_session_choices','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'Workspace selection activation postconditions failed'
  USING ERRCODE='42501'; END IF;
END $ws_switch_verify$;
COMMIT;
