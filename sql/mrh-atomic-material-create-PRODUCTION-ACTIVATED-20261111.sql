-- MRH atomic material contract: deployed to existing Supabase project as
-- migration mrh_material_atomic_create_20261111. DO NOT REAPPLY.
-- Existing board groups, columns, users and RLS were not modified.
begin;
do $mrh_atomic_scope_guard$
begin
 if not exists(select 1 from public.work_boards b
 where b.id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
   and b.name='Material Request Hub' and b.status='active'
   and (select count(*) from public.work_board_groups g where g.board_id=b.id
      and g.id='21566a87-b287-4a61-b521-bb233956e09e'::uuid
      and g.title='Main group' and g.position=0)=1
   and (select count(*) from public.work_board_columns c where c.board_id=b.id)>=8)
 or to_regclass('private.mrh_material_create_requests') is not null or
    to_regprocedure('public.mrh_create_material_atomic(uuid,text,jsonb,jsonb)') is not null
 or to_regprocedure('public.wm_add_board_item(uuid,uuid,text)') is null
 or to_regprocedure('public.wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)') is null
 or to_regprocedure('public.mrh_sourcing_sensitive_write(uuid,uuid,text,jsonb,bigint)') is null then
  raise exception 'MRH original board, RPCs, or migration state invalid; no change applied';
 end if;
end
$mrh_atomic_scope_guard$;

create table private.mrh_material_create_requests (
 request_id uuid primary key,
 board_id uuid not null references public.work_boards(id),
 item_id uuid not null references public.work_board_items(id),
 actor_id uuid not null references public.profiles(id),
 payload_fingerprint text not null,
 created_at timestamptz not null default now()
);
alter table private.mrh_material_create_requests enable row level security;
alter table private.mrh_material_create_requests force row level security;
revoke all on private.mrh_material_create_requests from public,anon,authenticated;

