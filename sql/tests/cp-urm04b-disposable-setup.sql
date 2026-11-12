-- CP-URM-04B disposable PostgreSQL 17 fixture. All identities and data are synthetic.
\set ON_ERROR_STOP on
DO $$BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END$$;
\ir cp-rc03-disposable-setup.sql

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
INSERT INTO public.profiles(id,status,display_name,email,platform_role) VALUES
 ('55555555-5555-4555-8555-555555555555','active','Non-bootstrap inherited admin','inherited@example.invalid','admin_general_manager')
 ON CONFLICT(id) DO NOTHING;
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555',true)
 ON CONFLICT DO NOTHING;

CREATE TABLE public.apsyntra_crm_platform_roles(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,
 assigned_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id));
INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin');

CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT coalesce((SELECT r.role FROM public.apsyntra_crm_platform_roles r
 WHERE r.user_id=p_user AND r.workspace_id=p_workspace),
 CASE p.platform_role WHEN 'admin_general_manager' THEN 'admin'
  WHEN 'hr' THEN 'supervisor' WHEN 'supervisor' THEN 'supervisor' ELSE 'employee' END)
 FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id
 WHERE p.id=p_user AND p.status='active' AND m.workspace_id=p_workspace AND m.active LIMIT 1 $$;

CREATE TABLE public.frt_audit_logs(workspace_id uuid,user_id uuid,action text,details jsonb);
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.tool_traceability_is_admin(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT public.is_platform_admin(auth.uid()) $$;
CREATE TABLE public.tool_traceability_bootstrap_admins09(workspace_id uuid,user_id uuid,PRIMARY KEY(workspace_id,user_id));
INSERT INTO public.tool_traceability_bootstrap_admins09 VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000001'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333');
CREATE TABLE public.tool_traceability_memberships(
 workspace_id uuid,user_id uuid,role text,enabled boolean,status text,assigned_by uuid,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.tool_traceability_activity(
 workspace_id uuid,entity_type text,entity_id text,actor_user_id uuid,event_type text,detail jsonb);

-- Snapshot stubs retain the exact legacy field contract for migration verification.
CREATE OR REPLACE FUNCTION public.apsyntra_role_configuration_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'bootstrapVerified',true,'mode','staged_only',
 'roles','[]'::jsonb,'users','[]'::jsonb,'assignments','[]'::jsonb,'boards','[]'::jsonb,
 'proposals','[]'::jsonb,'audit','[]'::jsonb); END $$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_user_management_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'bootstrapVerified',true,
 'users','[]'::jsonb,'modules','[]'::jsonb,'moduleAssignments','[]'::jsonb,
 'boards','[]'::jsonb,'boardAssignments','[]'::jsonb); END $$;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_platform_role_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'bootstrapVerified',true,'roles','[]'::jsonb); END $$;

-- Legacy CRM role setter shape, including the inherited-platform-role target lock.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_platform_role_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor
   OR (p_role IS NOT NULL AND p_role NOT IN ('admin','supervisor','employee','viewer'))
   OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=p_target_user_id)
   OR public.is_platform_admin(p_target_user_id)
 THEN RAISE EXCEPTION 'Protected or invalid CRM platform role target' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
  WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id AND m.active AND p.status='active')
 THEN RAISE EXCEPTION 'Target outside active workspace' USING ERRCODE='42501'; END IF;
 INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role,assigned_by,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_role,v_actor,now())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,assigned_by=v_actor,updated_at=now();
 RETURN jsonb_build_object('effective',true,'workspaceId',p_workspace_id,
  'targetUserId',p_target_user_id,'scope','crm-platform',
  'effectiveRole',public.apsyntra_crm_effective_role(p_target_user_id,p_workspace_id));
END $$;

