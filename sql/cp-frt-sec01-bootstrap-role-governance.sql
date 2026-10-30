-- CP-FRT-SEC01: centralize all role administration under bootstrap-only WatchdogWorkspace.
-- Preserves existing FRT business roles, financial workflows and existing role assignments.
-- Tightens only the authentication/authorization guard of three existing RPCs.
BEGIN;
CREATE OR REPLACE FUNCTION public.frt_admin_set_role(p_workspace_id uuid, p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
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
   RAISE EXCEPTION 'Unsupported FRT operational permission' USING errcode='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
               WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id AND wm.active AND p.status='active') THEN
   RAISE EXCEPTION 'Target must be an active user of this WatchdogWorkspace workspace' USING errcode='42501';
 END IF;
 IF p_user_id=v_admin AND p_role<>'GENERAL_MANAGER' THEN
   RAISE EXCEPTION 'Bootstrap administrator cannot self-demote through FRT';
 END IF;
 INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
 VALUES(p_user_id,'fund-released-tracker',p_role,true,v_admin)
 ON CONFLICT(user_id,module_id) DO UPDATE SET role=EXCLUDED.role,enabled=true,
 assigned_by=EXCLUDED.assigned_by,updated_at=now();
 INSERT INTO public.frt_audit_logs(workspace_id,user_id,action,details)
 VALUES(p_workspace_id,v_admin,'USER_ROLE_CHANGED',jsonb_build_object('targetUserId',p_user_id,'role',p_role,'authority','WatchdogWorkspace'));
 RETURN jsonb_build_object('ok',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.frt_admin_users(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF NOT private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') THEN
   RAISE EXCEPTION 'Insufficient permissions' USING errcode='42501';
 END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',p.id,'email',p.email,'full_name',p.display_name,
   'role',CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER' ELSE a.role END,
   'department',NULL,'is_active',(p.status='active' AND wm.active AND COALESCE(a.enabled,true)),
   'created_at',p.created_at) ORDER BY COALESCE(p.display_name,p.email)),'[]'::jsonb)
 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
 LEFT JOIN public.module_role_assignments a ON a.user_id=p.id AND a.module_id='fund-released-tracker'
 WHERE wm.workspace_id=p_workspace_id AND wm.active=true
   AND (p.platform_role='admin_general_manager' OR (a.enabled AND a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))));
END;
$function$;

CREATE OR REPLACE FUNCTION public.wm_admin_set_application_role(p_user_id uuid, p_module_id text, p_role text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin uuid:=auth.uid(); v_workspace uuid; v_roles text[]; v_row public.module_role_assignments%rowtype;
begin
 if v_admin is null or not public.apsyntra_role_is_bootstrap() then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then
   raise exception 'Cannot change own or protected admin application role' using errcode='42501';
 end if;
 if p_module_id is null or p_role is null or p_enabled is null then
   raise exception 'Invalid application role request' using errcode='22023';
 end if;
 v_workspace:=public.current_workspace_id(v_admin);
 if v_workspace is null or not exists(
   select 1 from public.workspace_members m where m.workspace_id=v_workspace and m.user_id=v_admin and m.active
 ) or not exists(
   select 1 from public.workspace_members m join public.profiles p on p.id=m.user_id
   where m.workspace_id=v_workspace and m.user_id=p_user_id and m.active and p.status='active'
 ) then raise exception 'Administrator and target require active shared workspace' using errcode='42501'; end if;
 v_roles:=case p_module_id
  when 'tradelink' then array['User','Sales Supervisor','General Manager']
  when 'fueltrans' then array['Admin','User','Viewer']
  when 'fund-released-tracker' then array['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']
  when 'order-intake' then array['Admin','User','Viewer']
  when 'tool-traceability' then array['ADMIN','LOGISTICS','USER','VIEWER']
  when 'time-tracker' then array['Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator']
  when 'fueltrack-plus' then array['User','Pump Attendant','Admin']
  when 'toolbox-issues' then array['team_leader','secretary','standard']
  when 'material-request-hub' then array['ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER']
  when 'aps-aims' then array['Administrator','AssetManager','Custodian','Viewer']
  when 'employee-eval' then array['admin','supervisor','employee']
  else null end;
 if v_roles is null or not (p_role=any(v_roles)) then
   raise exception 'Unregistered application or unsupported operational role' using errcode='22023';
 end if;
 if p_module_id='fund-released-tracker' then
   if p_enabled then
     -- Existing FRT function validates the bootstrap admin, writes real module role and financial audit.
     perform public.frt_admin_set_role(v_workspace,p_user_id,p_role);
   else
     update public.module_role_assignments
        set enabled=false,assigned_by=v_admin,updated_at=now()
      where user_id=p_user_id and module_id=p_module_id;
     insert into public.frt_audit_logs(workspace_id,user_id,action,details)
       values(v_workspace,v_admin,'USER_ROLE_CHANGED',
        jsonb_build_object('targetUserId',p_user_id,'role',p_role,'enabled',false,'authority','WatchdogWorkspace'));
   end if;
 elsif p_module_id='tool-traceability' then
   perform public.tool_traceability_admin_set_role(v_workspace,p_user_id,p_role,p_enabled);
 elsif p_module_id='material-request-hub' then
   perform public.material_request_hub_admin_set_role(v_workspace,p_user_id,p_role,p_enabled);
 elsif p_module_id='toolbox-issues' then
   if not p_enabled then
     -- CP135: central administrator has already passed the active-workspace and target guards.
     -- The separate membership record is authoritative for Toolbox operational access.
     update public.toolbox_issues_memberships m
     set enabled=false,assigned_by=v_admin,updated_at=clock_timestamp()
     where m.workspace_id=v_workspace and m.user_id=p_user_id and m.enabled=true;
     if not found then
       raise exception 'Enabled Toolbox Issues membership required for revocation' using errcode='42501';
     end if;
     insert into public.toolbox_issues_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
     values(v_workspace,'membership',p_user_id::text,v_admin,'role_revoked',
       jsonb_build_object('role',p_role,'enabled',false,'authority','WatchdogWorkspace'));
   else
     perform public.toolbox_issues_admin_set_role(v_workspace,p_user_id,p_role);
   end if;
 end if;
 if p_module_id<>'fund-released-tracker' then
   insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
   values(p_user_id,p_module_id,p_role,p_enabled,v_admin)
   on conflict(user_id,module_id) do update set
    role=excluded.role,enabled=excluded.enabled,assigned_by=excluded.assigned_by,updated_at=now();
 end if;
 select * into v_row from public.module_role_assignments where user_id=p_user_id and module_id=p_module_id;
 return jsonb_build_object('user_id',p_user_id,'module_id',p_module_id,
   'role',v_row.role,'enabled',coalesce(v_row.enabled,false),
   'updated_at',v_row.updated_at,'backendSynchronized',
   p_module_id=any(array['fund-released-tracker','tool-traceability','material-request-hub','toolbox-issues']::text[]));
end $function$;

REVOKE ALL ON FUNCTION public.frt_admin_set_role(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_admin_set_role(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.frt_admin_users(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_admin_users(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wm_admin_set_application_role(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_admin_set_application_role(uuid,text,text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
