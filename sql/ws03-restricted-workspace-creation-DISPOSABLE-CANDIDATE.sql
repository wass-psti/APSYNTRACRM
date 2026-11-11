-- WS03: IT Administrator / organizational owner only workspace creation.
-- REVIEW / DISPOSABLE ENVIRONMENT ONLY. DO NOT run on a shared Supabase
-- project until source fingerprints, policies, revocation tests, rollback and
-- migration authority are approved. Existing B3 creator RPC MAY currently be
-- live; applying this replacement changes a shared authorization boundary.
BEGIN;

DO $guard$
BEGIN
 IF to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
 OR to_regclass('private.ws01_member_roles') IS NULL
 OR to_regclass('private.ws01_create_requests') IS NULL
 OR to_regclass('private.ws01_lifecycle_flags') IS NULL
 OR to_regclass('private.ws01_events') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('auth.sessions') IS NULL
 OR to_regclass('private.ws03_creator_authorities') IS NOT NULL
 THEN RAISE EXCEPTION 'WS03 creation prerequisites or migration collision' USING ERRCODE='42501';
 END IF;
END $guard$;

-- No role is inferred from ownership of an automatic personal Main Workspace,
-- email domains, or an editable platform-role field. Security administrators
-- explicitly provision approvals after verifying the IT/owner delegation.
CREATE TABLE private.ws03_creator_authorities(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 authority text NOT NULL CHECK(authority IN('it_admin','organization_owner')),
 enabled boolean NOT NULL DEFAULT false,
 granted_by uuid REFERENCES public.profiles(id),
 granted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE TABLE private.ws03_creator_flags(
 id boolean PRIMARY KEY DEFAULT true CHECK(id IS TRUE),
 restricted_creation_enabled boolean NOT NULL DEFAULT false,
 owner_transfer_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws03_creator_flags(id) VALUES(true);

ALTER TABLE private.ws03_creator_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws03_creator_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws03_creator_authorities,private.ws03_creator_flags
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wm_ws03_creator_eligibility()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_workspace uuid;v_basis text;
BEGIN
 PERFORM private.ws01_signed_actor_session();
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL THEN
   RAISE EXCEPTION 'No signed workspace scope' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM private.ws03_creator_flags
    WHERE id IS TRUE AND restricted_creation_enabled IS TRUE)
 THEN
   SELECT authority INTO v_basis FROM private.ws03_creator_authorities
    WHERE user_id=v_actor AND enabled IS TRUE;
 END IF;
 RETURN jsonb_build_object('schemaVersion',1,'userId',v_actor,
  'workspaceId',v_workspace,'allowed',v_basis IS NOT NULL,
  'basis',v_basis);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_ws03_creator_eligibility()
 FROM PUBLIC,anon,authenticated;

-- Requires source-faithful comparison to deployed B3 before replacing.
-- B3's idempotent transaction, signed-session checks and ownership receipt
-- are preserved. The new precondition is the explicit WS03 entitlement.
CREATE OR REPLACE FUNCTION public.wm_ws01_create(
 p_name text,p_privacy text,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE v_actor uuid:=auth.uid();
 v_sid uuid;
 v_name text:=pg_catalog.btrim(p_name);
 v_existing private.ws01_create_requests%ROWTYPE;
 v_id uuid;
 v_status text;
BEGIN
 v_sid:=private.ws01_signed_actor_session();
 IF NOT EXISTS(
  SELECT 1 FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND creation_enabled IS TRUE)
 OR NOT EXISTS(
  SELECT 1 FROM private.ws03_creator_flags
    WHERE id IS TRUE AND restricted_creation_enabled IS TRUE)
 OR NOT EXISTS(
  SELECT 1 FROM private.ws03_creator_authorities a
    WHERE a.user_id=v_actor AND a.enabled IS TRUE
      AND a.authority IN('it_admin','organization_owner')
 )
 THEN
   RAISE EXCEPTION 'Workspace creation restricted to authorized IT admins and owners'
     USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR v_name IS NULL OR
  pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 80 OR
  v_name ~ '[[:cntrl:]<>]' OR p_privacy IS NULL OR
  p_privacy NOT IN('open','closed')
 THEN RAISE EXCEPTION 'Invalid workspace creation parameters' USING ERRCODE='22023'; END IF;
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

-- Untrusted browser roles receive NO new grants from this script. Existing
-- authenticated create grant (if present) is still subject to the server
-- restriction above. Do not install only the UI change.
COMMIT;
