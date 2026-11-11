-- WS10 — REVIEW-ONLY CANDIDATE. DO NOT APPLY TO LIVE SUPABASE.
-- This is a deliberate authorization change to an existing, shared RPC.
-- Requires IT partner approval, live function fingerprint review, disposable
-- PG17 cross-module acceptance, backup/restore rehearsal and signed test.
-- Owner/creator transfer is workspace-local: never grants global IT Admin.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws01_member_roles') IS NULL OR
    to_regclass('private.ws01_lifecycle_flags') IS NULL OR
    to_regprocedure('private.ws01_signed_actor_session()') IS NULL OR
    to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL OR
    to_regclass('private.ws10_it_admin_creator') IS NOT NULL OR
    to_regclass('private.ws10_creator_flags') IS NOT NULL OR
    to_regprocedure('public.wm_ws10_transfer_workspace_owner(uuid,uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS10 source preflight collision or missing dependency'
 USING ERRCODE='42501'; END IF;
 -- Source locking is mandatory, even if an older migration filename exists.
 -- This fingerprint is from the published B3 production activation candidate.
 IF NOT EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='wm_ws01_create'
     AND pg_get_function_identity_arguments(p.oid)='p_name text, p_privacy text, p_request_id uuid'
     AND md5(pg_get_functiondef(p.oid))='63395e8cb451560b16fd2ccb07a8d20c'
 ) THEN
  RAISE EXCEPTION 'WS10 creation RPC has changed: review live source before migration'
  USING ERRCODE='42501';
 END IF;
 IF EXISTS (
  SELECT 1 FROM private.ws01_member_roles
  WHERE relation='owner' GROUP BY workspace_id HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'Multiple owners require manual reconciliation'
 USING ERRCODE='42501'; END IF;
END $guard$;

-- Dedicated explicit IT Admin allowlist: no claim based on generic CRM admin
-- platform roles, email domains, UI state, or arbitrary JWT metadata.
CREATE TABLE private.ws10_it_admin_creator(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 approved_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE private.ws10_creator_flags(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 creator_enabled boolean NOT NULL DEFAULT false,
 transfer_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws10_creator_flags(id,creator_enabled,transfer_enabled)
 VALUES(true,false,false);

CREATE TABLE private.ws10_owner_transfer_requests(
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 old_owner_id uuid NOT NULL REFERENCES auth.users(id),
 new_owner_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE private.ws10_owner_transfer_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 old_owner_id uuid NOT NULL REFERENCES auth.users(id),
 new_owner_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);

ALTER TABLE private.ws10_it_admin_creator ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_creator_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_owner_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_owner_transfer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws10_it_admin_creator, private.ws10_creator_flags,
 private.ws10_owner_transfer_requests, private.ws10_owner_transfer_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws10_owner_transfer_events_id_seq
 FROM PUBLIC,anon,authenticated;

CREATE UNIQUE INDEX ws10_only_one_workspace_owner
 ON private.ws01_member_roles(workspace_id) WHERE relation='owner';

CREATE FUNCTION private.ws10_workspace_creator_allowed(p_actor uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $policy$
BEGIN
 IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() OR
    NOT EXISTS(SELECT 1 FROM private.ws10_creator_flags f
     WHERE f.id IS TRUE AND f.creator_enabled IS TRUE) OR
    NOT EXISTS(SELECT 1 FROM public.profiles p
     WHERE p.id=p_actor AND p.status='active') THEN RETURN false; END IF;
 RETURN EXISTS (
   SELECT 1 FROM private.ws10_it_admin_creator i
    JOIN auth.users u ON u.id=i.user_id AND u.email_confirmed_at IS NOT NULL
   WHERE i.user_id=p_actor
 ) OR EXISTS(
   SELECT 1 FROM private.ws01_member_roles r
   JOIN public.workspace_members m ON m.workspace_id=r.workspace_id
    AND m.user_id=r.user_id AND m.active IS TRUE
   WHERE r.user_id=p_actor AND r.relation='owner'
 );
EXCEPTION WHEN OTHERS THEN RETURN false;
END $policy$;
REVOKE ALL ON FUNCTION private.ws10_workspace_creator_allowed(uuid)
 FROM PUBLIC,anon,authenticated;

-- Atomic replacement of EXISTING creation RPC: all original validations,
-- idempotency and the creator-as-owner transaction are retained. Only adds
-- an early protected caller eligibility check. The existing GRANT is
-- preserved by CREATE OR REPLACE; new default-OFF flag DENIES all callers.
CREATE OR REPLACE FUNCTION public.wm_ws01_create(
 p_name text,p_privacy text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE v_actor uuid:=auth.uid();
 v_sid uuid;
 v_name text:=pg_catalog.btrim(p_name);
 v_existing private.ws01_create_requests%ROWTYPE;
 v_id uuid;
 v_status text;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 -- WS10: role restriction is enforced by this signed server function, not UI.
 IF NOT private.ws10_workspace_creator_allowed(v_actor) THEN
  RAISE EXCEPTION 'Only approved IT Admins or existing workspace owners can create workspaces'
   USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND creation_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace creation not activated' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR v_name IS NULL OR
  pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 80 OR
  v_name ~ '[[:cntrl:]<>]' OR p_privacy IS NULL OR
  p_privacy NOT IN('open','closed')
 THEN RAISE EXCEPTION 'Invalid workspace creation parameters' USING ERRCODE='22023';
 END IF;
 -- Serialize an actor's concurrent idempotency claims without global locks.
 SELECT status INTO v_status FROM public.profiles
  WHERE id=v_actor FOR UPDATE;
 IF v_status IS DISTINCT FROM 'active'
 THEN RAISE EXCEPTION 'Workspace profile disabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM private.ws01_create_requests
  WHERE actor_id=v_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF v_existing.requested_name IS DISTINCT FROM v_name OR
     v_existing.requested_privacy IS DISTINCT FROM p_privacy
  THEN RAISE EXCEPTION 'Workspace request replay conflict' USING ERRCODE='40001'; END IF;
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'workspaceId',v_existing.workspace_id,'relation','owner',
   'privacy',p_privacy,'idempotent',true,'active',false);
 END IF;
 v_id:=gen_random_uuid();
 INSERT INTO public.workspaces(id,name) VALUES(v_id,v_name);
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(v_id,v_actor,true);
 INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
 VALUES(v_id,p_privacy,v_actor);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(v_id,v_actor,'owner');
 INSERT INTO private.ws01_create_requests(
  actor_id,request_id,workspace_id,requested_name,requested_privacy
 ) VALUES(v_actor,p_request_id,v_id,v_name,p_privacy);
 INSERT INTO private.ws01_events(workspace_id,actor_id,session_id,action)
 VALUES(v_id,v_actor,v_sid,'workspace.created');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'workspaceId',v_id,'relation','owner','privacy',p_privacy,
  'idempotent',false,'active',false);
END $create$;

-- Dedicated read-only creator-role receipt. A normal CRM admin role does
-- not imply IT Administrator. The approved IT creator roster is private and
-- may be changed only by a separately authorized security administrator.
CREATE FUNCTION public.wm_ws10_creator_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $read$
DECLARE v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_it_admin boolean;
 v_owner boolean;
 v_allowed boolean;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.workspace_members m
   WHERE m.user_id=v_actor AND m.workspace_id=v_workspace AND m.active IS TRUE
 ) THEN RAISE EXCEPTION 'Creator scope not authorized' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM private.ws10_it_admin_creator a WHERE a.user_id=v_actor
 ) INTO v_it_admin;
 SELECT EXISTS(
  SELECT 1 FROM private.ws01_member_roles r
   WHERE r.workspace_id=v_workspace AND r.user_id=v_actor
    AND r.relation='owner'
 ) INTO v_owner;
 v_allowed:=private.ws10_workspace_creator_allowed(v_actor);
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'userId',v_actor,'workspaceId',v_workspace,
  'role',CASE WHEN v_it_admin THEN 'it-admin'
    WHEN v_owner THEN 'owner' ELSE 'none' END,
  'canCreateWorkspace',v_allowed,'source','SIGNED_CREATOR_POLICY');
