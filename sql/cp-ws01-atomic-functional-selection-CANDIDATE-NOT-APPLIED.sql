-- Production-scope cutover, NOT APPLIED.
-- Must execute only after explicit authorization for the shared resolver and
-- authenticated-only selector EXECUTE; no direct workspace table grants.
-- One transaction installs the resolver, signed selection, membership-pruning
-- and activates selection; any failure rolls back every part of the change.
BEGIN;
DO $ws01_atomic_prerequisites$
DECLARE
 current_source text;
BEGIN
 IF to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('private.ws01_prune_session_choices()') IS NOT NULL
   OR EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
     WHERE id IS TRUE AND selection_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace switch already installed or enabled'
   USING ERRCODE='42501'; END IF;
 SELECT pg_get_functiondef('public.current_workspace_id(uuid)'::regprocedure)
  INTO current_source;
 IF current_source IS NULL
   OR position('public.workspace_members' IN current_source)=0
   OR position('ws01_session_choices' IN current_source)>0
 THEN RAISE EXCEPTION 'Unexpected pre-cutover workspace resolver; no change'
   USING ERRCODE='42501'; END IF;
 IF to_regprocedure('private.ws01_signed_actor_session()') IS NULL
   OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
   OR to_regclass('private.ws01_session_choices') IS NULL
   OR to_regclass('private.ws01_lifecycle_flags') IS NULL
   OR to_regclass('private.ws01_events') IS NULL
 THEN RAISE EXCEPTION 'Signed workspace selection dependencies missing'
   USING ERRCODE='42501'; END IF;
END $ws01_atomic_prerequisites$;

DO $preflight$
BEGIN
 IF to_regclass('private.ws01_session_choices') IS NULL
  OR to_regclass('private.ws01_lifecycle_flags') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
 THEN RAISE EXCEPTION 'CP-WS-01B cutover prerequisites not installed'
  USING ERRCODE='42501';
 END IF;
END $preflight$;

-- Existing callers still receive the earliest active workspace when
-- selection_enabled=false or the caller is not the JWT's own user.
-- When activated, a session choice is honored only with a still-valid
-- GoTrue session, active account and active target workspace membership.
-- The original p_user_id argument shape and fallback semantics are retained.
CREATE OR REPLACE FUNCTION public.current_workspace_id(
 p_user_id uuid DEFAULT auth.uid()
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $scope$
DECLARE
 v_fallback uuid;
 v_session text;
 v_chosen uuid;
BEGIN
 SELECT m.workspace_id INTO v_fallback
 FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active IS TRUE AND p.status='active'
 ORDER BY m.created_at ASC LIMIT 1;
 IF v_fallback IS NULL OR p_user_id IS DISTINCT FROM auth.uid() OR
  NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND selection_enabled IS TRUE)
 THEN RETURN v_fallback; END IF;
 -- Once session-based authority is enabled, NEVER fall back to a workspace
 -- for a revoked, expired, malformed or missing signed session. The former
 -- return-v_fallback would let existing board/module readers retain access.
 v_session:=auth.jwt()->>'session_id';
 IF v_session IS NULL OR v_session !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR NOT private.wm_board_config_session_active()
 THEN RETURN NULL; END IF;
 SELECT choice.workspace_id INTO v_chosen
 FROM private.ws01_session_choices choice
 JOIN auth.sessions s ON s.id=choice.session_id AND s.user_id=choice.actor_id
 JOIN public.workspace_members m ON m.workspace_id=choice.workspace_id
  AND m.user_id=choice.actor_id AND m.active IS TRUE
 JOIN public.profiles p ON p.id=choice.actor_id AND p.status='active'
 WHERE choice.session_id=v_session::uuid AND choice.actor_id=p_user_id
  AND (s.not_after IS NULL OR s.not_after>now());
 RETURN coalesce(v_chosen,v_fallback);
END $scope$;

