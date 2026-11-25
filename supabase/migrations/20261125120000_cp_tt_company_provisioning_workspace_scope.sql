-- TimeTracker target workspace parity and opt-in company-only provisioning.
-- Activation is deliberately separate: verify Auth public signup is disabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE FUNCTION private.tt_role_in_workspace(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE
  WHEN public.apsyntra_crm_explicit_role(p_user,p_workspace) IS NOT NULL
   AND (public.apsyntra_crm_module_role_rank('time-tracker',r.role) IS NULL
    OR public.apsyntra_crm_module_role_rank('time-tracker',r.role)>
       public.apsyntra_crm_role_rank(public.apsyntra_crm_effective_role(p_user,p_workspace)))
  THEN NULL ELSE r.role END
 FROM public.profiles p
 JOIN public.workspace_members m ON m.user_id=p.id AND m.workspace_id=p_workspace AND m.active
 CROSS JOIN LATERAL (SELECT CASE WHEN public.is_platform_admin(p_user)
  THEN 'System Admin' ELSE public.apsyntra_scoped_module_role('time-tracker',p_user,p_workspace) END AS role) r
 WHERE p.id=p_user AND p.status='active'
 AND r.role IN ('System Admin','IT Administrator','HR','Supervisor','Finance','OJT','Employee');
$role$;
REVOKE ALL ON FUNCTION private.tt_role_in_workspace(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Caller authentication, selected workspace and broad directory permission
-- remain unchanged. Only target TimeTracker role/access resolution is scoped.
CREATE OR REPLACE FUNCTION public.list_module_directory(p_module_id text)
RETURNS TABLE(id uuid,email text,display_name text,platform_role text,module_role text,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $directory$
DECLARE caller uuid:=auth.uid();caller_role text;ws uuid;broad boolean:=false;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF NOT public.has_module_access(p_module_id,caller) THEN RAISE EXCEPTION 'module access denied' USING ERRCODE='42501'; END IF;
 ws:=public.current_workspace_id(caller);
 caller_role:=public.module_role_for(p_module_id,caller);
 broad:=CASE p_module_id
  WHEN 'time-tracker' THEN caller_role IN ('System Admin','IT Administrator','HR','Supervisor','Finance')
  WHEN 'fueltrack-plus' THEN caller_role='Admin'
  WHEN 'tradelink' THEN caller_role IN ('General Manager','Sales Supervisor')
  ELSE false END;
 RETURN QUERY
 SELECT p.id,p.email,p.display_name,p.platform_role,
  CASE WHEN p_module_id='time-tracker' THEN private.tt_role_in_workspace(p.id,ws)
   ELSE public.module_role_for(p_module_id,p.id) END,p.status
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=ws AND wm.active=true
 WHERE p.status='active' AND (broad OR p.id=caller)
  AND CASE WHEN p_module_id='time-tracker' THEN private.tt_role_in_workspace(p.id,ws) IS NOT NULL
   ELSE public.has_module_access(p_module_id,p.id) END
 ORDER BY lower(coalesce(p.display_name,p.email)),lower(p.email);
END;
$directory$;

-- Guard source replacements. Preserve signed caller checks, OJT exclusions,
-- locks, revisions, GPS, audit/projection and scheduler activation verbatim.
DO $patch$
DECLARE s text;t text;target text;old text;replacement text;
BEGIN
 FOR target,old,replacement IN VALUES
  ('public.timetracker_employee_department_set(uuid,uuid,text)',
   'public.module_role_for(''time-tracker'',p_target_user_id)',
   'private.tt_role_in_workspace(p_target_user_id,v_ws)'),
  ('public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)',
   'public.has_module_access(''time-tracker'',p.id)',
   'private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL'),
  ('public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)',
   'public.module_role_for(''time-tracker'',p.id)',
   'private.tt_role_in_workspace(p.id,v_ws)'),
  ('private.tt_auto_clockout_employee_eligible(uuid,uuid,uuid)',
   'public.has_module_access(''time-tracker'',p.id)',
   'private.tt_role_in_workspace(p.id,p_workspace) IS NOT NULL'),
  ('private.tt_auto_clockout_employee_eligible(uuid,uuid,uuid)',
   'public.module_role_for(''time-tracker'',p.id)',
   'private.tt_role_in_workspace(p.id,p_workspace)')
 LOOP
  s:=pg_catalog.pg_get_functiondef(target::regprocedure);
  t:=pg_catalog.replace(s,old,replacement);
  IF t=s THEN RAISE EXCEPTION 'TimeTracker workspace scope source drift: %',target USING ERRCODE='55000'; END IF;
  EXECUTE t;
 END LOOP;
END $patch$;

-- No existing identity is backfilled. A private opt-in gate must be enabled
-- only after production Auth configuration is independently verified:
-- disable public signup, anonymous login and external self-provisioning.
-- Auth database triggers cannot reliably distinguish all admin-created users
-- from self-signups. A verified email by itself is NOT admin approval.
CREATE TABLE private.ws02_company_provisioning_config(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 assigned_by uuid REFERENCES public.profiles(id),
 activated_at timestamptz,
 CHECK(NOT enabled OR (assigned_by IS NOT NULL AND activated_at IS NOT NULL))
);
INSERT INTO private.ws02_company_provisioning_config(id,workspace_id)
 VALUES(true,'00000000-0000-4000-8000-000000000001');
CREATE TABLE private.ws02_company_provision_events(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 provisioned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.ws02_company_provisioning_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02_company_provision_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02_company_provisioning_config,private.ws02_company_provision_events
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.ws02_try_company_provision(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $company$
DECLARE cfg private.ws02_company_provisioning_config%ROWTYPE;
 existing private.ws02_company_provision_events%ROWTYPE;
BEGIN
 -- Called under the existing verified profile row lock by the Auth hook.
 SELECT * INTO existing FROM private.ws02_company_provision_events WHERE user_id=p_user_id;
 IF FOUND THEN
  RETURN jsonb_build_object('schemaVersion',1,'workspaceId',existing.workspace_id,
   'idempotent',true,'membershipActive',EXISTS(SELECT 1 FROM public.workspace_members
    WHERE workspace_id=existing.workspace_id AND user_id=p_user_id AND active));
 END IF;
 SELECT * INTO cfg FROM private.ws02_company_provisioning_config WHERE id IS TRUE;
 IF NOT FOUND OR NOT cfg.enabled THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws02_new_account_admissions a
  WHERE a.user_id=p_user_id AND a.created_at>=cfg.activated_at) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM private.ws02_personal_workspaces WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.apsyntra_crm_platform_roles WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.apsyntra_workspace_module_roles WHERE user_id=p_user_id)
  OR EXISTS(SELECT 1 FROM public.module_role_assignments WHERE user_id=p_user_id)
 THEN RAISE EXCEPTION 'Existing membership or assignment requires manual review' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
  WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE
   AND p.status='active' AND p.platform_role='employee')
  OR public.is_platform_admin(p_user_id)
 THEN RAISE EXCEPTION 'Verified non-admin employee required' USING ERRCODE='42501'; END IF;
 IF NOT public.is_platform_admin(cfg.assigned_by)
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
   WHERE m.workspace_id=cfg.workspace_id AND m.user_id=cfg.assigned_by AND m.active AND p.status='active')
 THEN RAISE EXCEPTION 'Company provisioning administrator unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES(cfg.workspace_id,p_user_id,true);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES(cfg.workspace_id,p_user_id,'member');
 INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role,assigned_by)
  VALUES(cfg.workspace_id,p_user_id,'employee',cfg.assigned_by);
 INSERT INTO public.apsyntra_workspace_module_roles(workspace_id,user_id,module_id,role,enabled,assigned_by)
  VALUES(cfg.workspace_id,p_user_id,'time-tracker','Employee',true,cfg.assigned_by);
 INSERT INTO private.ws02_company_provision_events(user_id,workspace_id,assigned_by)
  VALUES(p_user_id,cfg.workspace_id,cfg.assigned_by);
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',cfg.workspace_id,
  'idempotent',false,'membershipActive',true);
