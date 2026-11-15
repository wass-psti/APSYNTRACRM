-- CP134: route supported operational roles through existing app backend authorities.
-- This function replaces the CP133 generic entitlement writer after CP133 installation.
create or replace function public.wm_admin_set_application_role(
 p_user_id uuid,p_module_id text,p_role text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $body$
declare v_admin uuid:=auth.uid(); v_workspace uuid; v_roles text[]; v_row public.module_role_assignments%rowtype;
begin
 if v_admin is null or not public.is_platform_admin(v_admin) then
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
     raise exception 'Toolbox Issues revocation requires a dedicated audited backend operation' using errcode='42501';
   end if;
   perform public.toolbox_issues_admin_set_role(v_workspace,p_user_id,p_role);
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
end $body$;
revoke all on function public.wm_admin_set_application_role(uuid,text,text,boolean) from public,anon;
grant execute on function public.wm_admin_set_application_role(uuid,text,text,boolean) to authenticated;
;
