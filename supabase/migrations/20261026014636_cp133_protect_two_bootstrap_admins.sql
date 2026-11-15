-- CP133.1: Both original bootstrap administrators are protected at the GLOBAL RBAC boundary.
-- Preserve existing serialized, admin-only access-management behavior and active-admin floor.
create or replace function public.admin_set_user_access(p_user_id uuid,p_platform_role text,p_status text)
returns setof public.profiles
language plpgsql security definer set search_path to 'public'
as $body$
declare target public.profiles%rowtype; active_admins integer;
begin
 perform pg_advisory_xact_lock(42420042);
 if not public.is_platform_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then raise exception 'Unsupported role' using errcode='22023'; end if;
 if p_status not in ('active','disabled') then raise exception 'Unsupported account status' using errcode='22023'; end if;
 select * into target from public.profiles where id=p_user_id for update;
 if not found then raise exception 'User account not found' using errcode='22023'; end if;
 if lower(coalesce(target.email,'')) in
  ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
  and (p_platform_role<>'admin_general_manager' or p_status<>'active') then
  raise exception 'Bootstrap administrators cannot be demoted or disabled' using errcode='42501';
 end if;
 if p_user_id=auth.uid() and (p_platform_role<>target.platform_role or p_status<>target.status) then
  raise exception 'Administrators cannot change their own role or status' using errcode='42501';
 end if;
 if target.platform_role='admin_general_manager' and target.status='active'
    and (p_platform_role<>'admin_general_manager' or p_status<>'active') then
   select count(*) into active_admins from public.profiles p
    where p.platform_role='admin_general_manager' and p.status='active';
   if active_admins<=1 then raise exception 'At least one active administrator required' using errcode='42501'; end if;
 end if;
 update public.profiles set platform_role=p_platform_role,status=p_status where id=p_user_id;
 perform public.sync_module_roles(p_user_id,p_platform_role,auth.uid());
 return query select * from public.profiles where id=p_user_id;
end $body$;
revoke all on function public.admin_set_user_access(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_access(uuid,text,text) to authenticated;
;
