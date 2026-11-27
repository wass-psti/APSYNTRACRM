-- Representative disposable schema, exact catalog function bodies, synthetic identity helpers.
create schema auth; create schema private;
create role anon nologin; create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_workspace_id(uuid) returns uuid language sql stable as $$select nullif(current_setting('test.workspace',true),'')::uuid$$;
create function public.apsyntra_crm_explicit_role(uuid,uuid) returns text language sql stable as $$select 'employee'::text$$;
create function public.is_platform_admin(uuid) returns boolean language sql stable as $$select false$$;
create function private.material_request_hub_current_role(uuid) returns text language sql stable as $$select current_setting('test.domain_role',true)$$;
create function public.material_request_hub_bootstrap(p_workspace_id uuid) returns jsonb language sql stable as $$select jsonb_build_object('workspaceId',p_workspace_id,'role',private.material_request_hub_current_role(p_workspace_id))$$;
create table public.profiles(id uuid primary key,status text not null);
create table public.work_boards(id uuid primary key,workspace_id uuid not null,name text,status text,updated_at timestamptz default now(),updated_by uuid);
create table public.work_board_groups(id uuid primary key,board_id uuid,title text,position int);
create table public.work_board_members(board_id uuid,user_id uuid,role text,primary key(board_id,user_id));
create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean,primary key(workspace_id,user_id));
create table public.work_board_items(id uuid primary key default gen_random_uuid(),board_id uuid,group_id uuid,title text,status text,assignee_id uuid,due_date date,notes text,position int,created_by uuid,updated_by uuid,updated_at timestamptz default now(),archived_at timestamptz);
create table public.work_board_columns(id uuid primary key default gen_random_uuid(),board_id uuid,name text,data_type text,system_key text,column_key text,visible boolean,required boolean default false,config jsonb default '{}',position int default 0);
create table public.work_board_item_values(item_id uuid,column_id uuid,value jsonb,updated_by uuid,updated_at timestamptz,primary key(item_id,column_id));
create table public.work_board_events(id bigint generated always as identity,board_id uuid,actor_id uuid,event_type text,message text,entity_type text,entity_id text,payload jsonb);
create table private.mrh_sourcing_sensitive_cells(board_id uuid,workspace_id uuid,item_id uuid,field_name text,value jsonb,revision bigint not null default 1,updated_by uuid,updated_at timestamptz default now(),primary key(board_id,item_id,field_name));
insert into public.profiles values ('11111111-1111-4111-8111-111111111111','active');
insert into public.work_boards(id,workspace_id,name,status) values ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Material Request Hub','active');
insert into public.work_board_groups values ('21566a87-b287-4a61-b521-bb233956e09e','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Main group',0);
insert into public.work_board_members values ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','11111111-1111-4111-8111-111111111111','editor');
insert into public.workspace_members values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true);
insert into public.work_board_columns(id,board_id,name,data_type,column_key,visible,config)
select id::uuid,'617c4c0f-e343-4b3b-8456-50d47dcbaf99',name,type,key,true,config::jsonb from (values
 ('44444444-4444-4444-8444-444444444444','Quantity','number','col_qty','{}'),
 ('55555555-5555-4555-8555-555555555555','Brand','text','custom:brand','{}'),
 ('66666666-6666-4666-8666-666666666666','Source Type','dropdown','custom:source','{"options":["Local","Import"]}'),
 ('77777777-7777-4777-8777-777777777777','Material description','long_text','custom:desc','{}'),
 ('88888888-8888-4888-8888-888888888888','RFQ Ref No','text','custom:rfq','{}'),
 ('99999999-9999-4999-8999-999999999999','Date required','date','custom:date','{}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Leadtime in Weeks','number','custom:lead','{}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Source Record ID','text','custom:legacy','{}')) c(id,name,type,key,config);
