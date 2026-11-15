create or replace function public.material_tracker_create_notification(
  p_workspace_id uuid,
  p_material_id text,
  p_user_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if not private.material_tracker_can_write(p_workspace_id) then
    raise exception 'Material Tracker notification write denied' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.material_tracker_memberships
    where workspace_id=p_workspace_id and user_id=p_user_id and enabled=true and status='active'
  ) then
    raise exception 'Notification target is not an active Material Tracker member' using errcode='22023';
  end if;
  insert into public.material_tracker_notifications(workspace_id,user_id,material_id,message,created_by)
  values(p_workspace_id,p_user_id,p_material_id,left(coalesce(p_message,''),2000),auth.uid());
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.material_tracker_create_notification(uuid,text,uuid,text) from public, anon;
grant execute on function public.material_tracker_create_notification(uuid,text,uuid,text) to authenticated;;
