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
 name text not null,description text not null,status text not null);
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
 and p_required in ('view','edit') $$;
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
insert into public.work_boards values
 ('7af78b3f-67bf-4600-9aa1-9006d19d486e',
 '11111111-1111-4111-8111-111111111111',
 'FuelTrack+ v3','[APSYNTRA:MODULE:fueltrack:v1] native','active');
