create or replace function public.material_request_hub_list_requests(p_workspace_id uuid,p_where jsonb default '{}'::jsonb,p_sort jsonb default '{}'::jsonb,p_limit int default 25,p_cursor text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare off int:=greatest(0,coalesce(nullif(p_cursor,'')::int,0)); lim int:=least(greatest(coalesce(p_limit,25),1),100); result jsonb;
begin
  if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if;
  with page_plus_one as (
    select r.*
    from public.material_request_hub_requests r
    where r.workspace_id=p_workspace_id
      and (not (p_where ? 'approvalStatus') or r.status = any(array(select private.material_request_hub_status_value(v#>>'{}') from jsonb_array_elements(p_where->'approvalStatus') v)))
      and (not (p_where ? 'sourceInventory') or r.source_inventory ilike '%'||coalesce(p_where#>>'{sourceInventory,contains}',p_where->>'sourceInventory')||'%')
      and (not (p_where ? 'name') or r.name ilike '%'||(p_where->>'name')||'%')
      and (not (p_where ? 'group') or ((r.status='approved' and (p_where->'group') ? 'release_queue') or (r.status<>'approved' and (p_where->'group') ? 'request_queue')))
    order by r.created_at desc,r.id desc
    offset off limit lim+1
  ), numbered as (
    select p.*, row_number() over (order by p.created_at desc,p.id desc) as rn from page_plus_one p
  ), page as (
    select n.* from numbered n where n.rn<=lim
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(private.material_request_hub_request_json((p.id,p.workspace_id,p.requestor_user_id,p.name,p.status,p.type_of_request,p.source_inventory,p.type_of_invoice,p.requested_qty,p.total_cost,p.remarks,p.rejection_reason,p.charge_to_project_no,p.description,p.unit_price,p.stock_code,p.available_qty,p.part_no_order_code,p.client_po_file,p.approved_by,p.approved_at,p.rejected_by,p.rejected_at,p.released_by,p.released_at,p.version,p.created_at,p.updated_at)::public.material_request_hub_requests) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
    'cursor',case when (select count(*) from numbered)>lim then (off+lim)::text else null end
  ) into result;
  return result;
end $$;
revoke all on function public.material_request_hub_list_requests(uuid,jsonb,jsonb,int,text) from public,anon;
grant execute on function public.material_request_hub_list_requests(uuid,jsonb,jsonb,int,text) to authenticated;;
