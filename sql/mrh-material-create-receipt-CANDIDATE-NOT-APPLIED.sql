-- CP-MS-CRM-04A.3 candidate, NOT APPLIED. Only read existing creation receipts.
-- The private table is intentionally not exposed. Preserve existing create eligibility.
do $$begin
 if to_regclass('private.mrh_material_create_requests') is null or
    to_regprocedure('public.mrh_create_material_atomic(uuid,text,jsonb,jsonb)') is null or
    to_regprocedure('public.mrh_material_create_receipt(uuid)') is not null then
  raise exception 'Unexpected material creation recovery dependency state';
 end if;
end$$;
create function public.mrh_material_create_receipt(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare
 v_actor uuid:=auth.uid();
 v_board constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 v_workspace uuid;
 v_role jsonb;
 v_item uuid;
begin
 if v_actor is null or p_request_id is null then
  raise exception 'Signed material recovery required' using errcode='42501';
 end if;
 -- Same advisory lock as create; a lookup cannot read a half-written receipt.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select workspace_id into v_workspace from public.work_boards
 where id=v_board and name='Material Request Hub' and status='active';
 if v_workspace is null or public.work_board_access(v_board,'edit') is not true then
  raise exception 'Material recovery unavailable' using errcode='42501';
 end if;
 v_role:=public.material_request_hub_bootstrap(v_workspace);
 if v_role->>'workspaceId' is distinct from v_workspace::text or v_role->>'role' is distinct from 'ADMIN' then
  raise exception 'Material recovery permission denied' using errcode='42501';
 end if;
 select item_id into v_item from private.mrh_material_create_requests
 where request_id=p_request_id and actor_id=v_actor and board_id=v_board;
 if v_item is null then
  -- Unresolved does not assert that a delayed request cannot still arrive.
  return jsonb_build_object('request_id',p_request_id,'status','unresolved');
 end if;
 return jsonb_build_object('request_id',p_request_id,'status','committed','item_id',v_item);
end$$;
revoke all on function public.mrh_material_create_receipt(uuid) from public,anon,authenticated;
grant execute on function public.mrh_material_create_receipt(uuid) to authenticated;
