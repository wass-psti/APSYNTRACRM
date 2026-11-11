-- NOT APPLIED. Proposed material access-policy change requiring separate
-- production permission approval. Board VIEW would allow commercial read only.
-- Preserve existing private.mrh_sourcing_scope because existing tasks and
-- protected writes depend on its ADMIN scope. Do not overwrite this function.
begin;
create or replace function public.mrh_sourcing_board_viewer_read(
 p_board_id uuid,p_item_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_result jsonb;
begin
 if v_actor is null
    or p_board_id is distinct from '617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
    or p_item_id is null then
   raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 select b.workspace_id into v_workspace
 from public.work_boards b
 join public.work_board_items i on i.board_id=b.id
 join public.work_board_groups g on g.id=i.group_id and g.board_id=b.id
 where b.id=p_board_id and b.name='Material Request Hub'
   and b.status='active' and i.id=p_item_id and i.archived_at is null
   and g.id='21566a87-b287-4a61-b521-bb233956e09e'::uuid
   and g.title='Main group';
 if v_workspace is null
    or not coalesce(public.work_board_access(p_board_id,'view'),false)
    or not exists (
      select 1 from public.workspace_members m
      where m.workspace_id=v_workspace and m.user_id=v_actor and m.active=true
    )
    or not exists (
      select 1 from public.profiles p where p.id=v_actor and p.status='active'
    ) then
   raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 select coalesce(jsonb_object_agg(s.field_name,jsonb_build_object(
   'value',s.value,'revision',s.revision
 )),'{}'::jsonb) into v_result
 from private.mrh_sourcing_sensitive_cells s
 where s.board_id=p_board_id and s.item_id=p_item_id and s.workspace_id=v_workspace;
 return v_result;
end;
$$;
revoke all on function public.mrh_sourcing_board_viewer_read(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.mrh_sourcing_board_viewer_read(uuid,uuid)
 to authenticated;
commit;