CREATE FUNCTION public.wm_ws01_select(
 p_workspace_id uuid,p_expected_workspace_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $select$
DECLARE
 v_actor uuid:=auth.uid();
 v_session uuid;
 v_current uuid;
 v_active boolean;
BEGIN
 v_session:=private.ws01_signed_actor_session();
 -- Lock this GoTrue session before evaluating the expected active scope.
 -- Concurrent switches on the SAME session cannot both pass a stale CAS.
 PERFORM 1 FROM auth.sessions s WHERE s.id=v_session
  AND s.user_id=v_actor AND (s.not_after IS NULL OR s.not_after>now())
  FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Workspace session revoked during selection'
   USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
  WHERE id IS TRUE AND selection_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace switching not activated' USING ERRCODE='42501';
 END IF;
 IF p_workspace_id IS NULL OR p_expected_workspace_id IS NULL
 THEN RAISE EXCEPTION 'Missing workspace scope' USING ERRCODE='22023'; END IF;
 v_current:=public.current_workspace_id(v_actor);
 IF v_current IS DISTINCT FROM p_expected_workspace_id
 THEN RAISE EXCEPTION 'Stale workspace context' USING ERRCODE='40001'; END IF;
 -- Protect membership active=true from concurrent revocation in this txn.
 SELECT m.active INTO v_active FROM public.workspace_members m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor FOR SHARE;
 IF v_active IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Foreign workspace selection denied' USING ERRCODE='42501';
 END IF;
 IF p_workspace_id=v_current THEN
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'workspaceId',v_current,'previousWorkspaceId',v_current,'switched',false);
 END IF;
 INSERT INTO private.ws01_session_choices(session_id,actor_id,workspace_id)
 VALUES(v_session,v_actor,p_workspace_id)
 ON CONFLICT(session_id) DO UPDATE SET
  workspace_id=excluded.workspace_id,
  actor_id=excluded.actor_id,
  updated_at=now();
 -- Verify the persisted choice directly inside this VOLATILE write RPC.
 -- current_workspace_id() is STABLE and must be checked by the caller in a
 -- later SQL statement, not re-read from the same statement's old snapshot.
 IF NOT EXISTS (
  SELECT 1 FROM private.ws01_session_choices choice
  WHERE choice.session_id=v_session AND choice.actor_id=v_actor
   AND choice.workspace_id=p_workspace_id
 ) THEN RAISE EXCEPTION 'Server workspace choice was not persisted'
  USING ERRCODE='42501'; END IF;
 INSERT INTO private.ws01_events(workspace_id,actor_id,session_id,action)
 VALUES(p_workspace_id,v_actor,v_session,'workspace.selected');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'workspaceId',p_workspace_id,'previousWorkspaceId',v_current,'switched',true);
END $select$;
-- Revocation must not reactivate a previously selected workspace when
-- membership is later restored in the same still-valid GoTrue session.
CREATE FUNCTION private.ws01_prune_session_choices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $prune$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM private.ws01_session_choices
  WHERE actor_id=OLD.user_id AND workspace_id=OLD.workspace_id;
 ELSIF OLD.active IS TRUE AND NEW.active IS DISTINCT FROM TRUE THEN
  DELETE FROM private.ws01_session_choices
  WHERE actor_id=OLD.user_id AND workspace_id=OLD.workspace_id;
 END IF;
 RETURN NULL;
END $prune$;
REVOKE ALL ON FUNCTION private.ws01_prune_session_choices()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ws01_prune_session_choices
AFTER UPDATE OF active OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION private.ws01_prune_session_choices();

REVOKE ALL ON FUNCTION public.wm_ws01_select(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- No GRANT or flag activation. Existing signed sessions remain on the old
-- current_workspace_id behavior until separately approved cutover.

-- Activation occurs inside the same transaction as resolver installation.
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

NOTIFY pgrst, 'reload schema';
COMMIT;
