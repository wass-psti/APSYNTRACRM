-- CP-RC01 / proposed additive database patch. NOT APPLIED TO PRODUCTION BY THIS COMMIT.
-- Does not change public.profiles, existing module_role_assignments, existing board memberships
-- or any active application permission check. All changes are staged; no apply endpoint exists.
BEGIN;
CREATE TABLE IF NOT EXISTS public.apsyntra_role_bootstrap_identities (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 canonical_email text NOT NULL UNIQUE CHECK (canonical_email IN
  ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.apsyntra_role_bootstrap_identities FROM PUBLIC,anon,authenticated;
ALTER TABLE public.apsyntra_role_bootstrap_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apsyntra_role_bootstrap_identities FORCE ROW LEVEL SECURITY;
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id,canonical_email)
 SELECT u.id,lower(u.email) FROM auth.users u
 JOIN public.profiles p ON p.id=u.id
 WHERE lower(u.email) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 AND lower(p.email)=lower(u.email) AND p.platform_role='admin_general_manager' AND p.status='active'
ON CONFLICT(user_id) DO NOTHING;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.apsyntra_role_bootstrap_identities)<>2 OR
 (SELECT count(DISTINCT canonical_email) FROM public.apsyntra_role_bootstrap_identities)<>2 THEN
  RAISE EXCEPTION 'Both immutable bootstrap identities must be verified before installing role management';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
  JOIN auth.users u ON u.id=b.user_id
  JOIN public.profiles p ON p.id=b.user_id
  WHERE b.user_id=auth.uid() AND lower(u.email)=b.canonical_email
   AND lower(p.email)=b.canonical_email
   AND p.status='active' AND p.platform_role='admin_general_manager'
 );
$$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_bootstrap() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_bootstrap() TO authenticated;

CREATE TABLE IF NOT EXISTS public.apsyntra_role_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid REFERENCES public.workspaces(id),
 role_key text NOT NULL CHECK (role_key ~ '^[a-z][a-z0-9_-]{1,47}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
 description text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN('system_reference','custom_draft')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('reference','draft','inactive')),
 permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(permissions)='object'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT(workspace_id,role_key)
);
REVOKE ALL ON public.apsyntra_role_templates FROM PUBLIC,anon,authenticated;
ALTER TABLE public.apsyntra_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apsyntra_role_templates FORCE ROW LEVEL SECURITY;
INSERT INTO public.apsyntra_role_templates(workspace_id,role_key,display_name,kind,state,permissions)
VALUES (null,'admin','Admin','system_reference','reference','{}'),
       (null,'supervisor','Supervisor','system_reference','reference','{}'),
       (null,'employee','Employee','system_reference','reference','{}'),
       (null,'viewer','Viewer','system_reference','reference','{}')
