-- Correct canonical archive shape before first production activation. Existing admission and grants unchanged.
-- CP-AGT-19A.2: server-derived initial workforce activation.
-- No client-supplied identities, department overrides or actor impersonation.
create or replace function private.agt_activate_workforce_v1(expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 capture jsonb; w uuid; a uuid:=auth.uid(); rev text; r uuid; n integer;
 rows jsonb; existing integer; changed integer;
begin
 -- The existing signed capture is the authorization and source boundary.
 perform pg_catalog.pg_advisory_xact_lock(19019003);
 capture:=private.agt_workforce_capture_v1();
 w:=(capture->>'workspaceId')::uuid; rev:=capture->>'sourceRevision';
 if a is null or capture->>'userId' is distinct from a::text
 or w is distinct from '00000000-0000-4000-8000-000000000001'::uuid
 or rev is distinct from expected_revision then raise exception 'Workforce source changed or scope unavailable'; end if;
 insert into agt.workspace(id) values(w) on conflict do nothing;
 perform 1 from agt.workspace where id=w for update;
 -- Initial activation only: no automatic removal or overwrite of reviewed placements.
 select count(*) into existing from agt.person where workspace_id=w;
 select review_id into r from agt.crm_source_review where workspace_id=w and source_revision=rev order by review_revision desc limit 1;
 if found then
  select count(*) into n from agt.personnel_classification where workspace_id=w and source_review_id=r;
  if n<>existing or n=0 or exists(select 1 from agt.crm_source_review where workspace_id=w and review_revision>1) then raise exception 'Persisted workforce reconciliation required';end if;
  return jsonb_build_object('sourceRevision',rev,'reviewId',r,'personnel',n,'inserted',0);
 end if;
 if existing<>0 or exists(select 1 from agt.crm_source_review where workspace_id=w) then
  raise exception 'Initial activation already completed; subsequent source review required';
 end if;
 with d as (select capture->'data' data),
 users as (select u from d,jsonb_array_elements(data->'team'->'users') u),
 groups as (select g from d,jsonb_array_elements(data->'ojt'->'groups') g),
 employees as (
 select u->>'id' id,u->>'displayName' label,u->>'id' auth_id,null::text shared_id,t->>'role' role
 from users,d,jsonb_array_elements(data->'team'->'assignments') t
 where t->>'userId'=u->>'id' and t->>'moduleId'='time-tracker' and t->>'enabled'='true' and u->>'status'='active'
 and not exists(select 1 from groups where g->>'userId'=u->>'id')
 union all
 select i->>'id',i->>'name',null,g->>'userId','OJT'
 from groups,jsonb_array_elements(g->'interns') i where i->>'active'='true'
 ),
 mapped as (
 select e.*,dept->>'id' dept_id,dept->>'label' dept_label,
 case when e.role='OJT' or e.shared_id is not null or lower(btrim(dept->>'label'))='ojt' then 'OJT_PENDING'
 else case (dept->>'id')||':'||(dept->>'label')
 when 'e4ae6be1-7f36-4ca8-bda3-b60a3297aa3b:HR' then 'HR'
 when 'ab91f709-a0bc-492d-bf38-2c371c88cc45:General Administration' then 'HR'
 when 'de3b104f-0ed9-4374-910a-ee8338660fd0:Engineering' then 'ENG'
 when '34567e1f-430b-4f58-9293-6ee117680674:Finance and Accounting' then 'FIN'
 when 'dab6a6b3-dfdf-432e-97d9-56237e6e9c52:Information Technology' then 'IT'
 when 'f512e366-aa05-46c4-b3ba-21ff6b77e734:Materials and Logistics' then 'ML'
 when '1791260e-8594-4e04-928c-e6e21a9dcf62:Sales and Marketing' then 'SALES'
 end end reporting
 from employees e cross join d
 left join lateral (select j.value as assignment from jsonb_array_elements(d.data->'assignments'->'assignments') as j(value) where j.value->>'userId'=coalesce(e.auth_id,e.shared_id)) aa on true
 left join lateral (select j.value as dept from jsonb_array_elements(d.data->'departments') as j(value) where j.value->>'label'=aa.assignment->>'department' and j.value->>'active'='true') dd on true
 )
 select coalesce(jsonb_agg(to_jsonb(mapped) order by id),'[]'::jsonb) into rows from mapped;
 n:=jsonb_array_length(rows);
 if n=0 or n>10000 or (select count(distinct x->>'id') from jsonb_array_elements(rows)x)<>n
 or exists(select 1 from jsonb_array_elements(rows)x where x->>'reporting' is null or x->>'dept_id' is null or nullif(btrim(x->>'label'),'') is null)
 then raise exception 'Incomplete or conflicting workforce mapping';end if;
 r:=gen_random_uuid();
 insert into agt.department(code,name,parent_code) values
 ('ENG','Engineering',null),('HR','HR and Administration',null),('FIN','Finance and Accounting',null),('IT','Information Technology',null),('ML','Materials and Logistics',null),('SALES','Sales and Marketing',null),('OJT_PENDING','OJT — placement pending',null) on conflict do nothing;
 insert into agt.crm_source_review(workspace_id,review_revision,review_id,source_revision,captured_at,packet)
 select w,1,r,rev,(capture->>'capturedAt')::timestamptz,jsonb_build_object(
 'workspaceId',w,'reviewId',r,'reviewRevision',1,'sourceRevision',rev,'capturedAt',capture->>'capturedAt',
 'capabilities',jsonb_build_object('scope','workforce-only',
 'workforceSource',jsonb_build_object('contract','agt-timetracker-workforce-v1','system','time-tracker','identity','crm-user-uuid','evidenceRef','CP-AGT-17B:user-designation:2026-11-24'),
 'organizationPolicy',jsonb_build_object('contract','agt-organization-v1','evidenceRef','CP-AGT-17B:user-organizational-decisions:2026-11-24','sharedDirectoryAccounts',(select count(*) from jsonb_array_elements(capture->'data'->'ojt'->'groups')g where exists(select 1 from jsonb_array_elements(capture->'data'->'team'->'assignments')t where t->>'userId'=g->>'userId' and t->>'moduleId'='time-tracker' and t->>'enabled'='true'))),
 'progressiveWorkforce',jsonb_build_object('contract','agt-progressive-workforce-v1','evidenceRef','CP-AGT-17B:user-progressive-workforce-designation:2026-11-24')),
 'profiles',(select jsonb_agg(jsonb_build_object('workspaceId',w,'id',u->>'id','label',u->>'displayName','status',u->>'status')) from jsonb_array_elements(capture->'data'->'team'->'users')u),
 'members',(select jsonb_agg(jsonb_build_object('workspaceId',w,'userId',u->>'id','active',true)) from jsonb_array_elements(capture->'data'->'team'->'users')u),
 'employees',(select jsonb_agg(jsonb_build_object('workspaceId',w,'id',x->>'id','authUserId',x->>'auth_id','sharedUserId',x->>'shared_id','label',x->>'label','active',true,'sourceRole',x->>'role','sourceSystem',case when x->>'shared_id' is null then 'time-tracker' else 'time-tracker-ojt' end)) from jsonb_array_elements(rows)x),
 'sourceDepartments',(select coalesce(jsonb_agg(d||jsonb_build_object('workspaceId',w) order by d->>'id'),'[]'::jsonb) from jsonb_array_elements(capture->'data'->'departments')d),
 'assignments',(select jsonb_agg(jsonb_build_object('workspaceId',w,'userId',aa->>'userId','departmentId',d->>'id','active',true)) from jsonb_array_elements(capture->'data'->'assignments'->'assignments')aa join jsonb_array_elements(capture->'data'->'departments')d on d->>'label'=aa->>'department'),
 'departmentLinks',(select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'sourceId',d.dept_id,'target',d.reporting,'confirmed',true,'sourceRevision',rev,'evidenceRef','CP-AGT-17B:user-organizational-decisions:2026-11-24')),'[]'::jsonb) from (select c->>'id' dept_id,m.target reporting from jsonb_array_elements(capture->'data'->'departments')c join (values
 ('e4ae6be1-7f36-4ca8-bda3-b60a3297aa3b','HR','HR'),
 ('ab91f709-a0bc-492d-bf38-2c371c88cc45','General Administration','HR'),
 ('de3b104f-0ed9-4374-910a-ee8338660fd0','Engineering','ENG'),
 ('34567e1f-430b-4f58-9293-6ee117680674','Finance and Accounting','FIN'),
 ('dab6a6b3-dfdf-432e-97d9-56237e6e9c52','Information Technology','IT'),
 ('f512e366-aa05-46c4-b3ba-21ff6b77e734','Materials and Logistics','ML'),
 ('1791260e-8594-4e04-928c-e6e21a9dcf62','Sales and Marketing','SALES'))m(id,label,target) on c->>'id'=m.id and c->>'label'=m.label where c->'active'='true'::jsonb)d),
 'workforce',(select jsonb_agg(jsonb_build_object('workspaceId',w,'employeeId',x->>'id','userId',x->>'auth_id','departmentId',x->>'dept_id','eligibility','eligible','confirmed',true,'sourceRevision',rev,'evidenceRef','CP-AGT-17B:user-progressive-workforce-designation:2026-11-24')) from jsonb_array_elements(rows)x),
 'entities','[]'::jsonb,'customers','[]'::jsonb,'commercial','[]'::jsonb,'commercialMappings','[]'::jsonb,'contacts','[]'::jsonb);
 select agt.bind_personnel_review(w,r,jsonb_agg(jsonb_build_object(
 'personnelId',x->>'id','label',x->>'label','sourceReviewId',r,'sourceRevision',rev,
 'originalDepartmentId',x->>'dept_id','originalDepartment',x->>'dept_label',
 'reportingDepartment',x->>'reporting','identityKind',case when x->>'shared_id' is null then 'crm-user' else 'timetracker-intern' end,
 'sharedLoginId',x->>'shared_id','evaluationParticipation',case when x->>'reporting'='OJT_PENDING' then 'pending' else 'standard' end))) into changed from jsonb_array_elements(rows)x;
 if changed<>n then raise exception 'Workforce binding count mismatch';end if;
 return jsonb_build_object('sourceRevision',rev,'reviewId',r,'personnel',n,'inserted',changed);
end $$;
;
