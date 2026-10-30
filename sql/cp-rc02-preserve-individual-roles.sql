-- CP-RC02: preserve explicit audited per-user grants when legacy defaults are resynchronized.
-- All three existing default role mappings remain unchanged. Only the conflict overwrite is gated.
CREATE OR REPLACE FUNCTION public.sync_module_roles(p_user_id uuid, p_platform_role text, p_assigned_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then raise exception 'Unsupported Work Management role'; end if;
  insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by) values
    (p_user_id,'time-tracker',case p_platform_role when 'admin_general_manager' then 'System Admin' when 'hr' then 'HR' when 'supervisor' then 'Supervisor' else 'Employee' end,true,p_assigned_by),
    (p_user_id,'fueltrack-plus',case p_platform_role when 'admin_general_manager' then 'Admin' else 'User' end,true,p_assigned_by),
    (p_user_id,'tradelink',case p_platform_role when 'admin_general_manager' then 'General Manager' when 'supervisor' then 'Sales Supervisor' else 'User' end,true,p_assigned_by)
  on conflict (user_id,module_id) do update set
   role=excluded.role,enabled=true,assigned_by=excluded.assigned_by,updated_at=now()
  where not exists (
   select 1 from public.apsyntra_role_change_requests r
   join public.apsyntra_role_change_audit a on a.change_id=r.id and a.event='applied'
   where r.status='applied' and r.operation in ('assignment.assign','assignment.revoke')
     and r.payload->>'scope'='module'
     and r.payload->>'targetUserId'=excluded.user_id::text
     and r.payload->>'resourceId'=excluded.module_id
  );
end;
$function$;
