insert into public.material_request_hub_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
select wm.workspace_id, wm.user_id, 'ADMIN', true, 'active', null
from public.workspace_members wm
join public.profiles p on p.id=wm.user_id and p.status='active'
where wm.active=true and lower(p.platform_role) in ('admin_general_manager','admin','administrator','general manager','general_manager')
on conflict (workspace_id,user_id) do nothing;;