\i /tmp/mrh-live-dependencies.sql
\i /tmp/mrh-create.sql
\i /tmp/mrh-edit.sql
-- Grants here serve the synthetic fixture only; do not copy into production.
grant usage on schema auth to authenticated;
grant execute on function public.wm_set_board_item_archived(uuid,boolean) to authenticated;
grant select on public.work_board_items,public.work_board_item_values,public.work_board_events to authenticated;
create function public.test_private_value(p_item uuid,p_name text) returns jsonb language sql stable security definer set search_path to '' as $$select jsonb_build_object('value',value,'revision',revision) from private.mrh_sourcing_sensitive_cells where item_id=p_item and field_name=p_name$$;
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
do $$
declare
 target uuid;
 req uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 b uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 receipt jsonb;
 audit_count bigint;
 original_count bigint;
begin
 receipt:=public.mrh_create_material_atomic(req,'Original','[{"name":"Quantity","value":2},{"name":"Source Type","value":"Local"}]','{"Buying Price":10}');
 target:=(receipt->>'item_id')::uuid;
 if receipt->>'created' is distinct from 'true' then raise exception 'create failed'; end if;
 receipt:=public.mrh_create_material_atomic(req,'Original','[{"name":"Quantity","value":2},{"name":"Source Type","value":"Local"}]','{"Buying Price":10}');
 if receipt->>'created' is distinct from 'false' or receipt->>'item_id' is distinct from target::text then raise exception 'create replay failed'; end if;
 select count(*) into original_count from public.work_board_items;
 if original_count<>1 then raise exception 'duplicate create'; end if;
 select count(*) into audit_count from public.work_board_events;
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Rollback","expected_value":"Original"}]','[{"field_name":"Buying Price","value":11,"expected_revision":99}]');
  raise exception 'stale private accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select title from public.work_board_items where id=target) is distinct from 'Original'
 or (select count(*) from public.work_board_events)<>audit_count then raise exception 'partial rollback or audit leak'; end if;
 receipt:=public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Edited","expected_value":"Original"},{"column_id":"44444444-4444-4444-8444-444444444444","value":3,"expected_value":2}]','[{"field_name":"Buying Price","value":12,"expected_revision":1}]');
 if receipt->>'public_count' is distinct from '2' or receipt->>'private_count' is distinct from '1'
 or public.test_private_value(target,'Buying Price') is distinct from '{"value":12,"revision":2}'::jsonb then raise exception 'mixed edit failed'; end if;
 -- Existing ordinary board editor may edit public data without domain ADMIN.
 perform set_config('test.domain_role','VIEWER',true);
 perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Ordinary","expected_value":"Edited"}]','[]');
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Denied","expected_value":"Ordinary"}]','[{"field_name":"Buying Price","value":13,"expected_revision":2}]');
  raise exception 'protected write accepted';
 exception when sqlstate '42501' then null; end;
 if (select title from public.work_board_items where id=target) is distinct from 'Ordinary' then raise exception 'role rollback failed'; end if;
 perform set_config('test.domain_role','ADMIN',true);
 perform public.wm_set_board_item_archived(target,true);
 if (select archived_at from public.work_board_items where id=target) is null then raise exception 'archive failed'; end if;
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Archived edit","expected_value":"Ordinary"}]','[]');
  raise exception 'archived edit accepted';
 exception when sqlstate 'PT409' then null; end;
 perform public.wm_set_board_item_archived(target,false);
 if (select archived_at from public.work_board_items where id=target) is not null
 or public.test_private_value(target,'Buying Price') is distinct from '{"value":12,"revision":2}'::jsonb
 or (select value from public.work_board_item_values where item_id=target and column_id='44444444-4444-4444-8444-444444444444') is distinct from '3'::jsonb
 or (select count(*) from public.work_board_items)<>1 then raise exception 'restore did not preserve identity/data'; end if;
 -- Foreign workspace cannot edit even when user remains a board member.
 perform set_config('test.workspace','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Foreign","expected_value":"Ordinary"}]','[]');
  raise exception 'foreign workspace accepted';
 exception when sqlstate '42501' then null; end;
 raise notice 'CP_MS_CRM_04A2_REPRESENTATIVE_CREATE_EDIT_ARCHIVE_RESTORE_PASS';
end $$;
reset role;
