-- CP-WS-01B2 — SESSION AUTHORITY CUTOVER CANDIDATE, DISPOSABLE ONLY.
-- NEVER apply to production without separately approved authorization
-- change, full 62-function dependency review and signed-session regression.
-- Requires cp-ws01b-lifecycle-contract-candidate.sql.
-- The selection flag is false by default; grants remain disabled here.
BEGIN;
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
 v_session:=auth.jwt()->>'session_id';
 IF v_session IS NULL OR v_session !~
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 THEN RETURN v_fallback; END IF;
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
 IF public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace_id
 THEN RAISE EXCEPTION 'Server workspace switch not effective'
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
COMMIT;