END $read$;
REVOKE ALL ON FUNCTION public.wm_ws10_creator_access()
 FROM PUBLIC,anon,authenticated;
-- No authenticated EXECUTE until source-locked review and test.

-- The transferred owner must already be a verified active member of this
-- exact workspace; owner and approved IT Admin who is a workspace member
-- are the only eligible transfer actors.
CREATE FUNCTION public.wm_ws10_transfer_workspace_owner(
 p_workspace_id uuid,p_target_user_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $transfer$
DECLARE
 v_actor uuid:=auth.uid();
 v_owner uuid;
 v_request private.ws10_owner_transfer_requests%ROWTYPE;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 IF p_workspace_id IS NULL OR p_target_user_id IS NULL OR p_request_id IS NULL OR
    NOT EXISTS(SELECT 1 FROM private.ws10_creator_flags
     WHERE id IS TRUE AND transfer_enabled IS TRUE) THEN
  RAISE EXCEPTION 'Workspace ownership transfer disabled' USING ERRCODE='42501'; END IF;
 -- Serialization prevents simultaneous ownership swaps or cross-workspace
 -- self-privilege replays; the old owner row must still exist and be active.
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_request FROM private.ws10_owner_transfer_requests
  WHERE actor_id=v_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF v_request.workspace_id IS DISTINCT FROM p_workspace_id OR
     v_request.new_owner_id IS DISTINCT FROM p_target_user_id
  THEN RAISE EXCEPTION 'Transfer request replay mismatch' USING ERRCODE='42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,
   'resourceKind','workspace','newOwnerId',p_target_user_id,
   'requestId',p_request_id,'changed',true,'idempotent',true);
 END IF;
 SELECT user_id INTO v_owner FROM private.ws01_member_roles
  WHERE workspace_id=p_workspace_id AND relation='owner' FOR UPDATE;
 IF v_owner IS NULL OR v_owner=p_target_user_id THEN
  RAISE EXCEPTION 'Invalid workspace owner transfer' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members m
    JOIN public.profiles p ON p.id=m.user_id
    WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor
     AND m.active IS TRUE AND p.status='active')
    OR (v_owner<>v_actor AND NOT EXISTS(
      SELECT 1 FROM private.ws10_it_admin_creator WHERE user_id=v_actor))
 THEN RAISE EXCEPTION 'Workspace transfer actor not authorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members m
   JOIN public.profiles p ON p.id=m.user_id
   JOIN auth.users a ON a.id=m.user_id
   WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id
     AND m.active IS TRUE AND p.status='active'
     AND a.email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'New owner must be an active verified workspace member'
 USING ERRCODE='42501'; END IF;
 UPDATE private.ws01_member_roles SET relation='member'
  WHERE workspace_id=p_workspace_id AND user_id=v_owner AND relation='owner';
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
  VALUES(p_workspace_id,p_target_user_id,'owner')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET relation='owner';
 INSERT INTO private.ws10_owner_transfer_requests(
  actor_id,request_id,workspace_id,old_owner_id,new_owner_id)
 VALUES(v_actor,p_request_id,p_workspace_id,v_owner,p_target_user_id);
 INSERT INTO private.ws10_owner_transfer_events(
  workspace_id,actor_id,old_owner_id,new_owner_id,request_id)
 VALUES(p_workspace_id,v_actor,v_owner,p_target_user_id,p_request_id);
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,
   'resourceKind','workspace','newOwnerId',p_target_user_id,
   'requestId',p_request_id,'changed',true,'idempotent',false);
END $transfer$;
REVOKE ALL ON FUNCTION public.wm_ws10_transfer_workspace_owner(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- No EXECUTE grant for transfer; a separate gated activation is necessary.
-- No direct table writes to browser roles, no role inheritance, no app grants.
COMMIT;
