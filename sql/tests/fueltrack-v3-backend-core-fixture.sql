-- Test-only stand-ins for WatchdogWorkspace. Never execute on production.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,display_name text,email text);
insert into public.profiles(id,display_name,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Admin Tester','admin@example.test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','User Tester','user@example.test');
create table public.work_boards(id uuid primary key,workspace_id uuid not null,
 name text not null,description text not null,status text not null,
 updated_at timestamptz not null default now(),updated_by uuid);
create table public.work_board_columns(
 id uuid primary key,board_id uuid not null,system_key text,data_type text,
 config jsonb not null default '{}'::jsonb,position integer not null default 0);
create table public.work_board_events(
 id uuid primary key default pg_catalog.gen_random_uuid(),board_id uuid not null,
 actor_id uuid,event_type text not null,message text not null,
 entity_type text,entity_id text,payload jsonb not null default '{}'::jsonb);
create table public.work_board_groups(
 id uuid primary key,board_id uuid not null,title text not null,position int not null default 0);
create table public.work_board_items(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 board_id uuid not null,group_id uuid not null,
 title text not null,status text not null default 'not_started',
 notes text not null default '',position integer not null default 0,archived_at timestamptz,
 created_by uuid not null,updated_by uuid not null,
 updated_at timestamptz default now()
);
create table public.work_board_item_files(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 board_id uuid not null,item_id uuid not null,
 storage_path text not null unique,file_name text not null,
 mime_type text not null,size_bytes bigint not null,
 created_by uuid not null
);
create schema storage;
create table storage.objects(
 id uuid default pg_catalog.gen_random_uuid() primary key,
 bucket_id text not null,name text not null,owner_id text not null,
 metadata jsonb not null,
 unique(bucket_id,name)
);
create table public.ft3_test_events(event_id text primary key,event_type text not null,
 request_id text not null,created_at timestamptz default now());
create function public.current_workspace_id(p_user_id uuid) returns uuid language sql stable as $$
 select case when p_user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) then
 '11111111-1111-4111-8111-111111111111'::uuid
 when p_user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid then
 '22222222-2222-4222-8222-222222222222'::uuid else null end $$;
create function public.has_module_access(p_module_id text,p_user_id uuid)
 returns boolean language sql stable as $$
 select p_module_id='fueltrack-plus' and p_user_id in
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid) $$;
create function public.module_role_for(p_module_id text,p_user_id uuid)
 returns text language sql stable as $$
 select case when p_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid then 'Admin'
 when p_user_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid) then 'User' else null end $$;
create function public.work_board_access(p_board_id uuid,p_required text)
 returns boolean language sql stable as $$
 select p_board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
 and p_required='view' $$;
create function public.work_board_log(
 p_board_id uuid,p_type text,p_message text,p_entity_type text default null,
 p_entity_id text default null,p_payload jsonb default '{}'::jsonb
) returns void language plpgsql security definer as $$
begin
 insert into public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id,payload)
 values(p_board_id,auth.uid(),p_type,left(coalesce(p_message,''),500),
  p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb));
end; $$;
create function public.append_module_activity(
 p_module_id text,p_event_id text,p_event_type text,p_title text,
 p_message text,p_request_id text,p_payload jsonb)
 returns jsonb language plpgsql security definer as $$
 begin
 if p_module_id<>'fueltrack-plus' then raise exception 'wrong module'; end if;
 insert into public.ft3_test_events(event_id,event_type,request_id)
 values(p_event_id,p_event_type,p_request_id);
 return jsonb_build_object('id',p_event_id);
 end; $$;
insert into public.work_boards(id,workspace_id,name,description,status) values
 ('7af78b3f-67bf-4600-9aa1-9006d19d486e',
 '11111111-1111-4111-8111-111111111111',
 'FuelTrack+ v3','[APSYNTRA:MODULE:fueltrack:v1] native','active');

insert into public.work_board_groups(id,board_id,title,position)
 values('dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee',
  '7af78b3f-67bf-4600-9aa1-9006d19d486e','Main group',0);
create function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text)
returns uuid language plpgsql security definer as $$
declare v uuid;
begin
 if not public.work_board_access(p_board_id,'edit') or
 not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=p_board_id) then
  raise exception 'Board edit denied' using errcode='42501'; end if;
 insert into public.work_board_items(board_id,group_id,title,created_by,updated_by)
 values(p_board_id,p_group_id,p_title,auth.uid(),auth.uid()) returning id into v;
 return v;
end;$$;
create function public.wm_register_board_item_file(
 p_item_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_size_bytes bigint)
returns uuid language plpgsql security definer as $$
declare v uuid; v_board uuid;
begin
 select board_id into v_board from public.work_board_items where id=p_item_id;
 if not public.work_board_access(v_board,'edit') or
 p_storage_path not like v_board::text||'/'||p_item_id::text||'/%' or
 not exists(select 1 from storage.objects
  where bucket_id='work-board-files' and name=p_storage_path and owner_id=auth.uid()::text) then
  raise exception 'Storage permission denied' using errcode='42501'; end if;
 insert into public.work_board_item_files(board_id,item_id,storage_path,
   file_name,mime_type,size_bytes,created_by)
 values(v_board,p_item_id,p_storage_path,p_file_name,p_mime_type,p_size_bytes,auth.uid())
 returning id into v;
 return v;
end;$$;
-- Disposable fixture inspection grants only; never production policy.
grant select,update on public.work_board_items to authenticated;
grant select on public.work_board_item_files to authenticated;
grant select,insert,delete on storage.objects to authenticated;
alter table storage.objects enable row level security;
create policy "wm board files insert" on storage.objects
 for insert to authenticated with check (
  bucket_id='work-board-files' and owner_id=auth.uid()::text
  and case when split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
   and split_part(name,'/',2) ~* '^[0-9a-f-]{36}$'
  then public.work_board_access(split_part(name,'/',1)::uuid,'view')
   and public.work_board_access(split_part(name,'/',1)::uuid,'edit')
   and exists(select 1 from public.work_board_items i
    where i.id=split_part(name,'/',2)::uuid and i.board_id=split_part(name,'/',1)::uuid)
  else false end
 );
create policy "wm board files read" on storage.objects
 for select to authenticated using (
  bucket_id='work-board-files'
  and case when split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
   and split_part(name,'/',2) ~* '^[0-9a-f-]{36}$'
  then public.work_board_access(split_part(name,'/',1)::uuid,'view')
   and exists(select 1 from public.work_board_items i
    where i.id=split_part(name,'/',2)::uuid and i.board_id=split_part(name,'/',1)::uuid)
  else false end
 );
create policy "wm board files delete" on storage.objects
 for delete to authenticated using (
  bucket_id='work-board-files' and owner_id=auth.uid()::text
  and case when split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
   and split_part(name,'/',2) ~* '^[0-9a-f-]{36}$'
  then public.work_board_access(split_part(name,'/',1)::uuid,'view')
   and public.work_board_access(split_part(name,'/',1)::uuid,'edit')
   and exists(select 1 from public.work_board_items i
    where i.id=split_part(name,'/',2)::uuid and i.board_id=split_part(name,'/',1)::uuid)
  else false end
 );
grant usage on schema storage to authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
