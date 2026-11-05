-- CP-WS-01C/B3 — signed actor session and workspace creation RPC candidate.
-- DISPOSABLE TEST ONLY. Never apply to production without separate approval.
-- Requires previously installed CP-WS-01C/B1 schema and its disabled flags.
-- No grants to authenticated/anon; the create flag remains FALSE.
BEGIN;
DO $ws01_b3_preflight$
BEGIN
 IF to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('private.ws01_create_requests') IS NULL
  OR to_regclass('private.ws01_lifecycle_flags') IS NULL
  OR to_regclass('private.ws01_events') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-WS-01C/B3 missing schema or prior function collision'
  USING ERRCODE='42501';
 END IF;
END $ws01_b3_preflight$;

CREATE FUNCTION private.ws01_signed_actor_session()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $actor$
DECLARE v_actor uuid:=auth.uid();
 sid_text text:=auth.jwt()->>'session_id';
 v_sid uuid;
BEGIN
 IF v_actor IS NULL OR sid_text IS NULL OR sid_text !~
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  OR NOT private.wm_board_config_session_active()
  OR NOT EXISTS(SELECT 1 FROM public.profiles
   WHERE id=v_actor AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members
   WHERE user_id=v_actor AND active IS TRUE)
 THEN RAISE EXCEPTION 'Signed workspace lifecycle denied' USING ERRCODE='42501';
 END IF;
 v_sid:=sid_text::uuid;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions
  WHERE id=v_sid AND user_id=v_actor AND (not_after IS NULL OR not_after>now()))
 THEN RAISE EXCEPTION 'Signed workspace session revoked' USING ERRCODE='42501';
 END IF;
 RETURN v_sid;
END $actor$;
REVOKE ALL ON FUNCTION private.ws01_signed_actor_session() FROM PUBLIC,anon,authenticated;

-- Idempotent, atomic owner+membership creation. NO automatic session switch.
-- Open privacy is metadata only; unrestricted join/discovery is NOT enabled.
CREATE FUNCTION public.wm_ws01_create(
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
REVOKE ALL ON FUNCTION public.wm_ws01_create(text,text,uuid)
 FROM PUBLIC,anon,authenticated;
-- Intentional: no authenticated EXECUTE grant and creation_enabled=false.
COMMIT;
