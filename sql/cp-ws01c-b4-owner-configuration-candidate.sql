-- CP-WS-01C/B4 — owner-authorized workspace configuration candidate.
-- DISPOSABLE/STAGING ONLY. Never apply to production without explicit
-- migration, function-grant and operational approval. No public grants here.
-- Preserves the signed actor/session, membership and platform-role boundary.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('private.ws01_events') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regprocedure('public.wm_ws01_list()') IS NULL
  OR to_regprocedure('public.wm_ws01_configure(uuid,text,text,text,text)') IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='private.ws01_events'::regclass
      AND c.conname='ws01_events_action_check' AND c.contype='c')
 THEN RAISE EXCEPTION 'Workspace configuration prerequisites or migration collision'
  USING ERRCODE='42501';
 END IF;
END $preflight$;

-- An update is a distinct audit action. Retain the original creation and
-- selection actions without adding tables or granting any private-table access.
ALTER TABLE private.ws01_events DROP CONSTRAINT ws01_events_action_check;
ALTER TABLE private.ws01_events ADD CONSTRAINT ws01_events_action_check
 CHECK(action IN('workspace.created','workspace.selected','workspace.configured'));

-- Explicit workspace identity; owner may configure an owned inactive workspace.
-- Never infer ownership from platform_role, URL parameters, or open privacy.
-- The expected values implement an optimistic CAS and prevent lost updates.
CREATE FUNCTION public.wm_ws01_configure(
 p_workspace_id uuid,
 p_name text,
 p_privacy text,
 p_expected_name text,
 p_expected_privacy text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $configure$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_name text:=pg_catalog.btrim(p_name);
 v_old_name text;
 v_old_privacy text;
 v_changed boolean;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 -- Lock target, policy, membership and owner relation in one query. Concurrent
 -- removal/role-change cannot race authorization after the lock is acquired.
 SELECT w.name,policy.privacy INTO v_old_name,v_old_privacy
 FROM public.workspaces w
 JOIN private.ws01_workspace_policy policy ON policy.workspace_id=w.id
 JOIN public.workspace_members m ON m.workspace_id=w.id
   AND m.user_id=v_actor AND m.active IS TRUE
 JOIN private.ws01_member_roles role ON role.workspace_id=w.id
   AND role.user_id=v_actor AND role.relation='owner'
 WHERE w.id=p_workspace_id
 FOR UPDATE OF w,policy FOR SHARE OF m,role;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Workspace configuration denied' USING ERRCODE='42501';
 END IF;
 IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 80
  OR v_name ~ '[[:cntrl:]<>]' OR p_privacy IS NULL
  OR p_privacy NOT IN('open','closed')
 THEN RAISE EXCEPTION 'Invalid workspace configuration' USING ERRCODE='22023'; END IF;
 IF p_expected_name IS DISTINCT FROM v_old_name OR
    p_expected_privacy IS DISTINCT FROM v_old_privacy
 THEN RAISE EXCEPTION 'Stale workspace configuration' USING ERRCODE='40001'; END IF;
 v_changed:=(v_name IS DISTINCT FROM v_old_name
             OR p_privacy IS DISTINCT FROM v_old_privacy);
 IF v_changed THEN
  UPDATE public.workspaces SET name=v_name WHERE id=p_workspace_id;
  UPDATE private.ws01_workspace_policy SET privacy=p_privacy
  WHERE workspace_id=p_workspace_id;
  INSERT INTO private.ws01_events(workspace_id,actor_id,session_id,action)
  VALUES(p_workspace_id,v_actor,v_sid,'workspace.configured');
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'workspaceId',p_workspace_id,'name',v_name,
  'privacy',p_privacy,'previousName',v_old_name,
  'previousPrivacy',v_old_privacy,'changed',v_changed);
END $configure$;
REVOKE ALL ON FUNCTION public.wm_ws01_configure(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
-- Deliberately no authenticated EXECUTE grant. A separate activation must
-- revalidate production source/grant fingerprints and signed-user acceptance.
COMMIT;
