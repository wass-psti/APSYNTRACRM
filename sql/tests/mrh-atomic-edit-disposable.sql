-- Isolated contract stubs: no live credentials or operational rows.
create schema auth;
create role anon nologin;
create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as
$$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table public.work_board_items(id uuid primary key,board_id uuid,group_id uuid,title text,archived_at timestamptz);
create table public.work_board_columns(id uuid primary key,board_id uuid,name text,data_type text,system_key text,visible boolean,column_key text);
create table public.test_values(item_id uuid,column_id uuid,value jsonb,primary key(item_id,column_id));
create table public.test_private(item_id uuid,field_name text,value jsonb,revision bigint,primary key(item_id,field_name));
create function public.work_board_access(uuid,text) returns boolean language sql stable as
$$select auth.uid() is not null and current_setting('test.edit',true)='yes'$$;
create function public.wm_set_board_cell_if_current(p_item_id uuid,p_column_id uuid,p_value jsonb,p_expected_value jsonb)
returns void language plpgsql as $$
declare old_value jsonb;
begin
 if p_column_id is null then
  select to_jsonb(title) into old_value from public.work_board_items where id=p_item_id;
 else
  select value into old_value from public.test_values where item_id=p_item_id and column_id=p_column_id;
 end if;
 if coalesce(old_value,'null'::jsonb) is distinct from coalesce(p_expected_value,'null'::jsonb) then
  raise exception 'stale public' using errcode='PT409';
 end if;
 if p_column_id is null then
  update public.work_board_items set title=p_value#>>'{}' where id=p_item_id;
 else
  insert into public.test_values values(p_item_id,p_column_id,p_value)
  on conflict(item_id,column_id) do update set value=excluded.value;
 end if;
end $$;
create function public.mrh_sourcing_sensitive_write(p_board_id uuid,p_item_id uuid,p_field_name text,p_value jsonb,p_expected_revision bigint)
returns jsonb language plpgsql as $$
declare old_rev bigint;
begin
 if current_setting('test.admin',true) is distinct from 'yes' then
  raise exception 'private denied' using errcode='42501';
 end if;
 select revision into old_rev from public.test_private where item_id=p_item_id and field_name=p_field_name;
 if old_rev is distinct from p_expected_revision then raise exception 'stale private' using errcode='PT409'; end if;
 insert into public.test_private values(p_item_id,p_field_name,p_value,coalesce(old_rev,0)+1)
 on conflict(item_id,field_name) do update set value=excluded.value,revision=excluded.revision;
 return jsonb_build_object('field_name',p_field_name,'revision',coalesce(old_rev,0)+1);
end $$;
insert into public.work_board_items values
 ('11111111-1111-4111-8111-111111111111','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e','Original',null),
 ('22222222-2222-4222-8222-222222222222','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e','Archived',now()),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','21566a87-b287-4a61-b521-bb233956e09e','Other board',null);
insert into public.work_board_columns values
 ('44444444-4444-4444-8444-444444444444','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Quantity','number',null,true,'col_qty'),
 ('55555555-5555-4555-8555-555555555555','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Source Record ID','text',null,true,'custom:legacy');
\i /tmp/mrh-edit.sql
grant select on public.work_board_items,public.test_values,public.test_private to authenticated;
set role authenticated;
select set_config('test.actor','99999999-9999-4999-8999-999999999999',false);
select set_config('test.edit','yes',false);
select set_config('test.admin','yes',false);
do $$
declare
 target uuid:='11111111-1111-4111-8111-111111111111';
 title_change jsonb:='[{"column_id":null,"value":"Changed","expected_value":"Original"}]';
 private_change jsonb:='[{"field_name":"Buying Price","value":10,"expected_revision":null}]';
 receipt jsonb;
begin
 -- Public write followed by denied private write must roll back.
 perform set_config('test.admin','no',true);
 begin
  perform public.mrh_edit_material_atomic(target,title_change,private_change);
  raise exception 'denied private accepted';
 exception when sqlstate '42501' then null; end;
 if (select title from public.work_board_items where work_board_items.id=target) is distinct from 'Original' then
  raise exception 'partial public commit'; end if;
 -- Existing ordinary editor remains eligible without MRH admin.
 receipt:=public.mrh_edit_material_atomic(target,title_change,'[]');
 if receipt->>'public_count'<>'1' then raise exception 'bad public receipt'; end if;
 perform set_config('test.admin','yes',true);
 receipt:=public.mrh_edit_material_atomic(target,
 '[{"column_id":"44444444-4444-4444-8444-444444444444","value":3,"expected_value":null}]',private_change);
 if receipt->>'private_count'<>'1' or
  (select value from public.test_values where item_id=target) is distinct from '3'::jsonb or
  (select revision from public.test_private where item_id=target) is distinct from 1 then raise exception 'mixed write failed'; end if;
 begin
  perform public.mrh_edit_material_atomic(target,
   '[{"column_id":null,"value":"Must roll back","expected_value":"Changed"}]',private_change);
  raise exception 'stale revision accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select title from public.work_board_items where work_board_items.id=target) is distinct from 'Changed' then raise exception 'stale private partial commit'; end if;
 begin
  perform public.mrh_edit_material_atomic(target,title_change,'[]');
  raise exception 'stale public accepted';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":"55555555-5555-4555-8555-555555555555","value":"x","expected_value":null}]','[]');
  raise exception 'legacy sync column accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.mrh_edit_material_atomic('22222222-2222-4222-8222-222222222222',title_change,'[]');
  raise exception 'archived accepted';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.mrh_edit_material_atomic('33333333-3333-4333-8333-333333333333',title_change,'[]');
  raise exception 'foreign board accepted';
 exception when sqlstate 'PT409' then null; end;
 perform set_config('test.edit','no',true);
 begin
  perform public.mrh_edit_material_atomic(target,title_change,'[]');
  raise exception 'denied board accepted';
 exception when sqlstate '42501' then null; end;
 raise notice 'CP_MS_CRM_04A_ATOMIC_EDIT_CONTRACT_PASS';
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.mrh_edit_material_atomic(uuid,jsonb,jsonb)','execute') then raise exception 'anon execute'; end if;
end$$;
