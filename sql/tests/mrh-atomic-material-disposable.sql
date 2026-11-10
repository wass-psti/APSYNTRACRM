-- Disposable-only application contract stubs, never run in production.
create schema auth;create schema private;
create role anon nologin;create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as
$$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.workspaces(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.work_boards(id uuid primary key,workspace_id uuid not null,
 name text not null,status text not null);
create table public.work_board_groups(id uuid primary key,board_id uuid not null,title text not null,position int not null);
create table public.work_board_items(id uuid primary key default gen_random_uuid(),board_id uuid not null references public.work_boards(id),group_id uuid not null references public.work_board_groups(id),title text not null);
create table public.work_board_columns(id uuid primary key default gen_random_uuid(),board_id uuid not null,
 name text not null,data_type text not null,system_key text,column_key text not null,visible boolean default true);
create table public.work_board_item_values(item_id uuid not null references public.work_board_items(id),column_id uuid not null references public.work_board_columns(id),value jsonb,primary key(item_id,column_id));
create table private.mrh_sourcing_sensitive_cells(item_id uuid not null references public.work_board_items(id),name text,value jsonb);
create table public.work_board_events(id bigserial primary key,kind text,item_id uuid);
create function public.work_board_access(p_board_id uuid,p_required text default 'view') returns boolean language sql stable as $$
select auth.uid() is not null and current_setting('test.access',true)='true' and
 exists(select 1 from public.work_boards where id=p_board_id and status='active') $$;
create function public.material_request_hub_bootstrap(p_workspace_id uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('workspaceId',p_workspace_id,'role',current_setting('test.role',true))$$;
create function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text) returns uuid
 language plpgsql as $$declare result uuid;begin
 if not public.work_board_access(p_board_id,'edit') then raise exception 'edit denied' using errcode='42501';end if;
 insert into public.work_board_items(board_id,group_id,title) values(p_board_id,p_group_id,p_title) returning id into result;
 insert into public.work_board_events(kind,item_id) values('item.created',result);return result;
 end$$;
create function public.wm_set_board_cell_if_current(p_item_id uuid,p_column_id uuid,p_value jsonb,p_expected_value jsonb)
 returns void language plpgsql as $$begin
 if not exists(select 1 from public.work_board_items i where i.id=p_item_id and public.work_board_access(i.board_id,'edit')) then
  raise exception 'edit denied' using errcode='42501';end if;
 if p_value='999'::jsonb then raise exception 'simulated cell error';end if;
 insert into public.work_board_item_values(item_id,column_id,value) values(p_item_id,p_column_id,p_value);
 end$$;
create function public.mrh_sourcing_sensitive_write(p_board_id uuid,p_item_id uuid,p_field_name text,p_value jsonb,p_expected_revision bigint)
 returns jsonb language plpgsql as $$begin
 if not public.work_board_access(p_board_id,'edit') then raise exception 'private denied' using errcode='42501';end if;
 if p_field_name='Buying Price' and p_value='999'::jsonb then raise exception 'simulated private error';end if;
 insert into private.mrh_sourcing_sensitive_cells(item_id,name,value) values(p_item_id,p_field_name,p_value);
 return jsonb_build_object('revision',1);
 end$$;
insert into public.workspaces values('00000000-0000-4000-8000-000000000001');
insert into public.profiles values('11111111-1111-4111-8111-111111111111');
insert into public.work_boards values('617c4c0f-e343-4b3b-8456-50d47dcbaf99','00000000-0000-4000-8000-000000000001','Material Request Hub','active');
insert into public.work_board_groups values('21566a87-b287-4a61-b521-bb233956e09e','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Main group',0);
insert into public.work_board_columns(board_id,name,data_type,system_key,column_key)
select '617c4c0f-e343-4b3b-8456-50d47dcbaf99',name,type,null,
 case when name='Quantity' then 'col_1234' else 'custom:1234' end
from (values ('Quantity','number'),('Source Type','dropdown'),('Brand','text'),
 ('Material description','long_text'),('RFQ Ref No','text'),('Date required','date'),
 ('Leadtime in Weeks','number'),('Source Record ID','text')) c(name,type);
\i /tmp/mrh-atomic.sql
create function public.test_private_count(p_item uuid) returns integer
language sql stable security definer set search_path to '' as
$$ select count(*)::integer from private.mrh_sourcing_sensitive_cells where item_id=p_item $$;
grant select on public.work_board_items, public.work_board_item_values to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('test.role','ADMIN',false);
select set_config('test.access','true',false);
do $$
declare b uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 req uuid:='22222222-2222-4222-8222-222222222222';
 row jsonb; original uuid; again jsonb;
begin
 row:=public.mrh_create_material_atomic(req,'TEST-1',
  '[{"name":"Source Type","value":"Import"},{"name":"Quantity","value":3}]'::jsonb,
  '{"Buying Price":25.50,"Currency":"PHP"}'::jsonb);
 original:=(row->>'item_id')::uuid;
 if row->>'created'<>'true' or (select count(*) from public.work_board_item_values where item_id=original)<>2
 or public.test_private_count(original)<>2 then
 raise exception 'atomic complete write FAILED';end if;
 again:=public.mrh_create_material_atomic(req,'TEST-1',
  '[{"name":"Source Type","value":"Import"},{"name":"Quantity","value":3}]'::jsonb,
  '{"Buying Price":25.50,"Currency":"PHP"}'::jsonb);
 if again->>'created'<>'false' or again->>'item_id'<>original::text
 or (select count(*) from public.work_board_items)<>1 then raise exception 'idempotent replay FAILED';end if;
 begin
 perform public.mrh_create_material_atomic(req,'CHANGED','[]'::jsonb,'{}'::jsonb);
 raise exception 'reused request incorrectly accepted';
 exception when sqlstate 'PT409' then null;end;
 begin
 perform public.mrh_create_material_atomic('33333333-3333-4333-8333-333333333333',
  'TEST-2','[{"name":"Quantity","value":3}]','{"Buying Price":999}');
 raise exception 'protected failure incorrectly committed';
 exception when others then
 if SQLERRM='protected failure incorrectly committed' then raise;end if;end;
 if (select count(*) from public.work_board_items)<>1 then raise exception 'partial item committed';end if;
 begin
 perform public.mrh_create_material_atomic('44444444-4444-4444-8444-444444444444','TEST-3',
 '[{"name":"Requestor","value":"secret"}]'::jsonb,'{}');
 raise exception 'restricted column accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('test.role','VIEWER',true);
 begin
 perform public.mrh_create_material_atomic('55555555-5555-4555-8555-555555555555','TEST-4','[]','{}');
 raise exception 'viewer incorrectly accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('test.role','ADMIN',true);
 perform set_config('test.access','false',true);
 begin
 perform public.mrh_create_material_atomic('66666666-6666-4666-8666-666666666666','TEST-5','[]','{}');
 raise exception 'edit denied incorrectly accepted';
 exception when sqlstate '42501' then null;end;
 raise notice 'MRH_ATOMIC_DISPOSABLE_CREATE_REPLAY_ROLLBACK_AND_DENIAL_PASS';
end $$;
reset role;
do $$
begin
 if has_function_privilege('anon','public.mrh_create_material_atomic(uuid,text,jsonb,jsonb)','execute')
 or has_table_privilege('authenticated','private.mrh_material_create_requests','select')
 or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.mrh_material_create_requests'::regclass)
 then raise exception 'atomic RPC RLS/grants failed';end if;
 raise notice 'MRH_ATOMIC_SECURITY_PASS';
end$$;
