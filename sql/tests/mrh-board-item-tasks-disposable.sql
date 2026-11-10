-- Disposable-only fixture. Never execute this file in production.
-- Uses fake auth.uid() and access test GUCs solely in a new scratch PostgreSQL.
create schema auth;
create schema private;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.workspaces(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.work_boards(id uuid primary key,workspace_id uuid not null references public.workspaces(id));
create table public.work_board_groups(id uuid primary key,board_id uuid not null references public.work_boards(id),title text not null);
create table public.work_board_items(id uuid primary key,board_id uuid not null references public.work_boards(id),group_id uuid not null references public.work_board_groups(id),archived_at timestamptz);
create table public.test_events(id bigserial primary key,board_id uuid,kind text,entity_id text,context jsonb);
create function public.work_board_access(p_board_id uuid,p_required text default 'view')
 returns boolean language sql stable as $$
 select auth.uid() is not null and
 current_setting('test.allowed',true)='true' and
 current_setting('test.workspace',true)='00000000-0000-4000-8000-000000000001'
 and exists (select 1 from public.work_boards b where b.id=p_board_id and
 b.workspace_id=current_setting('test.workspace',true)::uuid) $$;
create function private.mrh_sourcing_scope(p_board_id uuid,p_item_id uuid)
 returns uuid language plpgsql security definer set search_path to '' as $$
declare v_ws uuid;
begin
 if auth.uid() is null or p_board_id<>'617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
 or current_setting('test.module_role',true)<>'ADMIN'
 or not public.work_board_access(p_board_id,'view') then
  raise exception 'Signed item access denied' using errcode='42501';
 end if;
 select b.workspace_id into v_ws from public.work_boards b join public.work_board_items i
  on i.board_id=b.id where b.id=p_board_id and i.id=p_item_id;
 if v_ws is null then raise exception 'Missing item' using errcode='42501'; end if;
 return v_ws;
end $$;
create function public.work_board_log(p_board_id uuid,p_event_type text,p_message text,
 p_entity_type text,p_entity_id text,p_payload jsonb)
 returns void language plpgsql security definer set search_path to '' as $$
begin insert into public.test_events(board_id,kind,entity_id,context)
 values (p_board_id,p_event_type,p_entity_id,p_payload);end $$;
insert into public.workspaces values('00000000-0000-4000-8000-000000000001');
insert into public.profiles values('11111111-1111-4111-8111-111111111111');
insert into public.work_boards values('617c4c0f-e343-4b3b-8456-50d47dcbaf99','00000000-0000-4000-8000-000000000001');
insert into public.work_board_groups values('21566a87-b287-4a61-b521-bb233956e09e','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Main group');
insert into public.work_board_items values('33333333-3333-4333-8333-333333333333','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null);
insert into public.work_board_items values('44444444-4444-4444-8444-444444444444','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null);
insert into public.work_board_items values('55555555-5555-4555-8555-555555555555','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',now());
insert into public.work_board_groups values('99999999-9999-4999-8999-999999999999','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Other group');
insert into public.work_board_items values('66666666-6666-4666-8666-666666666666','617c4c0f-e343-4b3b-8456-50d47dcbaf99','99999999-9999-4999-8999-999999999999',null);
-- Apply the unapproved candidate only here, in a disposable PG instance.
\i /tmp/mrh-task-candidate.sql
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('test.allowed','true',false);
select set_config('test.workspace','00000000-0000-4000-8000-000000000001',false);
select set_config('test.module_role','ADMIN',false);
do $$
declare b uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 i uuid:='33333333-3333-4333-8333-333333333333';
 other uuid:='44444444-4444-4444-8444-444444444444';
 result jsonb; task_id uuid;
begin
 if public.mrh_board_item_tasks_read(b,i)->'tasks'<>'[]'::jsonb then raise exception 'expected empty tasks'; end if;
 result:=public.mrh_board_item_tasks_write(b,i,null,'Check relay','not_started',null);
 task_id:=(result->>'id')::uuid;
 if (result->>'revision')::integer<>1 then raise exception 'create revision incorrect';end if;
 if jsonb_array_length(public.mrh_board_item_tasks_read(b,i)->'tasks')<>1 then raise exception 'persistence read failed';end if;
 result:=public.mrh_board_item_tasks_write(b,i,task_id,'Check relay again','done',1);
 if (result->>'revision')::integer<>2 then raise exception 'update revision incorrect';end if;
 begin
  perform public.mrh_board_item_tasks_write(b,i,task_id,'Stale overwrite','done',1);
  raise exception 'stale CAS incorrectly accepted';
 exception when sqlstate 'PT409' then null;end;
 begin
  perform public.mrh_board_item_tasks_write(b,other,task_id,'Cross-item overwrite','done',2);
  raise exception 'foreign item task incorrectly accepted';
 exception when sqlstate 'PT409' then null;end;
 begin
  perform public.mrh_board_item_tasks_write(b,i,null,'','done',null);
  raise exception 'blank task accepted';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.mrh_board_item_tasks_write(b,i,null,'Bad status','rejected',null);
  raise exception 'bad status accepted';
 exception when sqlstate '22023' then null;end;
 begin
  perform public.mrh_board_item_tasks_read(b,'55555555-5555-4555-8555-555555555555');
  raise exception 'archived item unexpectedly accessible';
 exception when sqlstate '42501' then null;end;
 begin
  perform public.mrh_board_item_tasks_read(b,'66666666-6666-4666-8666-666666666666');
  raise exception 'foreign group unexpectedly accessible';
 exception when sqlstate '42501' then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.mrh_board_item_tasks_read(b,i);
  raise exception 'revoked session unexpectedly accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 perform set_config('test.module_role','VIEWER',true);
 begin
  perform public.mrh_board_item_tasks_read(b,i);
  raise exception 'non-ADMIN read accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('test.module_role','ADMIN',true);
 perform set_config('test.allowed','false',true);
 begin
  perform public.mrh_board_item_tasks_write(b,i,null,'Unauthorized','done',null);
  raise exception 'revoked edit accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('test.allowed','true',true);
 perform set_config('test.workspace','00000000-0000-4000-8000-000000000999',true);
 begin
  perform public.mrh_board_item_tasks_read(b,i);
  raise exception 'foreign workspace accepted';
 exception when sqlstate '42501' then null;end;
 perform set_config('test.workspace','00000000-0000-4000-8000-000000000001',true);
 raise notice 'MRH_TASK_DISPOSABLE_CAS_DENIAL_PASS';
end $$;
reset role;
do $$
begin
 if (select count(*) from public.test_events where kind='sourcing.task_changed')<>2 then
   raise exception 'audit must contain only successful writes';end if;
 if has_function_privilege('anon','public.mrh_board_item_tasks_read(uuid,uuid)','execute') or
    has_function_privilege('anon','public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)','execute') then
   raise exception 'anonymous execute unexpectedly granted';end if;
 if has_table_privilege('authenticated','private.mrh_board_item_tasks','select') or
    has_table_privilege('authenticated','private.mrh_board_item_tasks','insert') then
   raise exception 'direct signed table access granted';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.mrh_board_item_tasks'::regclass) then
   raise exception 'RLS is not fully enabled';end if;
 raise notice 'MRH_TASK_DISPOSABLE_RLS_GRANTS_PASS';
end $$;
