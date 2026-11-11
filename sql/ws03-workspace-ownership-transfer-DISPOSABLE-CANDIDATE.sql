-- WS03: safe workspace-owner transfer and application-owner review registry.
-- NOT FOR LIVE DEPLOYMENT: source-faithful guards, permissions and rollback
-- require IT partner approval. Never replace app-specific owner RPCs by
-- inserting a row in a generic ownership registry.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws03_creator_flags') IS NULL
 OR to_regclass('private.ws03_creator_authorities') IS NULL
 OR to_regclass('private.ws01_member_roles') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('auth.users') IS NULL
 OR to_regclass('private.ws03_owner_transfer_requests') IS NOT NULL
 THEN RAISE EXCEPTION 'WS03 transfer prerequisites missing or collision'
   USING ERRCODE='42501'; END IF;
END $guard$;

CREATE TABLE private.ws03_owner_transfer_requests(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 expected_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 target_user_id uuid NOT NULL REFERENCES public.profiles(id),
 resource_kind text NOT NULL CHECK(resource_kind='workspace'),
 transferred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,actor_id,request_id)
);
CREATE TABLE private.ws03_owner_transfer_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 old_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 new_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 event text NOT NULL DEFAULT 'workspace.owner.transferred'
  CHECK(event='workspace.owner.transferred'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- This table describes app ownership review only, it is NOT a replacement
-- for per-application authorization, workflows, assets or module roles.
CREATE TABLE private.ws03_app_owner_review(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL CHECK(
  length(module_id) BETWEEN 2 AND 64 AND module_id ~ '^[a-z0-9_-]+$'),
 requires_module_backend boolean NOT NULL DEFAULT true CHECK(requires_module_backend),
 approved boolean NOT NULL DEFAULT false,
 approved_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,module_id)
);
ALTER TABLE private.ws03_owner_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws03_owner_transfer_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws03_app_owner_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws03_owner_transfer_requests,
 private.ws03_owner_transfer_audit,private.ws03_app_owner_review
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws03_owner_transfer_audit_id_seq
 FROM PUBLIC,anon,authenticated;

-- This atomic transfer is scoped to exactly ONE active workspace and changes
-- only its private owner relation. Neither IT Admin authority nor app/board
-- edit rights are inferred from transferring workspace ownership.
CREATE FUNCTION public.wm_ws03_transfer_ownership(
 p_workspace_id uuid,
 p_resource_kind text,
 p_resource_id uuid,
 p_target_user_id uuid,
 p_expected_owner_id uuid,
 p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' AS $transfer$
DECLARE v_actor uuid:=auth.uid();v_owner uuid;v_seen record;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 IF p_workspace_id IS NULL OR p_request_id IS NULL
    OR p_target_user_id IS NULL OR p_expected_owner_id IS NULL
    OR p_target_user_id=p_expected_owner_id OR
    p_resource_kind IS DISTINCT FROM 'workspace' OR p_resource_id IS NOT NULL
 THEN RAISE EXCEPTION 'Invalid workspace ownership transfer'
  USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws03_creator_flags f
   WHERE f.id IS TRUE AND f.owner_transfer_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Workspace ownership transfer disabled'
  USING ERRCODE='42501'; END IF;
 IF public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace_id
 THEN RAISE EXCEPTION 'Workspace selection changed' USING ERRCODE='42501'; END IF;
 -- A global IT administrator must still have active membership in this
 -- authoritative workspace. No cross-workspace hidden override is introduced.
 IF NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=v_actor AND wm.active
 ) OR NOT EXISTS(
  SELECT 1 FROM private.ws01_member_roles r
   WHERE r.workspace_id=p_workspace_id AND r.user_id=v_actor
    AND r.relation='owner'
  UNION ALL
  SELECT 1 FROM private.ws03_creator_authorities a
   WHERE a.user_id=v_actor AND a.enabled IS TRUE AND a.authority='it_admin'
 )
 THEN RAISE EXCEPTION 'Workspace owner or IT administrator required'
   USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_workspace_id::text||':workspace-owner',0));
 SELECT * INTO v_seen FROM private.ws03_owner_transfer_requests
 WHERE workspace_id=p_workspace_id AND actor_id=v_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF v_seen.target_user_id IS DISTINCT FROM p_target_user_id OR
     v_seen.expected_owner_id IS DISTINCT FROM p_expected_owner_id OR
     v_seen.resource_kind IS DISTINCT FROM p_resource_kind
  THEN RAISE EXCEPTION 'Ownership transfer request replay collision'
    USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('schemaVersion',1,'transferred',true,
    'workspaceId',p_workspace_id,'resourceKind','workspace',
    'targetUserId',p_target_user_id,'idempotent',true);
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.workspace_members m JOIN public.profiles p
   ON p.id=m.user_id JOIN auth.users u ON u.id=m.user_id
  WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id
   AND m.active IS TRUE AND p.status='active'
   AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE
 ) THEN RAISE EXCEPTION 'New owner must be a verified active workspace member'
   USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM private.ws01_member_roles r
     WHERE r.workspace_id=p_workspace_id AND r.relation='owner')<>1
 THEN RAISE EXCEPTION 'Exactly one existing owner required'
   USING ERRCODE='42501'; END IF;
 SELECT r.user_id INTO v_owner FROM private.ws01_member_roles r
 WHERE r.workspace_id=p_workspace_id AND r.relation='owner'
 FOR UPDATE;
 IF v_owner IS DISTINCT FROM p_expected_owner_id
 THEN RAISE EXCEPTION 'Owner changed during transfer' USING ERRCODE='40001'; END IF;

 UPDATE private.ws01_member_roles
  SET relation='member' WHERE workspace_id=p_workspace_id AND user_id=v_owner;
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
  VALUES(p_workspace_id,p_target_user_id,'owner')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET relation='owner';
 IF (SELECT count(*) FROM private.ws01_member_roles r
     WHERE r.workspace_id=p_workspace_id AND r.relation='owner')<>1
 THEN RAISE EXCEPTION 'Owner transfer invariants failed'
   USING ERRCODE='42501'; END IF;
 INSERT INTO private.ws03_owner_transfer_requests(
  workspace_id,request_id,actor_id,expected_owner_id,target_user_id,resource_kind)
 VALUES(p_workspace_id,p_request_id,v_actor,p_expected_owner_id,
   p_target_user_id,'workspace');
 INSERT INTO private.ws03_owner_transfer_audit(
  workspace_id,actor_id,old_owner_id,new_owner_id)
 VALUES(p_workspace_id,v_actor,v_owner,p_target_user_id);
 RETURN jsonb_build_object('schemaVersion',1,'transferred',true,
   'workspaceId',p_workspace_id,'resourceKind','workspace',
   'targetUserId',p_target_user_id,'idempotent',false);
