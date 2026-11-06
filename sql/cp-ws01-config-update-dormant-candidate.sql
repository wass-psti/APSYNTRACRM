-- CP-WS-01C / Controlled workspace configuration contract.
-- DISPOSABLE POSTGRESQL 17 CANDIDATE ONLY. NOT A PRODUCTION MIGRATION.
-- Dormant by default: neither authenticated nor anon can execute these RPCs;
-- private flag is FALSE, all private tables have RLS and no direct client grants.
-- Existing live workspace, member, session and event contracts are unchanged.
\set ON_ERROR_STOP on
BEGIN;
DO $preflight$
BEGIN
 IF current_database() <> 'workspace_disposable'
  OR current_setting('server_version_num')::int < 170000
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('public.workspaces') IS NULL
  OR to_regprocedure('public.wm_ws01_config_read(uuid)') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_config_update(uuid,text,text,bigint)') IS NOT NULL
  OR to_regclass('private.ws01_config_flags') IS NOT NULL
  OR to_regclass('private.ws01_config_revisions') IS NOT NULL
  OR to_regclass('private.ws01_config_events') IS NOT NULL
 THEN RAISE EXCEPTION 'Workspace configuration staging requires isolated B3 fixture'
    USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE TABLE private.ws01_config_flags (
 id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws01_config_flags(id) VALUES (true);
CREATE TABLE private.ws01_config_revisions (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws01_config_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL,
 prior_revision bigint NOT NULL,
 revision bigint NOT NULL CHECK (revision > prior_revision),
 previous_name text NOT NULL,
 next_name text NOT NULL,
 previous_privacy text NOT NULL CHECK(previous_privacy IN ('open','closed')),
 next_privacy text NOT NULL CHECK(next_privacy IN ('open','closed')),
 action text NOT NULL DEFAULT 'workspace.configuration.updated'
  CHECK (action='workspace.configuration.updated'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ws01_config_events_workspace_created
 ON private.ws01_config_events(workspace_id,created_at DESC,id DESC);
ALTER TABLE private.ws01_config_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_config_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_config_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws01_config_flags,private.ws01_config_revisions,
 private.ws01_config_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws01_config_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- This helper authorizes ONLY the caller's verified, active GoTrue session
-- and active workspace membership. It does not permit selecting by actor UUID.
CREATE FUNCTION private.ws01_config_signed_member(p_workspace_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $member$
DECLARE v_session uuid; v_actor uuid:=auth.uid();
BEGIN
 IF p_workspace_id IS NULL THEN
  RAISE EXCEPTION 'Missing workspace' USING ERRCODE='22023'; END IF;
 v_session:=private.ws01_signed_actor_session();
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active IS TRUE)
 THEN RAISE EXCEPTION 'Workspace membership denied' USING ERRCODE='42501'; END IF;
 RETURN v_session;
END $member$;
REVOKE ALL ON FUNCTION private.ws01_config_signed_member(uuid)
 FROM PUBLIC,anon,authenticated;

-- Read only the caller's authorized workspace, while configuration remains
-- dormant. The missing legacy role is a MEMBER, never an invented owner.
CREATE FUNCTION public.wm_ws01_config_read(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $read$
DECLARE v_session uuid; v_name text; v_privacy text; v_revision bigint;
 v_can_edit boolean;
BEGIN
 v_session:=private.ws01_config_signed_member(p_workspace_id);
 IF NOT EXISTS(SELECT 1 FROM private.ws01_config_flags
   WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace configuration not activated' USING ERRCODE='42501'; END IF;
 SELECT w.name,coalesce(pol.privacy,'closed'),coalesce(rev.revision,1)
 INTO v_name,v_privacy,v_revision
 FROM public.workspaces w
 LEFT JOIN private.ws01_workspace_policy pol ON pol.workspace_id=w.id
 LEFT JOIN private.ws01_config_revisions rev ON rev.workspace_id=w.id
 WHERE w.id=p_workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM private.ws01_member_roles r
   WHERE r.workspace_id=p_workspace_id AND r.user_id=auth.uid()
    AND r.relation='owner') INTO v_can_edit;
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'workspaceId',p_workspace_id,
  'name',v_name,'privacy',v_privacy,'revision',v_revision,
  'canEdit',v_can_edit);
END $read$;

-- Optimistic CAS protects edits from stale forms; row locks serialize
-- concurrent revisions. Owner status is stored server-side, never in JWT
-- user_metadata or arbitrary client-supplied role fields.
CREATE FUNCTION public.wm_ws01_config_update(
 p_workspace_id uuid,p_name text,p_privacy text,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $update$
DECLARE v_actor uuid:=auth.uid(); v_session uuid;
 v_name text:=pg_catalog.btrim(p_name);
 v_old_name text; v_old_privacy text; v_revision bigint;
 v_next_revision bigint; v_rows bigint;
BEGIN
 v_session:=private.ws01_config_signed_member(p_workspace_id);
 IF NOT EXISTS(SELECT 1 FROM private.ws01_config_flags
   WHERE id IS TRUE AND enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace configuration not activated' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision < 1
  OR v_name IS NULL OR pg_catalog.length(v_name) NOT BETWEEN 2 AND 80
  OR v_name ~ '[[:cntrl:]<>]' OR p_privacy IS NULL
  OR p_privacy NOT IN('open','closed')
 THEN RAISE EXCEPTION 'Invalid workspace configuration' USING ERRCODE='22023'; END IF;
 -- Hold the caller's session and membership during the authorized mutation.
 PERFORM 1 FROM auth.sessions s
 WHERE s.id=v_session AND s.user_id=v_actor
  AND (s.not_after IS NULL OR s.not_after>now()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace session revoked' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.workspace_members m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor
  AND m.active IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace membership revoked' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM private.ws01_member_roles r
 WHERE r.workspace_id=p_workspace_id AND r.user_id=v_actor
  AND r.relation='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner permission required' USING ERRCODE='42501'; END IF;
 -- No implicit upgrade of legacy workspaces without an explicit owner/policy.
 SELECT w.name,pol.privacy INTO v_old_name,v_old_privacy
 FROM public.workspaces w
 JOIN private.ws01_workspace_policy pol ON pol.workspace_id=w.id
 WHERE w.id=p_workspace_id FOR UPDATE OF w,pol;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace policy unavailable' USING ERRCODE='42501'; END IF;
 SELECT rev.revision INTO v_revision FROM private.ws01_config_revisions rev
 WHERE rev.workspace_id=p_workspace_id FOR UPDATE;
 v_revision:=coalesce(v_revision,1);
 IF v_revision<>p_expected_revision
 THEN RAISE EXCEPTION 'Stale workspace configuration' USING ERRCODE='40001'; END IF;
 IF v_old_name=v_name AND v_old_privacy=p_privacy THEN
  RETURN pg_catalog.jsonb_build_object(
   'schemaVersion',1,'workspaceId',p_workspace_id,'revision',v_revision,
   'name',v_old_name,'privacy',v_old_privacy,'updated',false);
 END IF;
 IF v_revision>=9223372036854775807
 THEN RAISE EXCEPTION 'Revision exhausted' USING ERRCODE='40001'; END IF;
 v_next_revision:=v_revision+1;
 UPDATE public.workspaces SET name=v_name WHERE id=p_workspace_id;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Workspace update failed'; END IF;
 UPDATE private.ws01_workspace_policy SET privacy=p_privacy
 WHERE workspace_id=p_workspace_id;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Workspace privacy update failed'; END IF;
 INSERT INTO private.ws01_config_revisions(workspace_id,revision,updated_at)
 VALUES(p_workspace_id,v_next_revision,now())
 ON CONFLICT(workspace_id) DO UPDATE SET
  revision=excluded.revision,updated_at=excluded.updated_at;
 INSERT INTO private.ws01_config_events(
  workspace_id,actor_id,session_id,prior_revision,revision,
  previous_name,next_name,previous_privacy,next_privacy)
 VALUES(p_workspace_id,v_actor,v_session,v_revision,v_next_revision,
  v_old_name,v_name,v_old_privacy,p_privacy);
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'workspaceId',p_workspace_id,'revision',v_next_revision,
  'name',v_name,'privacy',p_privacy,'updated',true);
END $update$;

REVOKE ALL ON FUNCTION public.wm_ws01_config_read(uuid),
 public.wm_ws01_config_update(uuid,text,text,bigint)
 FROM PUBLIC,anon,authenticated;
-- NO client grants and NO flag activation in this candidate.
COMMIT;
