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

-- Procurement fixture adds only synthetic registry identities and workspace FK.
create table public.workspaces(id uuid primary key);
insert into public.workspaces values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
create function public.has_module_access(text,uuid) returns boolean language sql stable as $$select current_setting('test.order_access',true)='yes'$$;
create table public.order_intake_registry(id uuid,workspace_id uuid,record_kind text,archived boolean);
insert into public.order_intake_registry values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','native',false),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','native',false);
insert into public.work_boards(id,workspace_id,name,status) values ('aa0d8acb-5f0e-4628-b0b4-76ef369b9f51','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Supplier PO Procurement','active');
insert into public.work_board_members values ('aa0d8acb-5f0e-4628-b0b4-76ef369b9f51','11111111-1111-4111-8111-111111111111','viewer');
insert into public.work_board_items(id,board_id,group_id,title,position) values
 ('22222222-2222-4222-8222-222222222222','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e','Original material',0),
 ('22222222-2222-4222-8222-222222222223','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e','Unrelated material',1),
 ('33333333-3333-4333-8333-333333333333','aa0d8acb-5f0e-4628-b0b4-76ef369b9f51',null,'PO source',0);
insert into public.work_board_columns(id,board_id,name,data_type) values ('33333333-3333-4333-8333-333333333334','aa0d8acb-5f0e-4628-b0b4-76ef369b9f51','Supplier Name','text');
insert into public.work_board_item_values(item_id,column_id,value) values ('33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333334','"Supplier A"');
insert into private.mrh_sourcing_sensitive_cells(board_id,workspace_id,item_id,field_name,value) values ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Buying Price','150.75');
\i /tmp/mrh-live-dependencies.sql
-- Exact production viewer catalog body, captured read-only 2026-11-28.
CREATE OR REPLACE FUNCTION public.mrh_sourcing_board_viewer_read(p_board_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
grant usage on schema auth to authenticated;
grant select on public.work_board_events,public.work_board_items to authenticated;
\i /tmp/mrh-procurement.sql
