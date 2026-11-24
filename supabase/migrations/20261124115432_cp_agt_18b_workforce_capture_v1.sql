-- CP-AGT-18B: additive read-only workforce capture, no source writes.
create function private.agt_workforce_capture_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $capture$
declare
 a uuid := auth.uid();
 b constant uuid := '46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 w uuid;
 payload jsonb;
 revision_data jsonb;
begin
 if a is null then raise exception 'Signed TimeTracker access required' using errcode='42501'; end if;
 w := public.timetracker_ot_require_scope(b);
 if public.module_role_for('time-tracker',a) is null
    or public.module_role_for('time-tracker',a) not in ('System Admin','IT Administrator')
 then raise exception 'TimeTracker department management denied' using errcode='42501'; end if;
 with sources as materialized (
  select public.timetracker_team_directory_snapshot(w) team,
         public.timetracker_employee_department_directory_snapshot(b) assignments,
         public.timetracker_ojt_admin_snapshot(b) ojt
 ), users as materialized (
  select u->>'id' id,u->>'displayName' label,u->>'status' status
  from sources s cross join lateral pg_catalog.jsonb_array_elements(s.team->'users') u
 ), effective as materialized (
  select u.id,public.module_role_for('time-tracker',u.id::uuid) role
  from users u where public.has_module_access('time-tracker',u.id::uuid)
 ), catalog as materialized (
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',d.id,'label',d.name,'active',true) order by d.id),'[]'::jsonb) departments
  from private.tt_department_catalog d where d.workspace_id=w
 )
 select pg_catalog.jsonb_build_object(
  'team',pg_catalog.jsonb_build_object('workspaceId',w,'bootstrapVerified',true,'mode','staged_only',
   'users',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',u.id,'displayName',u.label,'status',u.status) order by u.id) from users u),'[]'::jsonb),
   'assignments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('userId',e.id,'moduleId','time-tracker','enabled',true,'role',e.role) order by e.id) from effective e where e.role in ('System Admin','IT Administrator','HR','Supervisor','Finance','OJT','Employee')),'[]'::jsonb)),
  'assignments',s.assignments,'ojt',s.ojt,'departments',c.departments,'catalogRevision',st.revision)
 into payload
 from sources s cross join catalog c join private.tt_department_catalog_state st on st.workspace_id=w
 where s.team->>'workspaceId'=w::text and s.team->>'bootstrapVerified'='true' and s.team->>'mode'='staged_only'
   and s.assignments->>'contract'='tt-department-directory-1' and s.assignments->>'workspaceId'=w::text and s.assignments->>'actorId'=a::text and s.assignments->>'boardId'=b::text
   and s.ojt->>'contract'='tt-ojt-admin-1' and s.ojt->>'workspaceId'=w::text and s.ojt->>'actorId'=a::text and s.ojt->>'boardId'=b::text
   and st.revision>0 and pg_catalog.jsonb_array_length(c.departments)>0
   and exists(select 1 from users u where u.id=a::text);
 if payload is null then raise exception 'Complete TimeTracker source unavailable'; end if;
 revision_data := pg_catalog.jsonb_set(pg_catalog.jsonb_set(payload,'{assignments}',(payload->'assignments')-'actorId'),'{ojt}',(payload->'ojt')-'actorId');
 return pg_catalog.jsonb_build_object('contract','agt-workforce-capture-v1','workspaceId',w,'userId',a,'boardId',b,'capturedAt',pg_catalog.statement_timestamp(),
  'sourceRevision',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(revision_data::text,'UTF8')),'hex'),'data',payload);
end
$capture$;
create function public.agt_workforce_capture_v1()
returns jsonb language sql stable security invoker set search_path = '' as $capture$
 select private.agt_workforce_capture_v1()
$capture$;
revoke all on function private.agt_workforce_capture_v1(),public.agt_workforce_capture_v1() from public,anon,authenticated,service_role;
grant execute on function private.agt_workforce_capture_v1(),public.agt_workforce_capture_v1() to authenticated;
notify pgrst,'reload schema';
;