ON CONFLICT(workspace_id,role_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.apsyntra_role_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 proposed_by uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL CHECK(operation IN(
  'role.create','role.edit','role.activate','role.deactivate',
  'assignment.assign','assignment.revoke','permission.configure','workspace.configure')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 status text NOT NULL DEFAULT 'proposed' CHECK(status='proposed'),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.apsyntra_role_change_requests FROM PUBLIC,anon,authenticated;
ALTER TABLE public.apsyntra_role_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apsyntra_role_change_requests FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.apsyntra_role_change_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 change_id uuid NOT NULL REFERENCES public.apsyntra_role_change_requests(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 event text NOT NULL CHECK(event IN ('proposed')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 detail jsonb NOT NULL CHECK(jsonb_typeof(detail)='object')
);
REVOKE ALL ON public.apsyntra_role_change_audit FROM PUBLIC,anon,authenticated;
ALTER TABLE public.apsyntra_role_change_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apsyntra_role_change_audit FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.apsyntra_role_block_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN RAISE EXCEPTION 'Role audit is immutable' USING ERRCODE='42501'; END $$;
DROP TRIGGER IF EXISTS apsyntra_role_audit_immutable ON public.apsyntra_role_change_audit;
CREATE TRIGGER apsyntra_role_audit_immutable BEFORE UPDATE OR DELETE
 ON public.apsyntra_role_change_audit
 FOR EACH ROW EXECUTE FUNCTION public.apsyntra_role_block_audit_mutation();
REVOKE ALL ON FUNCTION public.apsyntra_role_block_audit_mutation() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.apsyntra_role_audit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 INSERT INTO public.apsyntra_role_change_audit(change_id,workspace_id,actor_id,event,detail)
 VALUES (NEW.id,NEW.workspace_id,NEW.proposed_by,'proposed',
   jsonb_build_object('operation',NEW.operation,'state',NEW.status));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS apsyntra_role_request_audit ON public.apsyntra_role_change_requests;
CREATE TRIGGER apsyntra_role_request_audit AFTER INSERT
 ON public.apsyntra_role_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.apsyntra_role_audit_insert();
REVOKE ALL ON FUNCTION public.apsyntra_role_audit_insert() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT public.apsyntra_role_is_bootstrap()
 OR p_workspace_id IS NULL OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active)
 THEN RAISE EXCEPTION 'Bootstrap role configuration access denied' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.apsyntra_role_require_scope(uuid) FROM PUBLIC,anon,authenticated;
-- Internal SECURITY DEFINER function only; never grant caller role permission.

CREATE OR REPLACE FUNCTION public.apsyntra_role_configuration_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 SELECT jsonb_build_object(
  'workspaceId',p_workspace_id,'bootstrapVerified',true,'mode','staged_only',
  'roles',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'roleKey',r.role_key,'displayName',r.display_name,'kind',r.kind,
      'state',r.state,'permissions',r.permissions,'revision',r.revision)
     ORDER BY r.kind,r.role_key)
     FROM public.apsyntra_role_templates r
     WHERE r.workspace_id IS NULL OR r.workspace_id=p_workspace_id),'[]'::jsonb),
  'users',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',p.id,'displayName',p.display_name,'email',p.email,
     'platformRole',p.platform_role,'status',p.status,'bootstrapProtected',
     EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=p.id))
     ORDER BY p.display_name)
     FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
     WHERE wm.workspace_id=p_workspace_id AND wm.active),'[]'::jsonb),
  'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'userId',r.user_id,'moduleId',r.module_id,'role',r.role,
     'enabled',r.enabled,'updatedAt',r.updated_at))
     FROM public.module_role_assignments r JOIN public.workspace_members m
       ON m.user_id=r.user_id AND m.workspace_id=p_workspace_id AND m.active),'[]'::jsonb),
  'boards',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',b.id,'name',b.name,'workspaceId',b.workspace_id))
     FROM public.work_boards b WHERE b.workspace_id=p_workspace_id
       AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL),'[]'::jsonb),
  'proposals',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',c.id,'operation',c.operation,'payload',c.payload,'status',c.status,
    'createdAt',c.created_at,'proposedBy',c.proposed_by) ORDER BY c.created_at DESC)
    FROM (SELECT * FROM public.apsyntra_role_change_requests x
          WHERE x.workspace_id=p_workspace_id ORDER BY x.created_at DESC LIMIT 150) c),'[]'::jsonb),
  'audit',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',a.id,'event',a.event,'changeId',a.change_id,'actorId',a.actor_id,
     'recordedAt',a.recorded_at,'detail',a.detail) ORDER BY a.id DESC)
     FROM (SELECT * FROM public.apsyntra_role_change_audit x
       WHERE x.workspace_id=p_workspace_id ORDER BY x.id DESC LIMIT 150) a),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.apsyntra_role_configuration_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_configuration_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_role_configuration_propose(
 p_workspace_id uuid,p_operation text,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_actor uuid:=auth.uid();v_id uuid;v_user uuid;v_keys text[];
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_operation NOT IN (
  'role.create','role.edit','role.activate','role.deactivate','assignment.assign',
  'assignment.revoke','permission.configure','workspace.configure')
  OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR octet_length(p_payload::text)>4096
 THEN RAISE EXCEPTION 'Invalid role change proposal' USING ERRCODE='22023'; END IF;
 IF p_payload ?| ARRAY['bootstrap','bootstrapAdmin','platform_role',
    'isBootstrap','service_role','user_metadata','authClaims','jwt']
 THEN RAISE EXCEPTION 'Protected authority cannot be configured' USING ERRCODE='42501'; END IF;
 IF p_payload ? 'userId' THEN
  IF (p_payload->>'userId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'Invalid target user' USING ERRCODE='22023'; END IF;
  v_user:=(p_payload->>'userId')::uuid;
  IF v_user=v_actor OR
   EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=v_user)
   OR NOT EXISTS (SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
       WHERE m.user_id=v_user AND m.workspace_id=p_workspace_id AND m.active AND p.status='active')
  THEN RAISE EXCEPTION 'Cannot modify self, bootstrap identities or out-of-scope users' USING ERRCODE='42501'; END IF;
 ELSIF p_operation LIKE 'assignment.%' THEN
  RAISE EXCEPTION 'Assignment requires an actual userId' USING ERRCODE='22023';
 END IF;
 IF p_payload ? 'moduleId' AND (p_payload->>'moduleId') NOT IN
  ('fueltrans','tool-traceability','toolbox-issues','fund-released-tracker',
   'fueltrack-plus','tradelink','time-tracker','order-intake','employee-eval',
   'charter-navigator','aps-aims','material-request-hub')
 THEN RAISE EXCEPTION 'Unknown authoritative module' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'roleKey' AND (p_payload->>'roleKey') !~ '^[a-z][a-z0-9_-]{1,47}$'
 THEN RAISE EXCEPTION 'Invalid role key' USING ERRCODE='22023'; END IF;
 INSERT INTO public.apsyntra_role_change_requests(workspace_id,proposed_by,operation,payload)
 VALUES(p_workspace_id,v_actor,p_operation,p_payload) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.apsyntra_role_configuration_propose(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_configuration_propose(uuid,text,jsonb) TO authenticated;
-- NO mutation/apply RPC: proposals have NO effect on active roles, permissions or memberships.

-- Custom role definitions can be created/edited as INACTIVE DRAFTS only.
-- They cannot grant platform/admin/board access until a separately approved
-- future migration integrates the existing authoritative permission decisions.
CREATE OR REPLACE FUNCTION public.apsyntra_role_configuration_save_draft(
 p_workspace_id uuid,p_role_key text,p_display_name text,p_description text,
 p_permissions jsonb,p_expected_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $
DECLARE v_actor uuid:=auth.uid();v_role public.apsyntra_role_templates%rowtype;
 v_module text;v_caps jsonb;v_cap text;v_value jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_role_key IS NULL OR p_role_key !~ '^[a-z][a-z0-9_-]{1,47}
 OR p_role_key IN ('admin','supervisor','employee','viewer','bootstrap')
 OR p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 2 AND 100
 OR length(coalesce(p_description,''))>500
 OR p_permissions IS NULL OR jsonb_typeof(p_permissions)<>'object'
 OR octet_length(p_permissions::text)>4096
 THEN RAISE EXCEPTION 'Invalid or protected custom role' USING ERRCODE='22023'; END IF;
 FOR v_module,v_caps IN SELECT key,value FROM jsonb_each(p_permissions) LOOP
  IF v_module NOT IN ('fueltrans','tool-traceability','toolbox-issues','fund-released-tracker',
     'fueltrack-plus','tradelink','time-tracker','order-intake','employee-eval',
     'charter-navigator','aps-aims','material-request-hub')
   OR jsonb_typeof(v_caps)<>'object' THEN
   RAISE EXCEPTION 'Unknown module permission scope' USING ERRCODE='22023';
  END IF;
  FOR v_cap,v_value IN SELECT key,value FROM jsonb_each(v_caps) LOOP
   IF v_cap NOT IN ('view','create','edit','delete','approve','export','administer')
     OR jsonb_typeof(v_value)<>'boolean' THEN
    RAISE EXCEPTION 'Invalid proposed capability' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
 IF p_expected_revision IS NULL THEN
  INSERT INTO public.apsyntra_role_templates(workspace_id,role_key,display_name,description,
      kind,state,permissions,created_by)
  VALUES(p_workspace_id,p_role_key,btrim(p_display_name),
      coalesce(p_description,''),'custom_draft','draft',p_permissions,v_actor)
  RETURNING * INTO v_role;
 ELSE
  UPDATE public.apsyntra_role_templates
  SET display_name=btrim(p_display_name),description=coalesce(p_description,''),
      permissions=p_permissions,revision=revision+1,updated_at=now()
  WHERE workspace_id=p_workspace_id AND role_key=p_role_key
   AND kind='custom_draft' AND state='draft' AND revision=p_expected_revision
  RETURNING * INTO v_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale or protected draft role' USING ERRCODE='PT409'; END IF;
 END IF;
 INSERT INTO public.apsyntra_role_change_requests(workspace_id,proposed_by,operation,payload)
 VALUES(p_workspace_id,v_actor,
   CASE WHEN p_expected_revision IS NULL THEN 'role.create' ELSE 'role.edit' END,
   jsonb_build_object('roleKey',v_role.role_key,'displayName',v_role.display_name,
     'revision',v_role.revision,'kind','custom_draft','effective',false));
 RETURN jsonb_build_object('id',v_role.id,'roleKey',v_role.role_key,
    'state',v_role.state,'revision',v_role.revision,'effective',false);
END $;
REVOKE ALL ON FUNCTION public.apsyntra_role_configuration_save_draft(
 uuid,text,text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_configuration_save_draft(
 uuid,text,text,text,jsonb,integer) TO authenticated;

COMMIT;