-- Legacy central application-role dispatcher; migration must replace both old guards.
CREATE OR REPLACE FUNCTION public.wm_admin_set_application_role(
 p_user_id uuid,p_module_id text,p_role text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid:=auth.uid(); v_workspace uuid;
BEGIN
 if v_admin is null or not public.apsyntra_role_is_bootstrap() then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then
   raise exception 'Cannot change own or protected admin application role' using errcode='42501';
 end if;
 v_workspace:=public.current_workspace_id(v_admin);
 if v_workspace is null or not exists(
  select 1 from public.workspace_members m where m.workspace_id=v_workspace and m.user_id=v_admin and m.active
 ) or not exists(
  select 1 from public.workspace_members m join public.profiles p on p.id=m.user_id
  where m.workspace_id=v_workspace and m.user_id=p_user_id and m.active and p.status='active'
 ) then raise exception 'Administrator and target require active shared workspace' using errcode='42501'; end if;
 if p_module_id='fund-released-tracker' then
  perform public.frt_admin_set_role(v_workspace,p_user_id,p_role);
 elsif p_module_id='tool-traceability' then
  perform public.tool_traceability_admin_set_role(v_workspace,p_user_id,p_role,p_enabled);
 else
  insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
  values(p_user_id,p_module_id,p_role,p_enabled,v_admin)
  on conflict(user_id,module_id) do update set role=excluded.role,enabled=excluded.enabled,
   assigned_by=v_admin,updated_at=now();
 end if;
 RETURN jsonb_build_object('delegated',true);
END $$;

-- Legacy FRT setter has a hard-coded bootstrap email gate and inherited-admin target lock.
CREATE OR REPLACE FUNCTION public.frt_admin_set_role(p_workspace_id uuid,p_user_id uuid,p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','private','pg_temp'
AS $function$
DECLARE v_admin uuid:=(SELECT auth.uid()); v_email text;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_user_id IS NULL OR p_user_id=v_admin OR public.is_platform_admin(p_user_id)
 OR EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=p_user_id)
 THEN RAISE EXCEPTION 'Protected or self target cannot be modified through FRT' USING errcode='42501'; END IF;
 SELECT lower(p.email) INTO v_email FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=p_workspace_id AND wm.active=true
 WHERE p.id=v_admin AND p.status='active' AND p.platform_role='admin_general_manager';
 IF v_email IS NULL OR v_email NOT IN ('asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph') THEN
   RAISE EXCEPTION 'Bootstrap administrator required' USING errcode='42501';
 END IF;
 IF p_role NOT IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR') THEN
   RAISE EXCEPTION 'Unsupported FRT operational permission' USING errcode='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Target must be an active user of this WatchdogWorkspace workspace' USING errcode='42501'; END IF;
 INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
 VALUES(p_user_id,'fund-released-tracker',p_role,true,v_admin)
 ON CONFLICT(user_id,module_id) DO UPDATE SET role=excluded.role,enabled=true,assigned_by=excluded.assigned_by,updated_at=now();
 INSERT INTO public.frt_audit_logs(workspace_id,user_id,action,details)
 VALUES(p_workspace_id,v_admin,'USER_ROLE_CHANGED',jsonb_build_object('targetUserId',p_user_id,'role',p_role,'authority','WatchdogWorkspace'));
 RETURN jsonb_build_object('ok',true);
END;
$function$;

-- Legacy Tool Traceability setter uses its module-admin predicate as the sole entry guard.
CREATE OR REPLACE FUNCTION public.tool_traceability_admin_set_role(
 p_workspace_id uuid,p_user_id uuid,p_role text,p_enabled boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private','pg_temp'
AS $function$
DECLARE v_role text:=upper(trim(p_role));v_previous public.tool_traceability_memberships%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_user_id IS NULL OR p_role IS NULL
  OR v_role NOT IN ('ADMIN','LOGISTICS','USER','VIEWER') OR p_enabled IS NULL
 THEN RAISE EXCEPTION 'invalid role' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.tool_traceability_bootstrap_admins09 b
   WHERE b.workspace_id=p_workspace_id AND b.user_id=p_user_id)
  AND (v_role<>'ADMIN' OR NOT p_enabled)
 THEN RAISE EXCEPTION 'Bootstrap administrator cannot be disabled or demoted' USING ERRCODE='42501';END IF;
 INSERT INTO public.tool_traceability_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
 VALUES(p_workspace_id,p_user_id,v_role,p_enabled,CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,auth.uid())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,enabled=excluded.enabled,
 status=excluded.status,assigned_by=auth.uid();
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'membership',p_user_id::text,auth.uid(),'role_configured_legacy',
  jsonb_build_object('role',v_role,'enabled',p_enabled,'previous_role',v_previous.role));
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'userId',p_user_id,'role',v_role,'enabled',p_enabled);
END;
$function$;

-- Legacy central role-manager mutation entry point, with the same broad target lock.
CREATE OR REPLACE FUNCTION public.apsyntra_role_manage_user_access(
 p_workspace_id uuid,p_target_user_id uuid,p_scope text,p_resource_id text,
 p_role text,p_enabled boolean,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR p_scope NOT IN ('module','board')
    OR p_scope IS NULL OR p_resource_id IS NULL OR p_enabled IS NULL OR p_role IS NULL
    OR EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=p_target_user_id)
    OR public.is_platform_admin(p_target_user_id)
 THEN RAISE EXCEPTION 'Protected, self, or invalid role target' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
  WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id AND m.active AND p.status='active')
 THEN RAISE EXCEPTION 'Target outside active workspace' USING ERRCODE='42501'; END IF;
 IF p_scope<>'module' THEN RAISE EXCEPTION 'Fixture supports module role mutations only'; END IF;
 PERFORM public.wm_admin_set_application_role(p_target_user_id,p_resource_id,p_role,p_enabled);
 RETURN jsonb_build_object('effective',true,'workspaceId',p_workspace_id,'targetUserId',p_target_user_id,
  'scope',p_scope,'resourceId',p_resource_id);
END $$;
