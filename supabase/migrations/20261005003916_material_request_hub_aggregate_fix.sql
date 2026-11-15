create or replace function public.material_request_hub_aggregates(p_workspace_id uuid,p_group_by text default null,p_metrics jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if;
  if p_group_by='approvalStatus' then
    return coalesce((
      with grouped as (
        select status, count(*)::bigint as item_count, coalesce(sum(requested_qty),0) as total_qty
        from public.material_request_hub_requests where workspace_id=p_workspace_id group by status
      )
      select jsonb_agg(jsonb_build_object('approvalStatus',private.material_request_hub_status_label(status),'count',item_count,'totalQty',total_qty) order by status) from grouped
    ),'[]'::jsonb);
  elsif p_group_by='sourceInventory' then
    return coalesce((
      with grouped as (
        select source_inventory, count(*)::bigint as item_count
        from public.material_request_hub_requests where workspace_id=p_workspace_id and source_inventory is not null group by source_inventory
      )
      select jsonb_agg(jsonb_build_object('sourceInventory',source_inventory,'count',item_count) order by source_inventory) from grouped
    ),'[]'::jsonb);
  else
    return jsonb_build_array(jsonb_build_object('totalCount',(select count(*) from public.material_request_hub_requests where workspace_id=p_workspace_id),'totalRequestedQty',(select coalesce(sum(requested_qty),0) from public.material_request_hub_requests where workspace_id=p_workspace_id)));
  end if;
end $$;
revoke all on function public.material_request_hub_aggregates(uuid,text,jsonb) from public,anon;
grant execute on function public.material_request_hub_aggregates(uuid,text,jsonb) to authenticated;;