create function public.mrh_create_material_atomic(
 p_request_id uuid,p_part_number text,
 p_public_fields jsonb default '[]'::jsonb,
 p_private_fields jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path to ''
as $$
declare
 v_board constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid;
 v_group constant uuid:='21566a87-b287-4a61-b521-bb233956e09e'::uuid;
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_role jsonb;
 v_id uuid;
 v_existing private.mrh_material_create_requests%rowtype;
 v_hash text;
 v_value jsonb;
 v_name text;
 v_column public.work_board_columns%rowtype;
 v_row jsonb;
 v_allowed_type text;
 v_private jsonb;
 v_seen text[]:=array[]::text[];
begin
 if v_actor is null or p_request_id is null or
    p_part_number is null or length(trim(p_part_number)) not between 1 and 240 or
    p_public_fields is null or jsonb_typeof(p_public_fields)<>'array' or
    jsonb_array_length(p_public_fields)>7 or
    p_private_fields is null or jsonb_typeof(p_private_fields)<>'object' or
    (select count(*) from jsonb_object_keys(p_private_fields))>5 then
   raise exception 'Invalid material creation request' using errcode='22023';
 end if;
 select workspace_id into v_workspace from public.work_boards
 where id=v_board and name='Material Request Hub' and status='active';
 if v_workspace is null or
   not exists(select 1 from public.work_board_groups where
       id=v_group and board_id=v_board and title='Main group' and position=0) or
   not public.work_board_access(v_board,'edit') then
   raise exception 'Material creation unavailable' using errcode='42501';
 end if;
 v_role:=public.material_request_hub_bootstrap(v_workspace);
 if v_role->>'workspaceId' is distinct from v_workspace::text or
    v_role->>'role' is distinct from 'ADMIN' then
   raise exception 'Material creation permission denied' using errcode='42501';
 end if;
 -- Every requested public field must map to one ordinary board column.
 for v_row in select value from jsonb_array_elements(p_public_fields)
 loop
  if jsonb_typeof(v_row)<>'object' or
     (select count(*) from jsonb_object_keys(v_row))<>2 or
     not (v_row?'name' and v_row?'value') then
   raise exception 'Invalid public sourcing field' using errcode='22023';
  end if;
  v_name:=v_row->>'name';
  v_value:=v_row->'value';
  if v_name=any(v_seen) then
   raise exception 'Duplicate public sourcing field' using errcode='22023';
  end if;
  v_seen:=array_append(v_seen,v_name);
  v_allowed_type:=case v_name
    when 'Source Type' then 'dropdown'
    when 'Material description' then 'long_text'
    when 'Brand' then 'text'
    when 'RFQ Ref No' then 'text'
    when 'Date required' then 'date'
    when 'Leadtime in Weeks' then 'number'
    when 'Quantity' then 'number'
    else null end;
  if v_allowed_type is null then
   raise exception 'Unapproved public sourcing field' using errcode='42501';
  end if;
  select * into v_column from public.work_board_columns c
   where c.board_id=v_board and c.name=v_name and
     c.data_type=v_allowed_type and c.system_key is null
     and c.visible is true and
     (c.column_key like 'custom:%' or c.column_key like 'custom_%' or
       (v_name='Quantity' and c.column_key like 'col_%'));
  if v_column.id is null then
   raise exception 'Public sourcing column not activated' using errcode='PT409';
  end if;
  if (v_allowed_type='number' and
        (jsonb_typeof(v_value)<>'number' or
         (v_value::text)::numeric<0 or (v_value::text)::numeric>1000000000000)) or
     (v_allowed_type in ('text','long_text','dropdown','date') and
       (jsonb_typeof(v_value)<>'string' or
        length(v_value#>>'{}')>2000)) or
     (v_name='Source Type' and v_value#>>'{}' not in ('Local','Import')) or
     (v_allowed_type='date' and
       (v_value#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) then
    raise exception 'Invalid public sourcing value' using errcode='22023';
  end if;
 end loop;
 for v_name,v_private in select key,value from jsonb_each(p_private_fields)
 loop
  if v_name not in ('Buying Price','Currency','Shipping Cost',
       'Shipping Cost Currency','Vendor Details') then
   raise exception 'Unapproved protected material field' using errcode='42501';
  end if;
 end loop;
 v_hash:=pg_catalog.md5(trim(p_part_number)||'|'||p_public_fields::text||'|'||p_private_fields::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from private.mrh_material_create_requests where request_id=p_request_id;
 if v_existing.request_id is not null then
  if v_existing.actor_id<>v_actor or v_existing.board_id<>v_board or
     v_existing.payload_fingerprint<>v_hash then
   raise exception 'Creation request identifier reused with different context' using errcode='PT409';
  end if;
  return jsonb_build_object('item_id',v_existing.item_id,'request_id',p_request_id,'created',false);
 end if;
 v_id:=public.wm_add_board_item(v_board,v_group,trim(p_part_number));
 for v_row in select value from jsonb_array_elements(p_public_fields)
 loop
  v_name:=v_row->>'name';v_value:=v_row->'value';
  select * into v_column from public.work_board_columns
   where board_id=v_board and name=v_name;
  perform public.wm_set_board_cell_if_current(v_id,v_column.id,v_value,null);
 end loop;
 for v_name,v_private in select key,value from jsonb_each(p_private_fields)
 loop
  perform public.mrh_sourcing_sensitive_write(v_board,v_id,v_name,v_private,null);
 end loop;
 insert into private.mrh_material_create_requests
  (request_id,board_id,item_id,actor_id,payload_fingerprint)
 values(p_request_id,v_board,v_id,v_actor,v_hash);
 return jsonb_build_object('item_id',v_id,'request_id',p_request_id,'created',true);
end $$;
revoke all on function public.mrh_create_material_atomic(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mrh_create_material_atomic(uuid,text,jsonb,jsonb) to authenticated;
commit;
