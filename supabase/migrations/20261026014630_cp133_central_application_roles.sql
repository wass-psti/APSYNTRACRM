-- CP133: Admin-only central roles for the twelve registered standalone applications.
-- IMPORTANT: deployment to existing Supabase is a distinct, independently approved release action.
-- Grant roles are global to a user and require active membership in the administrator's
-- current workspace. App-specific operational authorization remains in each app's RPC/RLS.
create or replace function public.wm_admin_application_roles()
returns table(user_id uuid,module_id text,role text,enabled boolean,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_admin uuid := auth.uid(); v_workspace uuid;
begin
 if v_admin is null or not public.is_platform_admin(v_admin) then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 v_workspace := public.current_workspace_id(v_admin);
 if v_workspace is null or not exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id=v_workspace and wm.user_id=v_admin and wm.active
 ) then raise exception 'Active administrator workspace required' using errcode='42501'; end if;
 return query select r.user_id,r.module_id,r.role,r.enabled,r.updated_at
 from public.module_role_assignments r
 join public.workspace_members wm on wm.user_id=r.user_id and wm.workspace_id=v_workspace and wm.active
 join public.profiles p on p.id=r.user_id and p.status='active'
 where r.module_id=any(array[
 'tradelink','fueltrans','fund-released-tracker','order-intake','tool-traceability',
 'time-tracker','fueltrack-plus','toolbox-issues','material-request-hub',
 'aps-aims','employee-eval','charter-navigator']::text[])
 order by r.module_id,r.user_id;
end $$;
revoke all on function public.wm_admin_application_roles() from public,anon;
grant execute on function public.wm_admin_application_roles() to authenticated;

create or replace function public.wm_admin_set_application_role(
 p_user_id uuid,p_module_id text,p_role text,p_enabled boolean)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_admin uuid := auth.uid(); v_workspace uuid; v_roles text[]; v_row public.module_role_assignments%rowtype;
begin
 if v_admin is null or not public.is_platform_admin(v_admin) then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then
   raise exception 'Cannot change your own or a protected administrator application role' using errcode='42501';
 end if;
 if p_module_id is null or p_enabled is null or p_role is null then
   raise exception 'Missing application role arguments' using errcode='22023';
 end if;
 -- Preserve Charter Navigator's existing protected administrator RPC and special approval semantics.
 if p_module_id='charter-navigator' then
   raise exception 'Use the existing Charter Navigator role authority' using errcode='22023';
 end if;
 v_roles := case p_module_id
 when 'tradelink' then array['User','Sales Supervisor','General Manager']
 when 'fueltrans' then array['Admin','User','Viewer']
 when 'fund-released-tracker' then array['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_STAFF','VIEWER']
 when 'order-intake' then array['Admin','User','Viewer']
 when 'tool-traceability' then array['ADMIN','LOGISTICS','USER','VIEWER']
 when 'time-tracker' then array['Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator']
 when 'fueltrack-plus' then array['User','Pump Attendant','Admin']
 when 'toolbox-issues' then array['team_leader','secretary','standard','admin','supervisor','employee','viewer']
 when 'material-request-hub' then array['Admin','User','Viewer']
 when 'aps-aims' then array['Administrator','AssetManager','Custodian','Viewer']
 when 'employee-eval' then array['admin','supervisor','employee']
 else null end;
 if v_roles is null or not (p_role=any(v_roles)) then
   raise exception 'Unregistered application or invalid role vocabulary' using errcode='22023';
 end if;
 v_workspace := public.current_workspace_id(v_admin);
 if v_workspace is null or not exists (
  select 1 from public.workspace_members wm where wm.workspace_id=v_workspace and wm.user_id=v_admin and wm.active
 ) or not exists (
  select 1 from public.workspace_members wm join public.profiles p on p.id=wm.user_id
  where wm.workspace_id=v_workspace and wm.user_id=p_user_id and wm.active and p.status='active'
 ) then raise exception 'Both administrator and target must belong to the active workspace' using errcode='42501'; end if;
 insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
 values (p_user_id,p_module_id,p_role,p_enabled,v_admin)
 on conflict(user_id,module_id) do update
 set role=excluded.role,enabled=excluded.enabled,assigned_by=excluded.assigned_by,updated_at=now();
 select * into v_row from public.module_role_assignments where user_id=p_user_id and module_id=p_module_id;
 return jsonb_build_object('user_id',v_row.user_id,'module_id',v_row.module_id,
  'role',v_row.role,'enabled',v_row.enabled,'updated_at',v_row.updated_at);
end $$;
revoke all on function public.wm_admin_set_application_role(uuid,text,text,boolean) from public,anon;
grant execute on function public.wm_admin_set_application_role(uuid,text,text,boolean) to authenticated;
;
