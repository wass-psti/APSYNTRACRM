-- LOCAL DISPOSABLE PG17 ONLY. Synthetic fixtures and fake JWT settings;
-- never run in production, never claim genuine signed-session acceptance.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable
 as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.work_boards(id uuid primary key,workspace_id uuid,name text,status text);
create table public.work_board_groups(id uuid primary key,board_id uuid,title text);
create table public.work_board_items(id uuid primary key,board_id uuid,group_id uuid,archived_at timestamptz);
create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean);
create table public.profiles(id uuid primary key,status text);
create table private.mrh_sourcing_sensitive_cells(
 board_id uuid,workspace_id uuid,item_id uuid,field_name text,value jsonb,revision bigint);
create function public.work_board_access(p_board_id uuid,p_required text)
returns boolean language sql stable as $$
 select p_board_id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
 and p_required='view'
 and current_setting('test.board_permission',true)='allow'
$$;
insert into public.work_boards values
('617c4c0f-e343-4b3b-8456-50d47dcbaf99',
 '00000000-0000-4000-8000-000000000001','Material Request Hub','active');
insert into public.work_board_groups values
('21566a87-b287-4a61-b521-bb233956e09e',
 '617c4c0f-e343-4b3b-8456-50d47dcbaf99','Main group');
insert into public.work_board_items values
('33333333-3333-4333-8333-333333333333',
 '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
 '21566a87-b287-4a61-b521-bb233956e09e',null),
('44444444-4444-4444-8444-444444444444',
 '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
 '21566a87-b287-4a61-b521-bb233956e09e',now());
insert into public.workspace_members values
('00000000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',true),
('00000000-0000-4000-8000-000000000002',
 '22222222-2222-4222-8222-222222222222',true);
insert into public.profiles values
('11111111-1111-4111-8111-111111111111','active'),
('22222222-2222-4222-8222-222222222222','active');
insert into private.mrh_sourcing_sensitive_cells values
('617c4c0f-e343-4b3b-8456-50d47dcbaf99',
 '00000000-0000-4000-8000-000000000001',
 '33333333-3333-4333-8333-333333333333',
 'Buying Price','123.45',1);
\i /tmp/mrh-board-viewer-candidate.sql

do $tests$
declare
 bid uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 item uuid:='33333333-3333-4333-8333-333333333333';
 result jsonb;
begin
 perform set_config('test.board_permission','allow',true);
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 select public.mrh_sourcing_board_viewer_read(bid,item) into result;
 if result->'Buying Price'->>'value'<>'123.45' then
  raise exception 'authorized board viewer did not receive private item response';
 end if;
 -- Board access denied (even if member).
 perform set_config('test.board_permission','deny',true);
 begin
  perform public.mrh_sourcing_board_viewer_read(bid,item);
  raise exception 'board denial failed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('test.board_permission','allow',true);
 -- Foreign workspace member.
 perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
 begin
  perform public.mrh_sourcing_board_viewer_read(bid,item);
  raise exception 'foreign membership denial failed';
 exception when insufficient_privilege then null;
 end;
 -- Anonymous.
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.mrh_sourcing_board_viewer_read(bid,item);
  raise exception 'anonymous denial failed';
 exception when insufficient_privilege then null;
 end;
 -- Archived item denied to legitimate member.
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 begin
  perform public.mrh_sourcing_board_viewer_read(
   bid,'44444444-4444-4444-8444-444444444444');
  raise exception 'archived item denial failed';
 exception when insufficient_privilege then null;
 end;
 if has_function_privilege('anon','public.mrh_sourcing_board_viewer_read(uuid,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.mrh_sourcing_board_viewer_read(uuid,uuid)','EXECUTE')
    or has_table_privilege('authenticated','private.mrh_sourcing_sensitive_cells','SELECT') then
  raise exception 'RPC/table direct grants failed';
 end if;
 raise notice 'BOARD_VIEWER_DISPOSABLE_PASS';
end;
$tests$;
