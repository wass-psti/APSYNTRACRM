-- Disposable PostgreSQL 17 ONLY. No credentials or production data.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
grant usage on schema auth to authenticated,anon;
grant usage on schema public to authenticated,anon;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant execute on function auth.uid() to authenticated,anon;
create table public.workspaces(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.work_boards(id uuid primary key,workspace_id uuid not null references public.workspaces(id),status text not null);
create table public.work_board_items(id uuid primary key,board_id uuid not null references public.work_boards(id));
create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean not null);
create function public.work_board_access(p_board_id uuid,p_required text)
returns boolean language sql stable security definer set search_path to '' as $$
 select auth.uid() is not null
  and current_setting('test.board_permission',true)='yes'
  and exists(select 1 from public.work_boards b where b.id=p_board_id)
$$;
create function private.material_request_hub_current_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path to '' as $$
 select nullif(current_setting('test.mrh_role',true),'')
$$;
create function public.work_board_log(p_board_id uuid,p_event text,
 p_summary text,p_kind text,p_target text,p_details jsonb) returns void
language plpgsql security definer set search_path to '' as $$begin null; end$$;
grant execute on function public.work_board_access(uuid,text) to authenticated,anon;
insert into public.workspaces(id) values ('22222222-2222-4222-8222-222222222222');
insert into public.profiles(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.work_boards(id,workspace_id,status)
values ('617c4c0f-e343-4b3b-8456-50d47dcbaf99',
 '22222222-2222-4222-8222-222222222222','active');
insert into public.work_board_items(id,board_id)
values ('44444444-4444-4444-8444-444444444444',
 '617c4c0f-e343-4b3b-8456-50d47dcbaf99');
insert into public.workspace_members(workspace_id,user_id,active)
values ('22222222-2222-4222-8222-222222222222',
 '11111111-1111-4111-8111-111111111111',true);