END;
$company$;
REVOKE ALL ON FUNCTION private.ws02_try_company_provision(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The existing Auth lifecycle already verifies admission, confirmed email,
-- non-anonymous status and active profile under a row lock. Preserve it.
-- With the gate disabled, new users follow the existing personal flow.
DO $hook$
DECLARE s text;t text;
BEGIN
 s:=pg_catalog.pg_get_functiondef('private.ws02_provision_main_workspace(uuid)'::regprocedure);
 IF position('v_workspace:=gen_random_uuid();' IN s)=0
  OR position('FOR UPDATE' IN s)=0
  OR position('private.ws02_new_account_admissions' IN s)=0 THEN
  RAISE EXCEPTION 'Auth provisioning baseline drift' USING ERRCODE='55000'; END IF;
 t:=pg_catalog.replace(s,' v_workspace:=gen_random_uuid();',
 E' DECLARE company_result jsonb;\n BEGIN\n  company_result:=private.ws02_try_company_provision(p_user_id);\n  IF company_result IS NOT NULL THEN RETURN company_result; END IF;\n END;\n v_workspace:=gen_random_uuid();');
 IF t=s THEN RAISE EXCEPTION 'Company provisioning hook not installed' USING ERRCODE='55000'; END IF;
 EXECUTE t;
END $hook$;
NOTIFY pgrst,'reload schema';
COMMIT;