END $transfer$;
REVOKE ALL ON FUNCTION public.wm_ws03_transfer_ownership(
 uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
-- Signed, strictly workspace-scoped eligibility reader. This function does
-- not disclose addresses or membership lists to unauthorized callers.
CREATE FUNCTION public.wm_ws03_transfer_candidates(
 p_workspace_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $read$
DECLARE
 v_actor uuid:=auth.uid();v_owner uuid;v_count integer;v_people jsonb;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 IF p_workspace_id IS NULL OR
    public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace_id
 OR NOT EXISTS(
    SELECT 1 FROM private.ws03_creator_flags
     WHERE id IS TRUE AND owner_transfer_enabled IS TRUE
 ) OR NOT EXISTS(
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id=p_workspace_id AND user_id=v_actor AND active
 ) OR NOT EXISTS(
    SELECT 1 FROM private.ws01_member_roles r
     WHERE r.workspace_id=p_workspace_id AND r.user_id=v_actor
       AND r.relation='owner'
    UNION ALL
    SELECT 1 FROM private.ws03_creator_authorities a
     WHERE a.user_id=v_actor AND a.enabled IS TRUE AND a.authority='it_admin'
 )
 THEN RAISE EXCEPTION 'Ownership candidates denied' USING ERRCODE='42501';
 END IF;
 SELECT r.user_id INTO v_owner FROM private.ws01_member_roles r
 WHERE r.workspace_id=p_workspace_id AND r.relation='owner';
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Owner missing' USING ERRCODE='42501'; END IF;
 SELECT count(*)::integer INTO v_count
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 JOIN auth.users u ON u.id=wm.user_id
 WHERE wm.workspace_id=p_workspace_id AND wm.user_id<>v_owner
  AND wm.active IS TRUE AND p.status='active'
  AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE;
 IF v_count>100 THEN
  RAISE EXCEPTION 'Too many eligible members for transfer selection'
    USING ERRCODE='54000';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',wm.user_id,'name',p.display_name,'verified',true)
   ORDER BY p.display_name),'[]'::jsonb)
 INTO v_people
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 JOIN auth.users u ON u.id=wm.user_id
 WHERE wm.workspace_id=p_workspace_id AND wm.user_id<>v_owner
  AND wm.active IS TRUE AND p.status='active'
  AND p.display_name IS NOT NULL AND length(btrim(p.display_name))>0
  AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE;
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,
  'actorId',v_actor,'currentOwnerId',v_owner,
  'authorized',true,'members',v_people);
END $read$;
REVOKE ALL ON FUNCTION public.wm_ws03_transfer_candidates(uuid)
 FROM PUBLIC,anon,authenticated;

-- Former owner retains read-only access to the outcome of their exact
-- request; this avoids falsely showing "failed" when ownership was committed
-- and the former owner correctly lost permission to list transfer candidates.
CREATE FUNCTION public.wm_ws03_verify_transfer(
 p_workspace_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $verify$
DECLARE
 v_actor uuid:=auth.uid();v_request record;v_owner uuid;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 IF p_workspace_id IS NULL OR p_request_id IS NULL
  OR public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace_id
  OR NOT EXISTS(
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id=p_workspace_id AND wm.user_id=v_actor
      AND wm.active IS TRUE
  ) THEN
  RAISE EXCEPTION 'Transfer verification denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_request FROM private.ws03_owner_transfer_requests
 WHERE workspace_id=p_workspace_id AND actor_id=v_actor
  AND request_id=p_request_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Transfer request not found' USING ERRCODE='42501';
 END IF;
 SELECT r.user_id INTO v_owner
 FROM private.ws01_member_roles r
 WHERE r.workspace_id=p_workspace_id AND r.relation='owner';
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,
  'actorId',v_actor,'requestId',p_request_id,
  'targetUserId',v_request.target_user_id,'currentOwnerId',v_owner,
  'transferred',v_owner IS NOT DISTINCT FROM v_request.target_user_id);
END $verify$;
REVOKE ALL ON FUNCTION public.wm_ws03_verify_transfer(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- No roles, functions or private tables have been granted to a client.
COMMIT;
