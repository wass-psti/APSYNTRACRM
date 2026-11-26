-- Disposable PostgreSQL fixture matching the relevant AGT key contracts.
\set ON_ERROR_STOP on
create schema agt;
create table agt.workspace(id uuid primary key);
create table agt.department(code text primary key,name text not null,parent_code text references agt.department(code));
create table agt.person(workspace_id uuid references agt.workspace(id),user_id uuid,department_code text not null references agt.department(code),display_name text not null,identity_kind text not null,primary key(workspace_id,user_id));
insert into agt.workspace values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into agt.department values('ops','Operations',null),('eng','Engineering',null);
insert into agt.person values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','ops','Fixture person','crm-user'),
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','eng','Fixture colleague','crm-user'),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000021','eng','Other workspace','crm-user');
create table public.profiles(id uuid primary key,display_name text,status text not null);
create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean not null,primary key(workspace_id,user_id));
insert into public.profiles values
 ('00000000-0000-4000-8000-000000000011','Fixture person','active'),
 ('00000000-0000-4000-8000-000000000012','Fixture colleague','active'),
 ('00000000-0000-4000-8000-000000000021','Other workspace','active'),
 ('00000000-0000-4000-8000-000000000099','Unassigned member','active'),
 ('00000000-0000-4000-8000-000000000098','Inactive member','inactive');
insert into public.workspace_members values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',true),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012',true),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000021',true),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099',true),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000098',true);
\ir ../../supabase/migration-candidates/dda-activity-persistence.sql
do $test$
declare
 w uuid:='00000000-0000-4000-8000-000000000001';
 w2 uuid:='00000000-0000-4000-8000-000000000002';
 actor uuid:='00000000-0000-4000-8000-000000000011';
 colleague uuid:='00000000-0000-4000-8000-000000000012';
 cid uuid:='00000000-0000-4000-8000-000000000101';
 aid uuid:='00000000-0000-4000-8000-000000000102';
 req uuid:='00000000-0000-4000-8000-000000000201';
 data jsonb;
 result jsonb;
begin
 assert (dda.snapshot(w)->>'revision')::int=0;
 assert jsonb_array_length(dda.snapshot(w)->'directory'->'people')=2;
 assert jsonb_array_length(dda.snapshot(w2)->'directory'->'people')=1;
 result:=dda.mutate(w,actor,gen_random_uuid(),0,'save-category',jsonb_build_object('id',cid,'name','Reports'));
 assert (result->>'revision')::int=1;
 data:=jsonb_build_object('id',aid,'personId',actor,'departmentId','ops','date','2026-11-26','title','Daily report','details','Notes','status','Completed','categoryId',cid);
 result:=dda.mutate(w,actor,req,1,'save-activity',data);
 assert (result->>'revision')::int=2 and jsonb_array_length(result->'records')=1;
 result:=dda.mutate(w,actor,req,1,'save-activity',data);
 assert (result->>'replayed')::boolean and (result->>'revision')::int=2;
 assert (select count(*) from dda.activity_event where workspace_id=w)=2;
 begin
   perform dda.mutate(w,actor,req,1,'save-activity',data||'{"title":"Different"}');
   raise exception 'test failed: request reuse accepted';
 exception when others then
   if sqlerrm<>'DDA request ID reused with different input' then raise; end if;
 end;
 begin
   perform dda.mutate(w,colleague,gen_random_uuid(),1,'delete-activity',jsonb_build_object('id',aid));
   raise exception 'test failed: stale revision accepted';
 exception when others then
   if sqlerrm<>'DDA revision conflict' then raise; end if;
 end;
 update agt.person set department_code='eng' where workspace_id=w and user_id=actor;
 result:=dda.mutate(w,colleague,gen_random_uuid(),2,'save-activity',data||'{"title":"Revised"}');
 assert result->'records'->0->>'departmentId'='ops';
 assert result->'records'->0->>'title'='Revised';
 begin
   perform dda.mutate(w,actor,gen_random_uuid(),3,'save-category',jsonb_build_object('id',gen_random_uuid(),'name','reports'));
   raise exception 'test failed: duplicate category accepted';
 exception when unique_violation then null;
 end;
 begin
   perform dda.mutate(w,actor,gen_random_uuid(),3,'save-activity',data||'{"status":"Invalid"}');
   raise exception 'test failed: invalid status accepted';
 exception when check_violation then null;
 end;
 assert (dda.snapshot(w)->>'revision')::int=3;
 assert jsonb_array_length(dda.snapshot(w2)->'records')=0;
 result:=dda.mutate(w,actor,gen_random_uuid(),3,'delete-activity',jsonb_build_object('id',aid));
 assert jsonb_array_length(result->'records')=0;
 assert (select before_record->>'title' from dda.activity_event where workspace_id=w and action='delete-activity')='Revised';
 assert (select count(*) from dda.command_receipt where workspace_id=w)=4;
 result:=dda.mutate(w,actor,req,1,'save-activity',data);
 assert (result->>'replayed')::boolean and (result->>'acknowledgedRevision')::int=2 and (result->>'revision')::int=4;
 assert jsonb_array_length(result->'records')=0;
 raise notice 'PASS: PostgreSQL DDA create, edit, category, historical attribution, duplicate request, stale revision, atomic failure, workspace isolation, deletion history and replay after later changes';
end
$test$;

do $recovery$
declare
 w uuid:='00000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-000000000011';
 req uuid:=gen_random_uuid();
 rejected uuid:=gen_random_uuid();
 invalid uuid:=gen_random_uuid();
 data jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','Recovery category');
 bad jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','Reports');
 result jsonb;
begin
 result:=dda.submit(w,actor,req,4,'save-category',data);
 assert (result->>'acknowledgedRequestId')::uuid=req and (result->>'revision')::int=5;
 result:=dda.submit(w,actor,req,4,'save-category',data);
 assert (result->>'replayed')::boolean and (result->>'revision')::int=5;
 result:=dda.submit(w,actor,rejected,4,'save-category',jsonb_build_object('id',gen_random_uuid(),'name','Stale category'));
 assert (result->>'rejectedRequestId')::uuid=rejected and (result->>'revision')::int=5;
 result:=dda.submit(w,actor,invalid,5,'save-category',bad);
 assert (result->>'rejectedRequestId')::uuid=invalid and (result->>'revision')::int=5;
 assert (select committed_revision is null from dda.command_receipt where workspace_id=w and request_id=invalid);
 -- Make the rejected payload valid, then prove a delayed replay still cannot write.
 perform dda.submit(w,actor,gen_random_uuid(),5,'save-category',jsonb_build_object('id','00000000-0000-4000-8000-000000000101','name','Renamed reports'));
 result:=dda.submit(w,actor,invalid,5,'save-category',bad);
 assert (result->>'replayed')::boolean and (result->>'rejectedRequestId')::uuid=invalid;
 assert (result->>'revision')::int=6;
 assert not exists(select 1 from dda.category where workspace_id=w and id=(bad->>'id')::uuid);
 assert not exists(select 1 from dda.activity_event where workspace_id=w and request_id in (rejected,invalid));
 begin
   perform dda.submit(w,actor,invalid,5,'save-category',bad||'{"name":"Different"}');
   raise exception 'test failed: changed rejected request accepted';
 exception when others then
   if sqlerrm<>'DDA request ID reused with different input' then raise; end if;
 end;
 raise notice 'PASS: terminal accepted/rejected receipts, stable replay, stale revision and validation rejection without delayed writes';
end
$recovery$;
