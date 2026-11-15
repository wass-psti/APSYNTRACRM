drop policy if exists frt_membership_self_or_gm_select on public.frt_memberships;
create policy frt_membership_self_or_gm_select on public.frt_memberships
for select to authenticated
using (
  private.frt_has_membership(workspace_id)
  and (user_id = auth.uid() or private.frt_has_role(workspace_id,'GENERAL_MANAGER'))
);;
