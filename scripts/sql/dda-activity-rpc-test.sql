-- Run after dda-activity-persistence-test.sql in the disposable database.
-- Model the existing CRM helper signatures, not a substitute for live GoTrue.
\set ON_ERROR_STOP on
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create schema auth;
create schema private;
create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
create table public.fixture_membership(user_id uuid,workspace_id uuid,active boolean not null,primary key(user_id,workspace_id));
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))
$$;
create function private.wm_board_config_session_active() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid
    and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
$$;
create function public.current_workspace_id(p_user_id uuid) returns uuid language sql stable security definer set search_path='' as $$
  select workspace_id from public.fixture_membership where user_id=p_user_id and active
    and private.wm_board_config_session_active()
  limit 1
$$;
insert into auth.sessions values
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000011',null),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000012',null),
 ('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000021',null),
 ('00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-000000000099',null),
 ('00000000-0000-4000-8000-000000000305','00000000-0000-4000-8000-000000000011',now()-interval '1 minute');
insert into public.fixture_membership values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',true),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',true),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000002',true),
 ('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001',true);
\ir ../../supabase/migration-candidates/dda-activity-rpc.sql

-- Role checks are limited to new DDA objects. Existing role permissions unchanged.
do $acl$
begin
 assert not has_function_privilege('anon','public.dda_snapshot_v1(uuid)','execute');
 assert not has_function_privilege('anon','public.dda_submit_v1(uuid,uuid,bigint,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','dda.submit(uuid,uuid,uuid,bigint,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','dda.snapshot(uuid)','execute');
 assert not has_table_privilege('authenticated','dda.activity','select');
 assert not has_table_privilege('authenticated','dda.command_receipt','insert');
 assert has_function_privilege('authenticated','public.dda_snapshot_v1(uuid)','execute');
 assert has_function_privilege('authenticated','public.dda_submit_v1(uuid,uuid,bigint,text,jsonb)','execute');
end $acl$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
select set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-000000000301',false);
do $signed$
declare
 w uuid:='00000000-0000-4000-8000-000000000001';
 w2 uuid:='00000000-0000-4000-8000-000000000002';
 req uuid:='00000000-0000-4000-8000-000000000401';
 aid uuid:='00000000-0000-4000-8000-000000000402';
 v bigint;
 data jsonb;
 result jsonb;
begin
 result:=public.dda_snapshot_v1(w);
 v:=(result->>'revision')::bigint;
 data:=jsonb_build_object('id',aid,'personId','00000000-0000-4000-8000-000000000011',
   'departmentId','eng','date','2026-11-26','title','Signed RPC activity','details','Fixture','status','Completed','categoryId',null);
 result:=public.dda_submit_v1(w,req,v,'save-activity',data);
 assert (result->>'acknowledgedRequestId')::uuid=req;
 assert result->'records' @> jsonb_build_array(data);
 result:=public.dda_submit_v1(w,req,v,'save-activity',data);
 assert (result->>'replayed')::boolean;
 assert (result->>'revision')::bigint=v+1;
 begin
  perform public.dda_snapshot_v1(w2);
  raise exception 'foreign workspace accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.dda_submit_v1(w2,gen_random_uuid(),0,'save-category',jsonb_build_object('id',gen_random_uuid(),'name','Denied'));
  raise exception 'foreign workspace mutation accepted';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
 perform set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-000000000302',false);
 assert public.dda_snapshot_v1(w)->'records' @> jsonb_build_array(data);
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false);
 perform set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-000000000304',false);
 begin
  perform public.dda_snapshot_v1(w);
  raise exception 'missing workforce identity accepted';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
 perform set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-000000000305',false);
 begin
  perform public.dda_snapshot_v1(w);
  raise exception 'expired session accepted';
 exception when invalid_authorization_specification then null;
 end;
 perform set_config('request.jwt.claim.session_id','00000000-0000-4000-8000-000000000399',false);
 begin
  perform public.dda_submit_v1(w,gen_random_uuid(),v+1,'save-category',jsonb_build_object('id',gen_random_uuid(),'name','Denied'));
  raise exception 'revoked session accepted';
 exception when invalid_authorization_specification then null;
 end;
end $signed$;
reset role;
do $audit$
begin
 assert (select actor_id from dda.activity_event where request_id='00000000-0000-4000-8000-000000000401')='00000000-0000-4000-8000-000000000011'::uuid;
 raise notice 'PASS: signed RPC read/write, cross-account readback, exact replay, actor attribution, workspace/session denial and internal privilege boundaries';
end $audit$;
