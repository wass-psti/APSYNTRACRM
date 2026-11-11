-- WS10: RESTRICTED CREATOR + WORKSPACE OWNER TRANSFER
-- STAGED CANDIDATE, NOT APPLIED. No live Supabase changes.
-- Requires the IT partner's approval, live function-source review, recovery,
-- isolated PostgreSQL/GoTrue replay and signed user negative tests.
-- DO NOT merely enable these flags. Legacy wm_ws01_create must be revoked
-- in the *same controlled transaction* as granting the restricted wrapper.
BEGIN;
DO $preflight$
BEGIN
 IF to_regnamespace('private') IS NULL
 OR to_regclass('private.ws01_member_roles') IS NULL
 OR to_regclass('private.ws01_lifecycle_flags') IS NULL
 OR to_regclass('private.ws01_workspace_policy') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('private.ws10_creator_grants') IS NOT NULL
 OR to_regprocedure('public.wm_ws10_create_restricted(text,text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS10 prereq missing or object collision'
 USING ERRCODE='42501'; END IF;
END $preflight$;

-- This explicit list is independently administered by authorized IT.
-- The fact that every employee owns a personal Main Workspace does NOT
-- grant creation rights. A non-admin owner must be specifically approved.
CREATE TABLE private.ws10_creator_grants(
 actor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 creator_kind text NOT NULL CHECK(creator_kind IN('it_admin','approved_owner')),
 granted_by uuid NOT NULL REFERENCES public.profiles(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE TABLE private.ws10_flags(
 id boolean PRIMARY KEY DEFAULT true CHECK(id IS TRUE),
 creation_enabled boolean NOT NULL DEFAULT false,
 transfer_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws10_flags(id) VALUES(true);
CREATE TABLE private.ws10_owner_revisions(
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE private.ws10_owner_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 previous_owner uuid NOT NULL REFERENCES public.profiles(id),
 new_owner uuid NOT NULL REFERENCES public.profiles(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,request_id)
);

ALTER TABLE private.ws10_creator_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_owner_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_owner_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws10_creator_grants,private.ws10_flags,
 private.ws10_owner_revisions,private.ws10_owner_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws10_owner_events_id_seq
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.ws10_can_create(p_actor uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $grant$
BEGIN
 IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM private.ws10_flags
   WHERE id IS TRUE AND creation_enabled IS TRUE)
 OR NOT EXISTS(SELECT 1 FROM public.profiles p
   WHERE p.id=p_actor AND p.status='active')
 THEN RETURN false; END IF;
 PERFORM private.ws01_signed_actor_session();
 RETURN EXISTS(SELECT 1 FROM private.ws10_creator_grants g
   WHERE g.actor_id=p_actor AND g.revoked_at IS NULL);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $grant$;
REVOKE ALL ON FUNCTION private.ws10_can_create(uuid)
 FROM PUBLIC,anon,authenticated;

-- Minimal signed actor-bound readiness. Not a general directory/role listing.
CREATE FUNCTION public.wm_ws10_creator_readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $read$
DECLARE v_actor uuid:=auth.uid(); v_workspace uuid;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL THEN
  RAISE EXCEPTION 'No active workspace' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('schemaVersion',1,'status','SIGNED_CREATOR_POLICY',
  'actorId',v_actor,'workspaceId',v_workspace,'revision',1,
  'canCreate',private.ws10_can_create(v_actor),
  'canTransfer',FALSE);
END $read$;
REVOKE ALL ON FUNCTION public.wm_ws10_creator_readiness()
 FROM PUBLIC,anon,authenticated;

-- Wrapper delegates existing idempotent owner+membership creation, but
-- MUST NOT be the only client-facing gate while legacy RPC is executable.
CREATE FUNCTION public.wm_ws10_create_restricted(
 p_name text,p_privacy text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' AS $create$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF NOT private.ws10_can_create(v_actor)
 THEN RAISE EXCEPTION 'Workspace creator authorization denied'
 USING ERRCODE='42501'; END IF;
 RETURN public.wm_ws01_create(p_name,p_privacy,p_request_id);
END $create$;
REVOKE ALL ON FUNCTION public.wm_ws10_create_restricted(text,text,uuid)
 FROM PUBLIC,anon,authenticated;

-- Workspace ownership transfer only. Module/app ownership must use a
-- separate domain-specific migration, not the legacy global module table.
CREATE FUNCTION public.wm_ws10_transfer_ownership(
 p_target_user_id uuid,p_resource_kind text,p_resource_id text,
 p_expected_revision bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' AS $transfer$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_old uuid;
 v_current bigint;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 v_workspace:=public.current_workspace_id(v_actor);
 IF NOT EXISTS(SELECT 1 FROM private.ws10_flags
  WHERE id IS TRUE AND transfer_enabled IS TRUE)
 OR p_resource_kind IS DISTINCT FROM 'workspace'
 OR p_resource_id IS DISTINCT FROM v_workspace::text
 OR p_request_id IS NULL OR p_target_user_id IS NULL
 OR p_target_user_id=v_actor OR p_expected_revision IS NULL
 OR p_expected_revision<1
 THEN RAISE EXCEPTION 'Transfer unavailable or invalid' USING ERRCODE='42501';
 END IF;

 SELECT revision INTO v_current FROM private.ws10_owner_revisions
 WHERE workspace_id=v_workspace FOR UPDATE;
 IF v_current IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale ownership revision' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM private.ws01_member_roles
    WHERE workspace_id=v_workspace AND relation='owner')<>1
 THEN RAISE EXCEPTION 'Workspace ownership requires reconciliation'
 USING ERRCODE='42501'; END IF;
 SELECT user_id INTO v_old FROM private.ws01_member_roles
 WHERE workspace_id=v_workspace AND relation='owner';
 IF v_actor IS DISTINCT FROM v_old AND NOT EXISTS(
  SELECT 1 FROM private.ws10_creator_grants g
  WHERE g.actor_id=v_actor AND g.creator_kind='it_admin'
    AND g.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Only owner or approved IT admin may transfer'
 USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
    WHERE w.workspace_id=v_workspace AND w.user_id=p_target_user_id
      AND w.active IS TRUE)
 THEN RAISE EXCEPTION 'Target not an active workspace member'
 USING ERRCODE='42501'; END IF;
 IF p_target_user_id=v_old
 THEN RAISE EXCEPTION 'Target already owner' USING ERRCODE='42501'; END IF;

 UPDATE private.ws01_member_roles SET relation='member'
 WHERE workspace_id=v_workspace AND user_id=v_old AND relation='owner';
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(v_workspace,p_target_user_id,'owner')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET relation='owner';
 UPDATE private.ws10_owner_revisions SET revision=revision+1
 WHERE workspace_id=v_workspace;
 INSERT INTO private.ws10_owner_events(
 workspace_id,previous_owner,new_owner,actor_id,request_id)
 VALUES(v_workspace,v_old,p_target_user_id,v_actor,p_request_id);
 RETURN jsonb_build_object('state','transferred','workspaceId',
  v_workspace,'requestId',p_request_id,'newOwnerId',p_target_user_id);
END $transfer$;
REVOKE ALL ON FUNCTION public.wm_ws10_transfer_ownership(uuid,text,text,bigint,uuid)
 FROM PUBLIC,anon,authenticated;

-- Defaults remain OFF. No user rows or ownership are mutated by this file.
-- A future separate activation must source-lock the existing legacy create
-- routine and perform REVOKE legacy + GRANT restricted + flag transition
-- atomically, with a rehearsed reversible emergency disable.
COMMIT;
