-- CP-MS-CRM-04A disposable candidate. NOT APPLIED. Do not place in migration history
-- until the exact live dependency bodies and production activation are approved.
-- One transaction, same public CAS and protected field write contracts; no policy changes.
create function public.mrh_edit_material_atomic(p_item_id uuid,p_public_changes jsonb,p_private_changes jsonb)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare
 v_board constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 v_group constant uuid:='21566a87-b287-4a61-b521-bb233956e09e';
 v_item public.work_board_items%rowtype;
 v_col uuid;
 v_change jsonb;
 v_name text;
 v_receipt jsonb;
 v_rev bigint;
 v_seen text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.work_board_access(v_board,'edit') then
  raise exception 'Material edit denied' using errcode='42501';
 end if;
 if p_item_id is null or jsonb_typeof(p_public_changes) is distinct from 'array'
    or jsonb_typeof(p_private_changes) is distinct from 'array' then
  raise exception 'Invalid material changes' using errcode='22023';
 end if;
 if jsonb_array_length(p_public_changes)>8 or jsonb_array_length(p_private_changes)>11
    or jsonb_array_length(p_public_changes)+jsonb_array_length(p_private_changes)=0 then
  raise exception 'Invalid material change count' using errcode='22023';
 end if;
 select * into v_item from public.work_board_items where id=p_item_id and board_id=v_board
  and group_id=v_group and archived_at is null for update;
 if not found then raise exception 'Material unavailable' using errcode='PT409'; end if;
 -- Public-only editors retain existing board edit access. The delegated private
 -- writer retains its own current MRH scope/role check for any protected write.
 for v_change in select value from jsonb_array_elements(p_public_changes) order by value->>'column_id' nulls first loop
  if jsonb_typeof(v_change) is distinct from 'object' or not
    (v_change ? 'column_id' and v_change ? 'value' and v_change ? 'expected_value') then
   raise exception 'Invalid public change' using errcode='22023';
  end if;
  v_col:=(v_change->>'column_id')::uuid;
  v_name:=coalesce(v_col::text,'title');
  if v_name=any(v_seen) then raise exception 'Duplicate public change' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_name);
  if v_col is not null and not exists(select 1 from public.work_board_columns c
   where c.id=v_col and c.board_id=v_board and c.system_key is null and c.visible is true
   and (c.column_key like 'custom:%' or c.column_key like 'custom_%' or
        (c.name='Quantity' and c.column_key like 'col_%'))
   and c.data_type=case c.name
    when 'Source Type' then 'dropdown' when 'Material description' then 'long_text'
    when 'Brand' then 'text' when 'RFQ Ref No' then 'text' when 'Date required' then 'date'
    when 'Leadtime in Weeks' then 'number' when 'Quantity' then 'number' end) then
   raise exception 'Unsupported sourcing column' using errcode='22023';
  end if;
  perform public.wm_set_board_cell_if_current(p_item_id,v_col,v_change->'value',v_change->'expected_value');
 end loop;
 v_seen:=array[]::text[];
 for v_change in select value from jsonb_array_elements(p_private_changes) order by value->>'field_name' loop
  if jsonb_typeof(v_change) is distinct from 'object' or not
   (v_change ? 'field_name' and v_change ? 'value' and v_change ? 'expected_revision') then
   raise exception 'Invalid protected change' using errcode='22023';
  end if;
  v_name:=v_change->>'field_name';
  if v_name is null or v_name=any(v_seen) then
   raise exception 'Invalid or duplicate protected change' using errcode='22023';
  end if;
  v_seen:=array_append(v_seen,v_name);
  v_rev:=(v_change->>'expected_revision')::bigint;
  if v_rev is not null and v_rev<1 then raise exception 'Invalid revision' using errcode='22023'; end if;
  v_receipt:=public.mrh_sourcing_sensitive_write(v_board,p_item_id,v_name,v_change->'value',v_rev);
  if v_receipt->>'field_name' is distinct from v_name or
   (v_receipt->>'revision')::bigint is distinct from coalesce(v_rev,0)+1 then
   raise exception 'Invalid protected receipt' using errcode='PT409';
  end if;
 end loop;
 return jsonb_build_object('item_id',p_item_id,'public_count',jsonb_array_length(p_public_changes),
  'private_count',jsonb_array_length(p_private_changes));
end $$;
revoke all on function public.mrh_edit_material_atomic(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mrh_edit_material_atomic(uuid,jsonb,jsonb) to authenticated;
