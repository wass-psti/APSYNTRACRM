drop policy if exists frt_member_select on public.frt_memberships;
create policy frt_membership_self_or_gm_select on public.frt_memberships
for select to authenticated
using (
  workspace_id in (
    select m.workspace_id from public.frt_memberships m
    where m.user_id = auth.uid() and m.enabled = true and m.status = 'active'
      and (m.user_id = frt_memberships.user_id or m.role = 'GENERAL_MANAGER')
  )
  and (user_id = auth.uid() or private.frt_has_role(workspace_id,'GENERAL_MANAGER'))
);

create or replace function public.frt_companies(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if not private.frt_has_membership(p_workspace_id) then
    raise exception 'Active Fund Released Tracker membership is required';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'display_order',display_order) order by display_order),'[]'::jsonb)
          from public.frt_companies where workspace_id=p_workspace_id);
end $$;;
