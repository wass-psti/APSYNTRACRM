-- CP-AGT-19A canonical private operational schema. No fixture host or source records.
-- Disposable PostgreSQL reference implementation only.
-- Not a Supabase migration. Do not apply to production.
create schema agt;
set search_path = agt, pg_catalog;

create table workspace (
  id uuid primary key,
  revision bigint not null default 0 check (revision >= 0)
);
create table department (
  code text primary key,
  name text not null,
  parent_code text references department(code)
);
create table person (
  workspace_id uuid references workspace(id),
  user_id uuid,
  department_code text not null references department(code),
  display_name text not null,
  -- Legacy user_id is the stable personnel key. Only crm-user rows are actors.
  identity_kind text not null default 'crm-user' check(identity_kind in ('crm-user','timetracker-intern')),
  shared_login_id uuid,
  check((identity_kind='crm-user' and shared_login_id is null) or
        (identity_kind='timetracker-intern' and shared_login_id is not null and shared_login_id<>user_id)),
  primary key (workspace_id,user_id)
);
create table entity (
  workspace_id uuid references workspace(id),
  id uuid,
  code text not null,
  primary key(workspace_id,id),
  unique(workspace_id,code)
);
create table customer (
  workspace_id uuid references workspace(id),
  id uuid,
  source_system text not null,
  source_id uuid not null,
  label text not null,
  primary key(workspace_id,id),
  unique(workspace_id,source_system,source_id)
);
-- Stable source IDs are mapped by the future CRM host, not invented by forms.
create table commercial_reference (
  workspace_id uuid not null,
  id uuid not null,
  entity_id uuid not null,
  kind text not null check(kind in ('opportunity','project','contract','po','cost_centre')),
  source_system text not null,
  source_id uuid not null,
  customer_id uuid,
  project_id uuid,
  parent_contract_id uuid,
  label text not null,
  active boolean not null default true,
  primary key(workspace_id,id),
  unique(workspace_id,source_system,source_id,kind),
  foreign key(workspace_id,entity_id) references entity(workspace_id,id),
  foreign key(workspace_id,customer_id) references customer(workspace_id,id),
  foreign key(workspace_id,project_id) references commercial_reference(workspace_id,id),
  foreign key(workspace_id,parent_contract_id) references commercial_reference(workspace_id,id)
);
create sequence ticket_number;
create function next_ticket() returns text language plpgsql volatile as $$
declare n text := nextval('agt.ticket_number')::text;
begin return 'APS-' || to_char(clock_timestamp() at time zone 'Asia/Manila','YYYY') || '-' || lpad(n,greatest(6,length(n)),'0'); end $$;
create table ticket (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  number text not null unique default agt.next_ticket(),
  kind text not null check(kind in ('task','request')),
  created_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,id)
);
create table requisition (
  id uuid primary key references ticket(id),
  workspace_id uuid not null,
  allocation_id uuid not null,
  requesting text not null references department(code),
  receiving text not null references department(code),
  title text not null,
  criteria text not null,
  requested_due timestamptz not null,
  committed_due timestamptz,
  status text not null default 'Draft' check(status in ('Draft','Submitted','Clarification Needed','Accepted','Assigned','In Progress','For Requester Acceptance','Closed','Rejected','Withdrawn','Cancelled')),
  unique(workspace_id,id),
  foreign key(workspace_id,id) references ticket(workspace_id,id),
  foreign key(workspace_id,allocation_id) references commercial_reference(workspace_id,id),
  check(requesting<>receiving)
);
create table task (
  id uuid primary key references ticket(id),
  workspace_id uuid not null,
  allocation_id uuid not null,
  parent_id uuid,
  owner_id uuid not null,
  reviewer_id uuid not null,
  original_owner_id uuid not null,
  original_department text not null references department(code),
  title text not null,
  criteria text not null,
  work_type text not null check(work_type in ('Assigned Work','Unplanned Work','Daily Routine')),
  status text not null check(status in ('Proposed','Assigned','In Progress','Blocked','For Review','Closed','Cancelled')),
  due_at timestamptz not null,
  original_due_at timestamptz not null,
  reporting_due_at timestamptz not null,
  accepted_submission_id uuid,
  cancelled_disposition text,
  unique(workspace_id,id),
  foreign key(workspace_id,id) references ticket(workspace_id,id),
  foreign key(workspace_id,allocation_id) references commercial_reference(workspace_id,id),
  foreign key(workspace_id,parent_id) references requisition(workspace_id,id),
  foreign key(workspace_id,owner_id) references person(workspace_id,user_id),
  foreign key(workspace_id,reviewer_id) references person(workspace_id,user_id),
  foreign key(workspace_id,original_owner_id) references person(workspace_id,user_id),
  check(owner_id<>reviewer_id)
);
create table routine_template (
 id uuid not null,
 workspace_id uuid not null references workspace(id),
 version integer not null check(version>0),
 owner_id uuid not null,
 reviewer_id uuid not null,
 allocation_id uuid not null,
 title text not null,
 items jsonb not null,
 primary key(workspace_id,id,version),
 foreign key(workspace_id,owner_id) references person(workspace_id,user_id),
 foreign key(workspace_id,reviewer_id) references person(workspace_id,user_id),
 foreign key(workspace_id,allocation_id) references commercial_reference(workspace_id,id),
 check(owner_id<>reviewer_id)
);
create table routine_schedule (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references workspace(id),
 owner_id uuid not null,
 work_date date not null,
 shift text not null,
 due_at timestamptz not null,
 eligibility text not null check(eligibility in ('Scheduled','Approved Leave','Non-working')),
 unique(workspace_id,owner_id,work_date,shift),
 unique(workspace_id,id),
 foreign key(workspace_id,owner_id) references person(workspace_id,user_id)
);
create table routine_occurrence (
 task_id uuid primary key references task(id),
 workspace_id uuid not null,
 schedule_id uuid not null unique,
 template_id uuid not null,
 template_version integer not null,
 foreign key(workspace_id,task_id) references task(workspace_id,id),
 foreign key(workspace_id,schedule_id) references routine_schedule(workspace_id,id),
 foreign key(workspace_id,template_id,template_version) references routine_template(workspace_id,id,version)
);
create table routine_item (
 task_id uuid references routine_occurrence(task_id),
 position integer not null,
 label text not null,
 outcome text not null default 'Pending' check(outcome in ('Pending','Blocked','Done','Not Applicable')),
 note text not null default '',
 next_action text not null default '',
 na_approved boolean not null default false,
 primary key(task_id,position)
);
create table routine_config_event (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references workspace(id),
 record_id uuid not null,
 actor_id uuid not null,
 action text not null,
 detail jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,actor_id) references person(workspace_id,user_id)
);
create table task_blocker (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid not null,
  resolver_id uuid not null,
  category text not null,
  note text not null,
  followup_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolution text,
  foreign key(workspace_id,task_id) references task(workspace_id,id),
  foreign key(workspace_id,resolver_id) references person(workspace_id,user_id)
);
create unique index task_one_open_blocker on task_blocker(task_id) where resolved_at is null;
create table submission (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references task(id),
  version integer not null check(version>0),
  summary text not null,
  checklist_snapshot jsonb,
  evidence text not null,
  submitted_at timestamptz not null default clock_timestamp(),
  unique(task_id,version),
  unique(task_id,id)
);
alter table task add foreign key(id,accepted_submission_id) references submission(task_id,id);
create table review (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  submission_id uuid not null unique,
  result text not null check(result in ('Accepted','Returned')),
  note text not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  foreign key(task_id,submission_id) references submission(task_id,id)
);
create table event (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  ticket_id uuid not null,
  actor_id uuid not null,
  action text not null,
  detail jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,ticket_id) references ticket(workspace_id,id),
  foreign key(workspace_id,actor_id) references person(workspace_id,user_id)
);
create table command_receipt (
  workspace_id uuid references workspace(id),
  request_id uuid,
  input jsonb not null,
  result jsonb not null,
  primary key(workspace_id,request_id)
);
create index task_parent_idx on task(workspace_id,parent_id);
create index task_owner_idx on task(workspace_id,owner_id,status,due_at);
create index task_due_idx on task(workspace_id,due_at);
create index event_ticket_idx on event(workspace_id,ticket_id,id);

create function required_text(v text) returns text language plpgsql immutable as $$
begin
  if nullif(btrim(v),'') is null then raise exception 'Required field missing'; end if;
  return btrim(v);
end $$;

create function valid_allocation(w uuid,a uuid) returns boolean language sql stable as $$
 select exists(
  select 1 from agt.commercial_reference r
  left join agt.commercial_reference p on p.workspace_id=r.workspace_id and p.id=r.project_id
  left join agt.commercial_reference c on c.workspace_id=r.workspace_id and c.id=r.parent_contract_id
  where r.workspace_id=w and r.id=a and r.active
  and (
    (r.kind='cost_centre' and r.customer_id is null and r.project_id is null and r.parent_contract_id is null)
    or (r.kind='opportunity' and r.customer_id is not null and r.project_id is null and r.parent_contract_id is null)
    or (r.kind in ('po','contract') and p.kind='project' and p.active and p.entity_id=r.entity_id and r.customer_id is not null and p.customer_id=r.customer_id
      and (r.parent_contract_id is null or (r.kind='po' and c.kind='contract' and c.active and c.project_id=p.id and c.entity_id=r.entity_id and c.customer_id=r.customer_id)))
  )
 )
$$;

-- Trusted service boundary for disposable tests. Actor/workspace are supplied by
-- the host, not by browser form fields. No new auth/role/grant policies here.
create function execute_command(w uuid, actor uuid, request_key uuid, expected bigint,
 action text, target uuid, data jsonb) returns jsonb
 language plpgsql set search_path=agt,pg_catalog set timezone='Asia/Manila' as $$
declare
  rev bigint; input jsonb; prior command_receipt%rowtype; result jsonb;
  t task%rowtype; r requisition%rowtype; s submission%rowtype;
  ident uuid; allocation uuid; owner uuid; reviewer uuid; dept text; due timestamptz;
  event_detail jsonb; reporting_due timestamptz; tpl routine_template%rowtype; sched routine_schedule%rowtype; items jsonb; item_pos integer; item_outcome text; config_kind text; parent_ref uuid; parent_before text; child_ref uuid;
begin
  if request_key is null or expected is null or data is null then raise exception 'Invalid command envelope'; end if;
  select revision into rev from workspace where id=w for update;
  if not found then raise exception 'Unknown workspace'; end if;
  if not exists(select 1 from person where workspace_id=w and user_id=actor and identity_kind='crm-user') then raise exception 'Unknown workforce reference'; end if;
  input:=jsonb_build_object('actor',actor,'expected',expected,'action',action,'target',target,'data',data);
  select * into prior from command_receipt where workspace_id=w and request_id=request_key;
  if found then
    if prior.input<>input then raise exception 'Request ID reused with different input'; end if;
    return prior.result;
  end if;
  if rev<>expected then raise exception 'Version conflict'; end if;
  event_detail:=data;
  if action='notification-digest' or action like 'notification:%' then
    ident:=notification_change(w,actor,action,target,data);config_kind:='notification';
  elsif action='assessment' or action like 'assessment:%' then
    ident:=assessment_change(w,actor,action,target,data);config_kind:='assessment';
  elsif action in ('report','report:revise') then
    ident:=report_change(w,actor,action,target,data);config_kind:='report';
  elsif action='labor' or action like 'labor:%' then
    ident:=labor_change(w,actor,action,target,data);config_kind:='labor';
  elsif action in ('routine-template','routine:revise','routine-schedule','routine:reschedule') then
    if action in ('routine-schedule','routine:reschedule') then
      if action='routine:reschedule' then
        select * into sched from routine_schedule where workspace_id=w and id=target;
        if not found then raise exception 'Unknown routine schedule';end if;
        if exists(select 1 from routine_occurrence where schedule_id=target) then raise exception 'Generated schedule cannot be changed';end if;
        perform required_text(data->>'note');
        due:=(data->>'due')::timestamptz;
        if due is null or (due at time zone 'Asia/Manila')::date<sched.work_date then raise exception 'Invalid routine shift deadline';end if;
        update routine_schedule set eligibility=data->>'eligibility',due_at=due where id=target;
        ident:=target;config_kind:='schedule';
        event_detail:=data||jsonb_build_object('previousEligibility',sched.eligibility,'previousDue',sched.due_at);
      else
      owner:=(data->>'owner')::uuid;
      due:=(data->>'due')::timestamptz;
      if due is null or data->>'date' is null or (due at time zone 'Asia/Manila')::date<(data->>'date')::date then raise exception 'Invalid routine shift deadline';end if;
      if exists(select 1 from routine_schedule where workspace_id=w and owner_id=owner and work_date=(data->>'date')::date and shift=lower(required_text(data->>'shift'))) then raise exception 'Routine schedule already exists';end if;
      insert into routine_schedule(workspace_id,owner_id,work_date,shift,due_at,eligibility)
      values(w,owner,(data->>'date')::date,lower(required_text(data->>'shift')),due,data->>'eligibility') returning id into ident;
      config_kind:='schedule';
      end if;
    else
      items:=data->'items';
      if jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid checklist definition';end if;
      if jsonb_array_length(items)<1 or jsonb_array_length(items)>40 or exists(select 1 from jsonb_array_elements(items) x where jsonb_typeof(x)<>'string' or nullif(btrim(x#>>'{}'),'') is null) then raise exception 'Invalid checklist definition';end if;
      if action='routine:revise' then
        select * into tpl from routine_template where workspace_id=w and id=target order by version desc limit 1;
        if not found then raise exception 'Unknown routine template';end if;
        ident:=tpl.id;owner:=tpl.owner_id;reviewer:=tpl.reviewer_id;allocation:=tpl.allocation_id;
      else
        ident:=gen_random_uuid();owner:=(data->>'owner')::uuid;reviewer:=(data->>'reviewer')::uuid;allocation:=(data->>'allocation')::uuid;
      end if;
      if not valid_allocation(w,allocation) or not exists(select 1 from commercial_reference where workspace_id=w and id=allocation and kind='cost_centre') then raise exception 'Routine requires internal cost centre';end if;
      insert into routine_template(workspace_id,id,version,owner_id,reviewer_id,allocation_id,title,items)
      values(w,ident,coalesce(tpl.version,0)+1,owner,reviewer,allocation,required_text(data->>'title'),items);
      config_kind:='template';
    end if;
  elsif action='routine:generate' then
    select * into sched from routine_schedule where workspace_id=w and id=target;
    if not found then raise exception 'Unknown routine schedule';end if;
    if sched.eligibility<>'Scheduled' then raise exception 'Routine not eligible';end if;
    if exists(select 1 from routine_occurrence where schedule_id=sched.id) then raise exception 'Routine already generated';end if;
    select * into tpl from routine_template where workspace_id=w and id=(data->>'template')::uuid and owner_id=sched.owner_id order by version desc limit 1;
    if not found then raise exception 'Template does not match scheduled employee';end if;
    if not valid_allocation(w,tpl.allocation_id) then raise exception 'Invalid commercial allocation';end if;
    select department_code into dept from person where workspace_id=w and user_id=sched.owner_id;
    insert into ticket(workspace_id,kind) values(w,'task') returning id into ident;
    insert into task(id,workspace_id,allocation_id,owner_id,reviewer_id,original_owner_id,original_department,title,criteria,work_type,status,due_at,original_due_at,reporting_due_at)
    values(ident,w,tpl.allocation_id,tpl.owner_id,tpl.reviewer_id,tpl.owner_id,dept,tpl.title||' · '||sched.work_date||' · '||sched.shift,'Complete applicable checklist items and submit shift summary.','Daily Routine','Assigned',sched.due_at,sched.due_at,sched.due_at);
    insert into routine_occurrence values(ident,w,sched.id,tpl.id,tpl.version);
    insert into routine_item(task_id,position,label) select ident,n::integer,item from jsonb_array_elements_text(tpl.items) with ordinality as x(item,n);
    event_detail:=data||jsonb_build_object('schedule',sched.id,'templateVersion',tpl.version);
  elsif action in ('task','request') then
    allocation:=(data->>'allocation')::uuid;
    if not valid_allocation(w,allocation) then raise exception 'Invalid commercial allocation'; end if;
    due:=(data->>'due')::timestamptz;
    if due is null then raise exception 'Deadline required'; end if;
    if action='task' then
      if data->>'type'='Daily Routine' then raise exception 'Generate routine from schedule';end if;
      owner:=(data->>'owner')::uuid; reviewer:=(data->>'reviewer')::uuid;
      select department_code into dept from person where workspace_id=w and user_id=owner;
      if not found then raise exception 'Unknown owner'; end if;
      if data->>'type'='Assigned Work' and due<clock_timestamp() then raise exception 'Deadline in past'; end if;
      if nullif(data->>'parent','') is not null then
        select * into r from requisition where workspace_id=w and id=(data->>'parent')::uuid;
        if not found or r.status not in ('Accepted','Assigned','In Progress') or r.allocation_id<>allocation or r.receiving<>dept then raise exception 'Invalid parent requisition'; end if;
      end if;
      parent_ref:=r.id;parent_before:=r.status;
      insert into ticket(workspace_id,kind) values(w,'task') returning id into ident;
      insert into task(id,workspace_id,allocation_id,parent_id,owner_id,reviewer_id,original_owner_id,original_department,title,criteria,work_type,status,due_at,original_due_at,reporting_due_at)
      values(ident,w,allocation,nullif(data->>'parent','')::uuid,owner,reviewer,owner,dept,required_text(data->>'title'),required_text(data->>'criteria'),data->>'type',case when data->>'type'='Unplanned Work' then 'Proposed' else 'Assigned' end,due,due,due);
      if r.id is not null and r.status='Accepted' then update requisition set status='Assigned' where id=r.id; end if;
    else
      insert into ticket(workspace_id,kind) values(w,'request') returning id into ident;
      insert into requisition(id,workspace_id,allocation_id,requesting,receiving,title,criteria,requested_due)
      values(ident,w,allocation,data->>'requesting',data->>'receiving',required_text(data->>'title'),required_text(data->>'criteria'),due);
    end if;
  elsif action like 'task:%' then
    select * into t from task where workspace_id=w and id=target;
    if not found then raise exception 'Unknown task'; end if;
    ident:=t.id;parent_ref:=t.parent_id;
    select status into parent_before from requisition where id=parent_ref;
    if action='task:confirm' and t.status='Proposed' then update task set status='Assigned' where id=ident;
    elsif action='task:start' and t.status='Assigned' then update task set status='In Progress' where id=ident;
    elsif action='task:update' and t.status in ('Assigned','In Progress','Blocked') then
      perform required_text(data->>'note');
    elsif action='task:block' and t.status in ('Assigned','In Progress') then
      due:=(data->>'followup')::timestamptz;
      if due is null then raise exception 'Follow-up required';end if;
      insert into task_blocker(workspace_id,task_id,resolver_id,category,note,followup_at)
      values(w,ident,(data->>'resolver')::uuid,required_text(data->>'category'),required_text(data->>'note'),due);
      update task set status='Blocked' where id=ident;
    elsif action='task:resume' and t.status='Blocked' then
      update task_blocker set resolved_at=clock_timestamp(),resolution=required_text(data->>'note') where task_id=ident and resolved_at is null;
      if not found then raise exception 'Active blocker missing';end if;
      update task set status='In Progress' where id=ident;
    elsif action='task:extend' and t.status in ('Assigned','In Progress','Blocked','For Review') then
      perform required_text(data->>'note');
      due:=(data->>'due')::timestamptz;
      if due is null or due<=t.due_at then raise exception 'New deadline must be later';end if;
      reporting_due:=t.reporting_due_at;
      -- Preserve the existing conservative local reporting rule: no retroactive credit.
      if clock_timestamp()<t.due_at and clock_timestamp()<t.reporting_due_at
         and not exists(select 1 from submission where task_id=ident) then reporting_due:=due;end if;
      update task set due_at=due,reporting_due_at=reporting_due where id=ident;
      event_detail:=data||jsonb_build_object('previousDue',t.due_at,'previousReportingDue',t.reporting_due_at,'reportingDue',reporting_due);
    elsif action='task:transfer' and t.status in ('Assigned','In Progress','Blocked') then
      if t.work_type='Daily Routine' then raise exception 'Routine occurrence belongs to scheduled employee';end if;
      perform required_text(data->>'note');
      owner:=(data->>'owner')::uuid;reviewer:=(data->>'reviewer')::uuid;
      select department_code into dept from person where workspace_id=w and user_id=owner;
      if not found then raise exception 'Unknown owner';end if;
      if owner=t.owner_id then raise exception 'Choose a different owner';end if;
      if t.parent_id is not null and not exists(select 1 from requisition where id=t.parent_id and receiving=dept) then raise exception 'Transfer must match requisition receiving department';end if;
      update task set owner_id=owner,reviewer_id=reviewer where id=ident;
      event_detail:=data||jsonb_build_object('previousOwner',t.owner_id,'previousReviewer',t.reviewer_id,'originalOwner',t.original_owner_id,'originalDepartment',t.original_department);
    elsif action='task:cancel-na' and t.work_type='Daily Routine' and t.status in ('Assigned','In Progress','Blocked') then
      perform required_text(data->>'note');
      if exists(select 1 from routine_item i where i.task_id=ident and not (i.outcome='Not Applicable' and i.na_approved)) then raise exception 'All checklist items must be approved N/A';end if;
      update task_blocker set resolved_at=clock_timestamp(),resolution='Routine cancelled: '||(data->>'note') where task_id=ident and resolved_at is null;
      update task set status='Cancelled',accepted_submission_id=null where id=ident;
    elsif action='task:cancel' and t.status in ('Proposed','Assigned','In Progress','Blocked','For Review') then
      perform required_text(data->>'note');
      update task_blocker set resolved_at=clock_timestamp(),resolution='Task cancelled: '||(data->>'note') where task_id=ident and resolved_at is null;
      update task set status='Cancelled',accepted_submission_id=null where id=ident;
    elsif action='task:checklist' and t.status in ('Assigned','In Progress','Blocked') and t.work_type='Daily Routine' then
      item_pos:=(data->>'item')::integer;item_outcome:=data->>'outcome';
      if item_outcome is null or item_outcome not in ('Pending','Blocked','Done','Not Applicable') then raise exception 'Invalid checklist outcome';end if;
      if item_outcome in ('Pending','Blocked') then perform required_text(data->>'nextAction');end if;
      update routine_item i set outcome=item_outcome,note=required_text(data->>'note'),next_action=coalesce(data->>'nextAction',''),na_approved=false where i.task_id=ident and i.position=item_pos;
      if not found then raise exception 'Unknown checklist item';end if;
    elsif action='task:na' and t.status in ('Assigned','In Progress','Blocked') and t.work_type='Daily Routine' then
      perform required_text(data->>'note');
      update routine_item set na_approved=true where task_id=ident and position=(data->>'item')::integer and outcome='Not Applicable';
      if not found then raise exception 'Choose a not-applicable item';end if;
    elsif action='task:submit' and t.status in ('Assigned','In Progress') then
      if data ? 'attachments' and jsonb_typeof(data->'attachments') is distinct from 'array' then raise exception 'Invalid attachment selection';end if;
      if t.work_type='Daily Routine' and (exists(select 1 from routine_item i where i.task_id=ident and not (i.outcome='Done' or (i.outcome='Not Applicable' and i.na_approved))) or not exists(select 1 from routine_item i where i.task_id=ident and i.outcome='Done')) then raise exception 'Routine checklist not ready';end if;
      insert into submission(task_id,version,summary,evidence,checklist_snapshot)
      values(ident,(select coalesce(max(version),0)+1 from submission where task_id=ident),required_text(data->>'note'),case when jsonb_typeof(data->'attachments')='array' and jsonb_array_length(data->'attachments')>0 then coalesce(nullif(btrim(data->>'evidence'),''),'Supporting files attached.') else required_text(data->>'evidence') end,(select jsonb_agg(to_jsonb(i) order by i.position) from routine_item i where i.task_id=ident)) returning * into s;
      if data ? 'attachments' then perform evidence_link(w,ident,actor,s.id,data->'attachments');end if;
      update task set status='For Review' where id=ident;
    elsif action in ('task:accept','task:return') and t.status='For Review' then
      select * into s from submission where task_id=ident order by version desc limit 1;
      if not found or s.id is distinct from (data->>'submission')::uuid then raise exception 'Submission version mismatch'; end if;
      insert into review(task_id,submission_id,result,note) values(ident,s.id,case when action='task:accept' then 'Accepted' else 'Returned' end,case when action='task:return' then required_text(data->>'note') else coalesce(data->>'note','') end);
      update task set status=case when action='task:accept' then 'Closed' else 'In Progress' end,
       accepted_submission_id=case when action='task:accept' then s.id else null end where id=ident;
    elsif action='task:reopen' and t.status='Closed' then
      if parent_before='Cancelled' then raise exception 'Cancelled requisition cannot be reopened by child';end if;
      perform required_text(data->>'note');
      update task set status='In Progress',accepted_submission_id=null where id=ident;
      update requisition set status='In Progress' where id=t.parent_id and status in ('Closed','For Requester Acceptance');
    else raise exception 'Unsupported task transition'; end if;
    if action in ('task:start','task:submit','task:block','task:resume','task:update') then update requisition set status='In Progress' where id=t.parent_id and status='Assigned'; end if;
  elsif action like 'request:%' then
    select * into r from requisition where workspace_id=w and id=target;
    if not found then raise exception 'Unknown requisition'; end if;
    ident:=r.id;
    if action='request:submit' and r.status='Draft' then update requisition set status='Submitted' where id=ident;
    elsif action='request:clarify' and r.status='Submitted' then
      perform required_text(data->>'note');
      update requisition set status='Clarification Needed' where id=ident;
    elsif action='request:resubmit' and r.status='Clarification Needed' then
      perform required_text(data->>'note');
      update requisition set status='Submitted',criteria=required_text(data->>'criteria') where id=ident;
      event_detail:=data||jsonb_build_object('previousCriteria',r.criteria);
    elsif action='request:reject' and r.status in ('Submitted','Clarification Needed') then
      perform required_text(data->>'note');update requisition set status='Rejected' where id=ident;
    elsif action='request:withdraw' and r.status in ('Draft','Submitted','Clarification Needed') then
      perform required_text(data->>'note');update requisition set status='Withdrawn' where id=ident;

    elsif action='request:accept' and r.status='Submitted' then
      due:=(data->>'due')::timestamptz;
      if due is null then raise exception 'Committed deadline required'; end if;
      update requisition set status='Accepted',committed_due=due where id=ident;
    elsif action='request:commit' and r.status in ('Accepted','Assigned','In Progress') then
      perform required_text(data->>'note');
      due:=(data->>'due')::timestamptz;
      if due is null then raise exception 'Committed deadline required';end if;
      update requisition set committed_due=due where id=ident;
      event_detail:=data||jsonb_build_object('previousCommitment',r.committed_due);
    elsif action='request:disposition' and r.status in ('Assigned','In Progress') then
      child_ref:=(data->>'child')::uuid;
      update task set cancelled_disposition=required_text(data->>'note') where workspace_id=w and parent_id=ident and id=child_ref and status='Cancelled';
      if not found then raise exception 'Choose a cancelled linked task';end if;
    elsif action='request:cancel' and r.status in ('Accepted','Assigned','In Progress','For Requester Acceptance') then
      perform required_text(data->>'note');
      if exists(select 1 from task where parent_id=ident and status not in ('Closed','Cancelled')) then raise exception 'Resolve open linked tasks before cancellation';end if;
      update requisition set status='Cancelled' where id=ident;
    elsif action='request:deliver' and r.status in ('Assigned','In Progress') then
      if not exists(select 1 from task where parent_id=ident and status='Closed' and accepted_submission_id is not null)
      or exists(select 1 from task where parent_id=ident and not ((status='Closed' and accepted_submission_id is not null) or (status='Cancelled' and cancelled_disposition is not null))) then raise exception 'All linked tasks must be accepted';end if;
      event_detail:=data||jsonb_build_object('delivered',(select jsonb_agg(jsonb_build_object('child',id,'submission',accepted_submission_id,'disposition',cancelled_disposition) order by id) from task where parent_id=ident));
      update requisition set status='For Requester Acceptance' where id=ident;
    elsif action='request:close' and r.status='For Requester Acceptance' then update requisition set status='Closed' where id=ident;
    elsif (action='request:return' and r.status='For Requester Acceptance') or (action='request:reopen' and r.status='Closed') then
      perform required_text(data->>'note');
      child_ref:=(data->>'child')::uuid;
      select * into t from task where workspace_id=w and parent_id=ident and id=child_ref and status='Closed';
      if not found then raise exception 'Choose an accepted linked task';end if;
      update task set status='In Progress',accepted_submission_id=null where id=child_ref;
      update requisition set status='In Progress' where id=ident;
      event_detail:=data||jsonb_build_object('previousSubmission',t.accepted_submission_id);
    else raise exception 'Unsupported requisition transition'; end if;
    event_detail:=event_detail||jsonb_build_object('previousStatus',r.status,'status',(select status from requisition where id=ident));

  else raise exception 'Unsupported command'; end if;
  if parent_ref is not null then
    event_detail:=event_detail||jsonb_build_object('parentId',parent_ref,'previousParentStatus',parent_before,'parentStatus',(select status from requisition where id=parent_ref));
  end if;
  if child_ref is not null then event_detail:=event_detail||jsonb_build_object('childId',child_ref);end if;
  if config_kind is null then
    insert into event(workspace_id,ticket_id,actor_id,action,detail) values(w,ident,actor,action,event_detail);
  elsif config_kind not in ('labor','report','assessment','notification') then
    insert into routine_config_event(workspace_id,record_id,actor_id,action,detail) values(w,ident,actor,action,event_detail);
  end if;
  update workspace set revision=revision+1 where id=w returning revision into rev;
  result:=jsonb_build_object('version',rev,'id',ident,'ticket',(select number from ticket where id=ident));
  if config_kind is not null then result:=result||jsonb_build_object('kind',config_kind);end if;
  insert into command_receipt values(w,request_key,input,result);
  return result;
end $$;

-- Disposable operational personnel classifications; no production migration.
-- Append-only effective state, sourced from an immutable organizational review.
set search_path=agt,pg_catalog;
create table personnel_classification(
 workspace_id uuid not null,
 personnel_id uuid not null,
 source_review_id uuid not null,
 source_revision text not null check(length(btrim(source_revision))>0),
 original_department_id uuid not null,
 original_department text not null check(length(btrim(original_department))>0),
 reporting_department text not null references department(code),
 evaluation_participation text not null check(evaluation_participation in ('standard','included','excluded','pending')),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(workspace_id,personnel_id,source_review_id),
 foreign key(workspace_id,personnel_id) references person(workspace_id,user_id)
);
create index personnel_classification_cutoff on personnel_classification(workspace_id,personnel_id,recorded_at desc);
create function preserve_personnel_classification() returns trigger language plpgsql as $$
begin raise exception 'Personnel classification history is immutable';end $$;
create trigger personnel_classification_immutable before update or delete on personnel_classification for each row execute function preserve_personnel_classification();
create function personnel_classifications_at(w uuid,c timestamptz) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('personnelId',x.personnel_id,'sourceReviewId',x.source_review_id,'sourceRevision',x.source_revision,'originalDepartmentId',x.original_department_id,'originalDepartment',x.original_department,'reportingDepartment',x.reporting_department,'evaluationParticipation',x.evaluation_participation,'recordedAt',x.recorded_at) order by x.personnel_id),'[]'::jsonb)
 from (select distinct on(personnel_id) * from personnel_classification where workspace_id=w and recorded_at<=c order by personnel_id,recorded_at desc,source_review_id desc)x
$$;
-- Missing historical classification preserves existing ordinary-person semantics.
create function frozen_evaluation_participation(facts jsonb,emp uuid) returns text
language sql immutable as $$
 select coalesce((select x->>'evaluationParticipation' from jsonb_array_elements(coalesce(facts->'personnel','[]'::jsonb)) x where x->>'personnelId'=emp::text),'standard')
$$;

-- Disposable source review archive. Never exposed as a production RPC.
set search_path=agt,pg_catalog;
create table crm_source_review(
 workspace_id uuid not null,
 review_revision integer not null check(review_revision>0),
 review_id uuid not null unique,
 source_revision text not null check(length(source_revision)>0),
 captured_at timestamptz not null,
 packet jsonb not null,
 primary key(workspace_id,review_revision),
 check(packet->>'workspaceId'=workspace_id::text),
 check(packet->>'reviewId'=review_id::text),
 check(packet->>'reviewRevision'=review_revision::text),
 check(packet->>'sourceRevision'=source_revision)
);
create function preserve_crm_source_review() returns trigger language plpgsql as $$
begin raise exception 'Source review revisions are immutable';end $$;
create trigger preserve_crm_source_review before update or delete on crm_source_review for each row execute function preserve_crm_source_review();
create function crm_source_keys() returns jsonb language sql immutable as $$
 select '{"profiles":"id","members":"userId","employees":"id","sourceDepartments":"id","assignments":"userId","departmentLinks":"sourceId","workforce":"employeeId","entities":"id","customers":"id","commercial":"id","commercialMappings":"sourceId","contacts":"department"}'::jsonb
$$;
create function crm_source_manifest(w uuid,a uuid,r integer) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'userId',a,'reviewId',s.review_id,'reviewRevision',s.review_revision,'sourceRevision',s.source_revision,'capturedAt',s.packet->>'capturedAt','capabilities',s.packet->'capabilities','counts',(select jsonb_object_agg(k,jsonb_array_length(s.packet->k)) from jsonb_object_keys(crm_source_keys()) k))
 from crm_source_review s where workspace_id=w and (r is null or review_revision=r) order by review_revision desc limit 1
$$;
create function crm_source_page(w uuid,a uuid,r integer,i uuid,v text,c text,after_key text,page_size integer) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare source jsonb; k text; result jsonb;
begin
 k:=crm_source_keys()->>c;
 if k is null or page_size is null or page_size not between 1 and 100 then raise exception 'Invalid source page';end if;
 select packet into source from crm_source_review where workspace_id=w and review_revision=r and review_id=i and source_revision=v;
 if not found then raise exception 'Source review revision unavailable';end if;
 with candidates as materialized(select x row,x->>k as row_key from jsonb_array_elements(source->c)x where after_key is null or (x->>k) collate "C">after_key collate "C" order by (x->>k) collate "C" limit page_size+1),
 visible as(select * from candidates order by row_key collate "C" limit page_size)
 select jsonb_build_object('workspaceId',w,'userId',a,'reviewId',i,'reviewRevision',r,'sourceRevision',v,'collection',c,'rows',coalesce((select jsonb_agg(row order by row_key collate "C") from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from candidates)>page_size then (select row_key from visible order by row_key collate "C" desc limit 1) else null end) into result;
 return result;
end $$;

-- Trusted, disposable host import. No exposed write RPC or production migration.
set search_path=agt,pg_catalog;
alter table personnel_classification add foreign key(source_review_id) references crm_source_review(review_id);
create function bind_personnel_review(w uuid,r uuid,rows jsonb) returns integer
language plpgsql set search_path=agt,pg_catalog as $$
declare source crm_source_review%rowtype; x jsonb; e jsonb; original jsonb; assignment jsonb; decision jsonb; link jsonb; ident uuid; old person%rowtype; prior personnel_classification%rowtype; expected_dept text; participation text; changed integer:=0; progressive boolean;
begin
 perform 1 from workspace where id=w for update;
 if not found then raise exception 'Unknown workspace';end if;
 select * into source from crm_source_review where workspace_id=w and review_id=r;
 if not found or source.packet->'capabilities'->'organizationPolicy'->>'contract' is distinct from 'agt-organization-v1' then raise exception 'Current organizational source review required';end if;
 progressive:=coalesce(source.packet->'capabilities'->'progressiveWorkforce'->>'contract'='agt-progressive-workforce-v1',false);
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)>10000 or (select count(distinct item->>'personnelId') from jsonb_array_elements(rows) item)<>jsonb_array_length(rows) then raise exception 'Invalid personnel binding batch';end if;
 for x in select value from jsonb_array_elements(rows) loop
  ident:=(x->>'personnelId')::uuid;
  select value into e from jsonb_array_elements(source.packet->'employees') where value->>'id'=ident::text;
  select value into decision from jsonb_array_elements(source.packet->'workforce') where value->>'employeeId'=ident::text;
  select value into assignment from jsonb_array_elements(source.packet->'assignments') where value->>'userId'=coalesce(e->>'authUserId',e->>'sharedUserId');
  select value into original from jsonb_array_elements(source.packet->'sourceDepartments') where value->>'id'=assignment->>'departmentId';
  if e is null or e->>'active' is distinct from 'true' or assignment->>'active' is distinct from 'true' or original->>'active' is distinct from 'true'
    or x->>'sourceReviewId' is distinct from r::text or x->>'sourceRevision' is distinct from source.source_revision
    or x->>'label' is distinct from e->>'label' or x->>'originalDepartmentId' is distinct from original->>'id' or x->>'originalDepartment' is distinct from original->>'label'
    or decision->>'confirmed' is distinct from 'true' or decision->>'eligibility' is distinct from 'eligible' or decision->>'sourceRevision' is distinct from source.source_revision or nullif(btrim(decision->>'evidenceRef'),'') is null
    or decision->>'userId' is distinct from e->>'authUserId' or decision->>'departmentId' is distinct from original->>'id' then raise exception 'Personnel binding evidence mismatch';end if;
  if e->>'sourceSystem'='time-tracker-ojt' then
   if e->>'authUserId' is not null or x->>'identityKind' is distinct from 'timetracker-intern' or x->>'sharedLoginId' is distinct from e->>'sharedUserId' then raise exception 'Intern identity binding mismatch';end if;
  elsif e->>'sourceSystem' is distinct from 'time-tracker' or e->>'authUserId' is distinct from ident::text or x->>'identityKind' is distinct from 'crm-user' or x->>'sharedLoginId' is not null then raise exception 'CRM identity binding mismatch';
  end if;
  if e->>'sourceSystem'='time-tracker' and (not exists(select 1 from jsonb_array_elements(source.packet->'profiles') p where p->>'id'=ident::text and p->>'status'='active') or not exists(select 1 from jsonb_array_elements(source.packet->'members') m where m->>'userId'=ident::text and m->>'active'='true')) then raise exception 'Inactive personnel source';end if;
  if e->>'sourceSystem'='time-tracker-ojt' or e->>'sourceRole'='OJT' or lower(btrim(original->>'label'))='ojt' then
   expected_dept:=decision->>'functionalDepartment';
   if expected_dept not in ('ML','FIN','HR','SALES','IT','RD','IFAB') or expected_dept is null or nullif(btrim(decision->>'functionalEvidenceRef'),'') is null then
    if not progressive then raise exception 'OJT placement unresolved';end if;
    expected_dept:='OJT_PENDING';
   end if;
   participation:=case when decision->>'evaluationParticipation' in ('included','excluded') and nullif(btrim(decision->>'evaluationEvidenceRef'),'') is not null then decision->>'evaluationParticipation' else 'pending' end;
  else
   select value into link from jsonb_array_elements(source.packet->'departmentLinks') where value->>'sourceId'=original->>'id';
   if link->>'confirmed' is distinct from 'true' or link->>'sourceRevision' is distinct from source.source_revision or nullif(btrim(link->>'evidenceRef'),'') is null then raise exception 'Department crosswalk unresolved';end if;
   expected_dept:=link->>'target';participation:='standard';
   if expected_dept='ENG' then
    expected_dept:=decision->>'unit';
    if expected_dept is null or expected_dept not in ('RD','IFAB') or nullif(btrim(decision->>'unitEvidenceRef'),'') is null then
     if not progressive then raise exception 'Engineering unit unresolved';end if;
     expected_dept:='ENG';
    end if;
   end if;
  end if;
  if x->>'reportingDepartment' is distinct from expected_dept or x->>'evaluationParticipation' is distinct from participation then raise exception 'Personnel classification mismatch';end if;
  select * into prior from personnel_classification where workspace_id=w and personnel_id=ident and source_review_id=r;
  if found then continue;end if;
  -- Old reviewed source cannot silently overwrite newer personnel decisions.
  if exists(select 1 from personnel_classification c join crm_source_review s on s.review_id=c.source_review_id where c.workspace_id=w and c.personnel_id=ident and s.review_revision>source.review_revision) then raise exception 'Stale personnel review';end if;
  select * into old from person where workspace_id=w and user_id=ident;
  if found and (old.identity_kind<>x->>'identityKind' or old.shared_login_id is distinct from (x->>'sharedLoginId')::uuid) then raise exception 'Personnel identity cannot be reassigned';end if;
  if expected_dept='OJT_PENDING' then insert into department(code,name,parent_code) values('OJT_PENDING','OJT — placement pending',null) on conflict(code) do nothing;end if;
  insert into person(workspace_id,user_id,department_code,display_name,identity_kind,shared_login_id) values(w,ident,expected_dept,x->>'label',x->>'identityKind',(x->>'sharedLoginId')::uuid)
  on conflict(workspace_id,user_id) do update set department_code=excluded.department_code,display_name=excluded.display_name;
  insert into personnel_classification(workspace_id,personnel_id,source_review_id,source_revision,original_department_id,original_department,reporting_department,evaluation_participation) values(w,ident,r,source.source_revision,(original->>'id')::uuid,original->>'label',expected_dept,participation);
  changed:=changed+1;
 end loop;
 if changed>0 then update workspace set revision=revision+1 where id=w;end if;
 return changed;
end $$;

-- Disposable binary storage reference. Production object storage is a separate adapter.
set search_path=agt,pg_catalog;
create table evidence_file (
 id uuid primary key,
 workspace_id uuid not null,
 task_id uuid not null,
 actor_id uuid not null,
 submission_id uuid,
 filename text not null,
 mime text not null,
 bytes bytea not null check(octet_length(bytes) between 1 and 10485760),
 sha256 text generated always as (encode(sha256(bytes),'hex')) stored,
 created_at timestamptz not null default clock_timestamp(),
 linked_at timestamptz,
 foreign key(workspace_id,task_id) references task(workspace_id,id),
 foreign key(workspace_id,actor_id) references person(workspace_id,user_id),
 foreign key(task_id,submission_id) references submission(task_id,id),
 check((submission_id is null)=(linked_at is null)),
 check(length(filename) between 1 and 180),
 check(mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png'))
);
create unique index evidence_staged_unique on evidence_file(workspace_id,task_id,actor_id,sha256) where submission_id is null;
create index evidence_submission_idx on evidence_file(task_id,submission_id,id);
create index evidence_expiry_idx on evidence_file(workspace_id,created_at) where submission_id is null;
create function evidence_meta(e evidence_file) returns jsonb language sql stable as $$
 select jsonb_build_object('id',e.id,'taskId',e.task_id,'submissionId',e.submission_id,'filename',e.filename,'mime',e.mime,'size',octet_length(e.bytes),'sha256',e.sha256,'createdAt',e.created_at,'linkedAt',e.linked_at)
$$;
-- Only the host calls this after format validation. Stage changes do not alter task revision.
create function evidence_stage(w uuid,t uuid,a uuid,k uuid,n text,m text,b bytea) returns jsonb
language plpgsql set search_path=agt,pg_catalog as $$
declare e evidence_file%rowtype; h text; expected_mime text;
begin
 perform 1 from workspace where id=w for update;
 if not found then raise exception 'Unknown workspace';end if;
 if not exists(select 1 from person where workspace_id=w and user_id=a and identity_kind='crm-user') then raise exception 'Unknown workforce reference';end if;
 if k is null or b is null or octet_length(b) not between 1 and 10485760 or n is null or length(n) not between 1 and 180 or (n~'[[:cntrl:]/]' or position(chr(92) in n)>0) or n in ('.','..') then raise exception 'Invalid evidence file';end if;
 expected_mime:=case lower(regexp_replace(n,'^.*[.]','')) when 'pdf' then 'application/pdf' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' end;
 if position('.' in n)=0 or expected_mime is null or expected_mime is distinct from m then raise exception 'Invalid evidence format';end if;
 if (m='application/pdf' and substring(b from 1 for 5)<>decode('255044462d','hex')) or (m='image/png' and substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex')) or (m='image/jpeg' and substring(b from 1 for 3)<>decode('ffd8ff','hex')) or (m like 'application/vnd.openxmlformats-%' and substring(b from 1 for 4)<>decode('504b0304','hex')) then raise exception 'Invalid evidence format';end if;
 delete from evidence_file where workspace_id=w and submission_id is null and created_at<=clock_timestamp()-interval '24 hours';
 h:=encode(sha256(b),'hex');
 select * into e from evidence_file where id=k;
 if found then
  if e.workspace_id<>w or e.task_id<>t or e.actor_id<>a or e.filename<>n or e.mime<>m or e.sha256<>h then raise exception 'Upload ID reused with different input';end if;
  return evidence_meta(e);
 end if;
 if not exists(select 1 from task where workspace_id=w and id=t and status in ('Assigned','In Progress')) then raise exception 'Task not accepting evidence';end if;
 select * into e from evidence_file where workspace_id=w and task_id=t and actor_id=a and submission_id is null and sha256=h;
 if found then return evidence_meta(e);end if;
 if (select count(*) from evidence_file where workspace_id=w and task_id=t and actor_id=a and submission_id is null)>=5 then raise exception 'Maximum five staged files per task';end if;
 insert into evidence_file(id,workspace_id,task_id,actor_id,filename,mime,bytes) values(k,w,t,a,n,m,b) returning * into e;
 return evidence_meta(e);
end $$;
create function evidence_staged(w uuid,t uuid,a uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select coalesce(jsonb_agg(evidence_meta(e) order by e.created_at,e.id),'[]'::jsonb) from evidence_file e where workspace_id=w and task_id=t and actor_id=a and submission_id is null and created_at>statement_timestamp()-interval '24 hours'
$$;
create function evidence_discard(w uuid,t uuid,a uuid,k uuid) returns boolean
language plpgsql set search_path=agt,pg_catalog as $$
begin
 perform 1 from workspace where id=w for update;
 delete from evidence_file where workspace_id=w and task_id=t and actor_id=a and id=k and submission_id is null;
 return true;
end $$;
create function evidence_cleanup(w uuid) returns integer language plpgsql set search_path=agt,pg_catalog as $$
declare n integer;
begin
 perform 1 from workspace where id=w for update;
 delete from evidence_file where workspace_id=w and submission_id is null and created_at<=clock_timestamp()-interval '24 hours';
 get diagnostics n=row_count;return n;
end $$;
-- Called inside existing workspace-locked submit transaction. Entire submission rolls back on failure.
create function evidence_link(w uuid,t uuid,a uuid,s uuid,ids jsonb) returns void
language plpgsql set search_path=agt,pg_catalog as $$
declare keys uuid[]; n integer;
begin
 if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Invalid attachment selection';end if;
 if jsonb_array_length(ids)>5 then raise exception 'Maximum five attachments per submission';end if;
 select array_agg(x::uuid) into keys from jsonb_array_elements_text(ids) x;
 if keys is null then return;end if;
 if (select count(distinct x) from unnest(keys) x)<>cardinality(keys) then raise exception 'Invalid attachment selection';end if;
 update evidence_file set submission_id=s,linked_at=clock_timestamp()
 where id=any(keys) and workspace_id=w and task_id=t and actor_id=a and submission_id is null and created_at>clock_timestamp()-interval '24 hours';
 get diagnostics n=row_count;
 if n<>cardinality(keys) then raise exception 'Attachment unavailable for this submission';end if;
end $$;
create function evidence_manifest(w uuid,t uuid,s uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select coalesce(jsonb_agg(evidence_meta(e) order by e.created_at,e.id),'[]'::jsonb) from evidence_file e where e.workspace_id=w and e.task_id=t and e.submission_id=s
$$;
create function evidence_download(w uuid,t uuid,s uuid,k uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select evidence_meta(e)||jsonb_build_object('hex',encode(e.bytes,'hex')) from evidence_file e where e.workspace_id=w and e.task_id=t and e.submission_id=s and e.id=k
$$;
create function evidence_preserve_linked() returns trigger language plpgsql as $$
begin
 if old.submission_id is not null then raise exception 'Submitted evidence is immutable';end if;
 if tg_op='DELETE' then return old;end if;
 if new.id<>old.id or new.workspace_id<>old.workspace_id or new.task_id<>old.task_id or new.actor_id<>old.actor_id or new.filename<>old.filename or new.mime<>old.mime or new.bytes<>old.bytes or new.created_at<>old.created_at then raise exception 'Staged evidence content is immutable';end if;
 return new;
end $$;
create trigger evidence_immutable before update or delete on evidence_file for each row execute function evidence_preserve_linked();

-- Load immediately after core, before any commands or fixtures.
set search_path=agt,pg_catalog;
create table task_reporting_state (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 task_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 state jsonb not null,
 foreign key(workspace_id,task_id) references task(workspace_id,id)
);
create index task_reporting_at on task_reporting_state(workspace_id,task_id,at desc,id desc);
create function record_task_reporting_state() returns trigger
language plpgsql set search_path=agt,pg_catalog as $$
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;
 insert into task_reporting_state(workspace_id,task_id,state)
 select new.workspace_id,new.id,to_jsonb(new)||jsonb_build_object('entity',e.code,'entity_id',e.id,'owner_label',p.display_name,'department_parent',d.parent_code)
 from commercial_reference c join entity e on e.workspace_id=c.workspace_id and e.id=c.entity_id
 join person p on p.workspace_id=c.workspace_id and p.user_id=new.original_owner_id
 join department d on d.code=new.original_department
 where c.workspace_id=new.workspace_id and c.id=new.allocation_id;
 return new;
end $$;
create trigger task_reporting_capture after insert or update on task for each row execute function record_task_reporting_state();
create table schedule_reporting_state (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 schedule_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 state jsonb not null,
 foreign key(workspace_id,schedule_id) references routine_schedule(workspace_id,id)
);
create index schedule_reporting_at on schedule_reporting_state(workspace_id,schedule_id,at desc,id desc);
create function record_schedule_reporting_state() returns trigger
language plpgsql set search_path=agt,pg_catalog as $$
begin
 insert into schedule_reporting_state(workspace_id,schedule_id,state) values(new.workspace_id,new.id,to_jsonb(new));
 return new;
end $$;
create trigger schedule_reporting_capture after insert or update on routine_schedule for each row execute function record_schedule_reporting_state();

-- Disposable labor ledger. Loaded after core schema, never a production migration.
set search_path=agt,pg_catalog;
create table labor_entry (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 task_id uuid not null,
 employee_id uuid not null,
 allocation_id uuid not null,
 department_code text not null references department(code),
 allocation_snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,id),
 foreign key(workspace_id,task_id) references task(workspace_id,id),
 foreign key(workspace_id,employee_id) references person(workspace_id,user_id),
 foreign key(workspace_id,allocation_id) references commercial_reference(workspace_id,id)
);
create table labor_version (
 entry_id uuid references labor_entry(id),
 version integer not null check(version>0),
 work_date date not null,
 minutes integer not null check(minutes between 1 and 1440),
 activity text not null,
 start_at timestamptz,
 end_at timestamptz,
 reason text not null default '',
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(entry_id,version),
 check((start_at is null and end_at is null) or (start_at is not null and end_at is not null and end_at>start_at))
);
create table labor_review (
 entry_id uuid not null,
 version integer not null,
 decision text not null check(decision in ('Approved','Returned')),
 note text not null,
 actor_id uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 primary key(entry_id,version),
 foreign key(entry_id,version) references labor_version(entry_id,version)
);
create table labor_event (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 entry_id uuid not null,
 actor_id uuid not null,
 action text not null,
 detail jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,entry_id) references labor_entry(workspace_id,id),
 foreign key(workspace_id,actor_id) references person(workspace_id,user_id)
);
create index labor_employee_idx on labor_entry(workspace_id,employee_id);
create index labor_task_idx on labor_entry(workspace_id,task_id);
create index labor_event_idx on labor_event(workspace_id,entry_id,id);
create view labor_current as
 select e.*,v.version,v.work_date,v.minutes,v.activity,v.start_at,v.end_at,v.reason,v.recorded_at,
 coalesce(r.decision,'Submitted') as status
 from labor_entry e join lateral(select * from labor_version where entry_id=e.id order by version desc limit 1)v on true
 left join labor_review r on r.entry_id=e.id and r.version=v.version;

-- Invoked inside the existing workspace-locked command transaction.
create function labor_change(w uuid,actor uuid,action text,target uuid,data jsonb) returns uuid
language plpgsql set search_path=agt,pg_catalog set timezone='Asia/Manila' as $$
declare e labor_current%rowtype; t task%rowtype; ident uuid; emp uuid; workday date; mins integer; activity_text text; starts timestamptz; ends timestamptz; why text; ver integer; snapshot jsonb; dept text;
begin
 if action='labor' then
  select * into t from task where workspace_id=w and id=(data->>'task')::uuid;
  if not found or t.status='Proposed' then raise exception 'Choose a confirmed execution task';end if;
  emp:=(data->>'employee')::uuid;
  select department_code into dept from person where workspace_id=w and user_id=emp;
  if not found then raise exception 'Unknown workforce reference';end if;
  if t.work_type='Daily Routine' and emp<>t.owner_id then raise exception 'Routine labor belongs to scheduled employee';end if;
  if not valid_allocation(w,t.allocation_id) then raise exception 'Invalid commercial allocation';end if;
  select jsonb_build_object('allocationId',c.id,'label',c.label,'kind',c.kind,'entityId',c.entity_id,'entity',en.code,'sourceSystem',c.source_system,'sourceId',c.source_id,'customerId',c.customer_id,'projectId',c.project_id,'parentContractId',c.parent_contract_id)
  into snapshot from commercial_reference c join entity en on en.workspace_id=c.workspace_id and en.id=c.entity_id where c.workspace_id=w and c.id=t.allocation_id;
  insert into labor_entry(workspace_id,task_id,employee_id,allocation_id,department_code,allocation_snapshot) values(w,t.id,emp,t.allocation_id,dept,snapshot) returning id into ident;
  ver:=1;why:='';
 else
  select * into e from labor_current where workspace_id=w and id=target;
  if not found then raise exception 'Unknown labor entry';end if;
  ident:=e.id;emp:=e.employee_id;ver:=e.version;
  if (data->>'entryVersion')::integer is distinct from ver then raise exception 'Labor version mismatch';end if;
  if action in ('labor:approve','labor:return') then
   if e.status<>'Submitted' then raise exception 'Labor entry not submitted';end if;
   insert into labor_review values(ident,ver,case when action='labor:approve' then 'Approved' else 'Returned' end,case when action='labor:return' then required_text(data->>'note') else coalesce(data->>'note','') end,actor,clock_timestamp());
   insert into labor_event(workspace_id,entry_id,actor_id,action,detail) values(w,ident,actor,action,data);
   return ident;
  elsif action='labor:correct' then
   why:=required_text(data->>'reason');ver:=ver+1;
  else raise exception 'Unsupported labor action';end if;
 end if;
 workday:=(data->>'date')::date;
 if exists(select 1 from routine_occurrence o join routine_schedule rs on rs.id=o.schedule_id where o.task_id=coalesce(t.id,e.task_id) and rs.work_date is distinct from workday) then raise exception 'Routine labor date must match scheduled work date';end if;
 if workday is null or workday>(clock_timestamp() at time zone 'Asia/Manila')::date then raise exception 'Invalid actual work date';end if;
 if coalesce(data->>'minutes','') !~ '^[0-9]{1,4}$' then raise exception 'Invalid labor duration';end if;
 mins:=(data->>'minutes')::integer;
 if mins<1 or mins>1440 then raise exception 'Invalid labor duration';end if;
 activity_text:=required_text(data->>'activity');
 starts:=nullif(data->>'start','')::timestamptz;ends:=nullif(data->>'end','')::timestamptz;
 if (starts is null)<>(ends is null) or (starts is not null and (ends<=starts or extract(epoch from ends-starts)<>mins*60 or (starts at time zone 'Asia/Manila')::date<>workday or (ends at time zone 'Asia/Manila')::date>workday+1 or ends>clock_timestamp())) then raise exception 'Invalid labor interval';end if;
 if exists(select 1 from labor_current x where x.workspace_id=w and x.employee_id=emp and x.id<>ident and x.status<>'Returned'
  and x.task_id=coalesce(t.id,e.task_id) and x.work_date=workday and lower(btrim(x.activity))=lower(btrim(activity_text)) and x.minutes=mins and x.start_at is not distinct from starts and x.end_at is not distinct from ends) then raise exception 'Duplicate labor entry';end if;
 if starts is not null and exists(select 1 from labor_current x where x.workspace_id=w and x.employee_id=emp and x.id<>ident and x.status<>'Returned' and x.start_at<ends and x.end_at>starts) then raise exception 'Overlapping labor interval';end if;
 insert into labor_version(entry_id,version,work_date,minutes,activity,start_at,end_at,reason) values(ident,ver,workday,mins,activity_text,starts,ends,why);
 insert into labor_event(workspace_id,entry_id,actor_id,action,detail) values(w,ident,actor,action,data||jsonb_build_object('entryVersion',ver));
 return ident;
end $$;

-- Disposable canonical reporting only. Dates are Manila dates; end is exclusive.
set search_path=agt,pg_catalog;
create table report_snapshot (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references workspace(id),
 month_start date not null,
 report_revision integer not null,
 cutoff timestamptz not null,
 source_revision bigint not null,
 formula text not null default 'agt-counts-v1',
 actor_id uuid not null,
 note text not null,
 created_at timestamptz not null default clock_timestamp(),
 facts jsonb not null,
 projection jsonb not null,
 unique(workspace_id,month_start,report_revision),
 foreign key(workspace_id,actor_id) references person(workspace_id,user_id)
);
create function prevent_report_overwrite() returns trigger language plpgsql as $$
begin raise exception 'Finalized reports are immutable';end $$;
create trigger report_immutable before update or delete on report_snapshot for each row execute function prevent_report_overwrite();
create function report_facts(w uuid,f date,u date,cutoff timestamptz) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog set timezone='Asia/Manila' as $$
declare result jsonb; lower_at timestamptz; upper_at timestamptz;
begin
 if f is null or u is null or u<=f or u-f>366 or cutoff is null or cutoff>statement_timestamp() then raise exception 'Invalid reporting period or cutoff';end if;
 lower_at:=f::timestamp at time zone 'Asia/Manila';upper_at:=u::timestamp at time zone 'Asia/Manila';
 with states as materialized (
 select distinct on(h.task_id) h.task_id,h.state from task_reporting_state h where h.workspace_id=w and h.at<=cutoff order by h.task_id,h.at desc,h.id desc
 ), task_rows as materialized (
 select h.task_id, h.state, (h.state->>'reporting_due_at')::timestamptz as due,
 (h.state->>'due_at')::timestamptz as operational_due,
 s.submitted_at as accepted_at, fr.reviewed_at as first_at,fr.result as first_result
 from states h left join submission s on s.task_id=h.task_id and s.id=(h.state->>'accepted_submission_id')::uuid and s.submitted_at<=cutoff
 left join lateral(select rr.reviewed_at,rr.result from review rr where rr.task_id=h.task_id and rr.reviewed_at<=cutoff order by rr.reviewed_at,rr.id limit 1) fr on true
 ), task_facts as (
 select jsonb_build_object('id',task_id,'owner',state->>'original_owner_id','ownerLabel',state->>'owner_label','department',state->>'original_department','departmentParent',state->>'department_parent','entity',state->>'entity','entityId',state->>'entity_id','workType',state->>'work_type',
 'dueAt',due,'operationalDue',operational_due,'status',state->>'status','acceptedSubmission',state->>'accepted_submission_id','acceptedAt',accepted_at,
 'firstReviewAt',first_at,'firstResult',first_result,
 'due',due>=lower_at and due<upper_at and state->>'status' not in ('Proposed','Cancelled'),
 'closed',state->>'status'='Closed' and accepted_at is not null,
 'onTime',state->>'status'='Closed' and accepted_at is not null and accepted_at<=due,
 'reviewed',coalesce(first_at>=lower_at and first_at<upper_at,false),
 'firstAccepted',coalesce(first_result='Accepted',false),
 'overdue',state->>'status' in ('Assigned','In Progress','Blocked') and operational_due<cutoff,
 'reviewWait',state->>'status'='For Review') as row,task_id
 from task_rows where (due>=lower_at and due<upper_at) or (first_at>=lower_at and first_at<upper_at)
 ), schedules as (
 select distinct on(h.schedule_id) h.schedule_id,h.state from schedule_reporting_state h where h.workspace_id=w and h.at<=cutoff order by h.schedule_id,h.at desc,h.id desc
 ), coverage as (
 select jsonb_build_object('id',s.schedule_id,'owner',s.state->>'owner_id','date',s.state->>'work_date','shift',s.state->>'shift','eligibility',s.state->>'eligibility',
 'dueAt',s.state->>'due_at','dueByCutoff',(s.state->>'due_at')::timestamptz<=cutoff,'generated',exists(select 1 from routine_occurrence o join states t on t.task_id=o.task_id where o.schedule_id=s.schedule_id)) as row,s.schedule_id
 from schedules s where (s.state->>'work_date')::date>=f and (s.state->>'work_date')::date<u
 ), latest_labor as (
 select e.id,e.employee_id,e.department_code,e.allocation_snapshot,v.version,v.work_date,v.minutes,r.decision
 from labor_entry e join lateral(select * from labor_version where entry_id=e.id and recorded_at<=cutoff order by version desc limit 1)v on true
 left join labor_review r on r.entry_id=e.id and r.version=v.version and r.reviewed_at<=cutoff
 where e.workspace_id=w and e.created_at<=cutoff
 ), labor as (
 select id,jsonb_build_object('id',id,'version',version,'employee',employee_id,'department',department_code,'entity',allocation_snapshot->>'entity','entityId',allocation_snapshot->>'entityId','allocation',allocation_snapshot,'date',work_date,'minutes',minutes) as row
 from latest_labor where decision='Approved' and work_date>=f and work_date<u
 )
 select jsonb_build_object('tasks',coalesce((select jsonb_agg(row order by task_id) from task_facts),'[]'::jsonb),'coverage',coalesce((select jsonb_agg(row order by schedule_id) from coverage),'[]'::jsonb),'labor',coalesce((select jsonb_agg(row order by id) from labor),'[]'::jsonb),'personnel',personnel_classifications_at(w,cutoff)) into result;
 return result;
end $$;
-- Counts are derived from the stored facts, not saved percentages.
create function report_counts(facts jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object(
 'due',count(*) filter(where (t->>'due')::boolean),
 'closed',count(*) filter(where (t->>'due')::boolean and (t->>'closed')::boolean),
 'onTime',count(*) filter(where (t->>'due')::boolean and (t->>'onTime')::boolean),
 'reviewed',count(*) filter(where (t->>'reviewed')::boolean),
 'firstAccepted',count(*) filter(where (t->>'reviewed')::boolean and (t->>'firstAccepted')::boolean),
 'overdue',count(*) filter(where (t->>'due')::boolean and (t->>'overdue')::boolean),
 'reviewWait',count(*) filter(where (t->>'due')::boolean and (t->>'reviewWait')::boolean),
 'scheduled',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Scheduled'),
 'generated',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Scheduled' and (c->>'generated')::boolean),
 'coverageGap',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Scheduled' and not (c->>'generated')::boolean and (c->>'dueByCutoff')::boolean),
 'upcoming',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Scheduled' and not (c->>'generated')::boolean and not (c->>'dueByCutoff')::boolean),
 'leave',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Approved Leave'),
 'nonWorking',(select count(*) from jsonb_array_elements(facts->'coverage') c where c->>'eligibility'='Non-working'),
 'approvedMinutes',(select coalesce(sum((l->>'minutes')::bigint),0) from jsonb_array_elements(facts->'labor') l))
 from jsonb_array_elements(facts->'tasks') t
$$;
create function report_projection(facts jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('counts',agt.report_counts(facts),'evaluationRoster',coalesce(facts->'personnel','[]'::jsonb),
 'workTypes',(select coalesce(jsonb_agg(jsonb_build_object('label',kind,'counts',agt.report_counts(jsonb_build_object('tasks',rows,'labor','[]'::jsonb,'coverage','[]'::jsonb))) order by kind),'[]'::jsonb) from (select t->>'workType' kind,jsonb_agg(t) rows from jsonb_array_elements(facts->'tasks') t group by 1) g),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('owner',owner,'ownerLabel',owner_label,'department',dept,'counts',agt.report_counts(jsonb_build_object('tasks',rows,'labor','[]'::jsonb,'coverage','[]'::jsonb))) order by owner,dept),'[]'::jsonb) from (select t->>'owner' owner,t->>'department' dept,max(t->>'ownerLabel') owner_label,jsonb_agg(t) rows from jsonb_array_elements(facts->'tasks') t group by 1,2) g),
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('label',dept,'counts',agt.report_counts(jsonb_build_object('tasks',rows,'labor','[]'::jsonb,'coverage','[]'::jsonb))) order by dept),'[]'::jsonb) from (select coalesce(t->>'departmentParent',t->>'department') dept,jsonb_agg(t) rows from jsonb_array_elements(facts->'tasks') t group by 1) g),
 'entities',(select coalesce(jsonb_agg(jsonb_build_object('label',entity,'counts',agt.report_counts(jsonb_build_object('tasks',rows,'labor','[]'::jsonb,'coverage','[]'::jsonb))) order by entity),'[]'::jsonb) from (select t->>'entity' entity,jsonb_agg(t) rows from jsonb_array_elements(facts->'tasks') t group by 1) g),
 'laborGroups',(select coalesce(jsonb_agg(jsonb_build_object('employee',employee,'department',dept,'entity',entity,'minutes',minutes) order by employee,dept,entity),'[]'::jsonb) from (select l->>'employee' employee,l->>'department' dept,l->>'entity' entity,sum((l->>'minutes')::bigint) minutes from jsonb_array_elements(facts->'labor') l group by 1,2,3) g))
$$;
create function report_preview(w uuid,f date,u date,cutoff timestamptz) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'version',s.revision,'from',f,'to',u,'cutoff',cutoff,'formula','agt-counts-v1')||report_projection(report_facts(w,f,u,cutoff)) from workspace s where s.id=w
$$;
create function report_change(w uuid,a uuid,action text,target uuid,data jsonb) returns uuid
language plpgsql set search_path=agt,pg_catalog set timezone='Asia/Manila' as $$
declare f date; u date; c timestamptz; rev bigint; n integer; ident uuid; previous report_snapshot%rowtype; why text; frozen jsonb;
begin
 f:=(data->>'month')::date;why:=required_text(data->>'note');
 if f is null or extract(day from f)<>1 then raise exception 'Choose first day of reporting month';end if;
 u:=(f+interval '1 month')::date;c:=(data->>'cutoff')::timestamptz;
 if c is null or c<(u::timestamp at time zone 'Asia/Manila') or c>statement_timestamp() then raise exception 'Finalization requires ended month and valid cutoff';end if;
 select * into previous from report_snapshot where workspace_id=w and month_start=f order by report_revision desc limit 1;
 if action='report' then
  if found then raise exception 'Monthly report already finalized';end if;
  n:=1;
 elsif action='report:revise' then
  if not found or previous.id<>target then raise exception 'Revise latest monthly report';end if;
  if c<previous.cutoff then raise exception 'Revision cutoff cannot precede previous cutoff';end if;
  n:=previous.report_revision+1;
 else raise exception 'Unsupported report action';end if;
 select revision into rev from workspace where id=w;
 frozen:=report_facts(w,f,u,c);
 insert into report_snapshot(workspace_id,month_start,report_revision,cutoff,source_revision,actor_id,note,facts,projection)
 values(w,f,n,c,rev,a,why,frozen,report_projection(frozen)) returning id into ident;
 return ident;
end $$;
create function report_detail(w uuid,t uuid) returns jsonb language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('id',r.id,'ticket',null,'kind','report','workspaceId',w,'version',s.revision,'month',r.month_start,'reportRevision',r.report_revision,'cutoff',r.cutoff,'sourceRevision',r.source_revision,'note',r.note,'formula',r.formula,'actorId',r.actor_id,'createdAt',r.created_at)||r.projection
 from report_snapshot r join workspace s on s.id=r.workspace_id where r.workspace_id=w and r.id=t
$$;
create function report_list(w uuid,f date) returns jsonb language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'version',s.revision,'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reportRevision',r.report_revision,'cutoff',r.cutoff,'note',r.note) order by r.report_revision desc) from (select * from report_snapshot where workspace_id=w and month_start=f order by report_revision desc limit 100) r),'[]'::jsonb)) from workspace s where s.id=w
$$;
-- Select latest finalized revision of each month; merge by stable ID, newest
-- included month wins duplicate cohort membership. Review credit merged separately.
create function report_aggregate(w uuid,f date,u date,source_ids uuid[] default null,employee_id uuid default null) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare result jsonb;
begin
 if f is null or u is null or extract(day from f)<>1 or extract(day from u)<>1 or u<=f or u>f+interval '1 year' then raise exception 'Invalid aggregate period';end if;
 with chosen as materialized(select distinct on(month_start) * from report_snapshot where workspace_id=w and month_start>=f and month_start<u and (source_ids is null or id=any(source_ids)) order by month_start,report_revision desc),
 expanded as materialized(select c.month_start,t from chosen c cross join lateral jsonb_array_elements(c.facts->'tasks') t where employee_id is null or t->>'owner'=employee_id::text),
 latest as (select distinct on(t->>'id') t from expanded order by t->>'id',month_start desc),
 due as (select distinct on(t->>'id') t from expanded where (t->>'due')::boolean order by t->>'id',month_start desc),
 first_review as (select distinct on(t->>'id') t from expanded where (t->>'reviewed')::boolean order by t->>'id',month_start desc),
 merged as (select coalesce(d.t,l.t)||jsonb_build_object('due',d.t is not null,'reviewed',r.t is not null,'firstAccepted',coalesce((r.t->>'firstAccepted')::boolean,false)) as row from latest l left join due d on d.t->>'id'=l.t->>'id' left join first_review r on r.t->>'id'=l.t->>'id'),
 coverage as (select distinct on(x->>'id') x from chosen c cross join lateral jsonb_array_elements(c.facts->'coverage') x where employee_id is null or x->>'owner'=employee_id::text order by x->>'id',c.month_start desc),
 labor as (select distinct on(x->>'id') x from chosen c cross join lateral jsonb_array_elements(c.facts->'labor') x where employee_id is null or x->>'employee'=employee_id::text order by x->>'id',c.month_start desc),
 facts as(select jsonb_build_object('tasks',coalesce((select jsonb_agg(row) from merged),'[]'::jsonb),'coverage',coalesce((select jsonb_agg(x) from coverage),'[]'::jsonb),'labor',coalesce((select jsonb_agg(x) from labor),'[]'::jsonb)) as value)
 select jsonb_build_object('workspaceId',w,'version',(select revision from workspace where id=w),'from',f,'to',u,'formula','agt-counts-v1','months',(select coalesce(jsonb_agg(jsonb_build_object('month',month_start,'id',id,'reportRevision',report_revision,'cutoff',cutoff,'sourceRevision',source_revision,'evaluationRoster',(select coalesce(jsonb_agg(x order by x->>'personnelId'),'[]'::jsonb) from jsonb_array_elements(coalesce(chosen.facts->'personnel','[]'::jsonb)) x where employee_id is null or x->>'personnelId'=employee_id::text)) order by month_start),'[]'::jsonb) from chosen),'expectedMonths',(select count(*) from generate_series(f::timestamp,u::timestamp-interval '1 month',interval '1 month')),'duplicateDueCount',(select count(*) from expanded where (t->>'due')::boolean)-(select count(*) from due))||report_projection(value) into result from facts;
 return result;
end $$;

create function report_fact_page(w uuid,t uuid,kind text,after_id text,page_size integer) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare r report_snapshot%rowtype; result jsonb;
begin
 if kind not in ('tasks','coverage','labor') or page_size is null or page_size<1 or page_size>100 then raise exception 'Invalid report fact page';end if;
 select * into r from report_snapshot where workspace_id=w and id=t;
 if not found then raise exception 'Unknown monthly report';end if;
 with page as materialized(select x->>'id' as cursor,x as row from jsonb_array_elements(r.facts->kind) x where after_id is null or x->>'id'>after_id order by 1 limit page_size+1),
 visible as(select * from page order by cursor limit page_size)
 select jsonb_build_object('workspaceId',w,'id',t,'kind',kind,'reportRevision',r.report_revision,'rows',coalesce((select jsonb_agg(row order by cursor) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(cursor) from visible) else null end) into result;
 return result;
end $$;

-- Disposable personnel review domain. Exact immutable reporting sources.
set search_path=agt,pg_catalog;
create table assessment_packet (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 employee_id uuid not null,
 employee_label text not null,
 from_date date not null,
 to_date date not null,
 source_ids uuid[] not null,
 projection jsonb not null,
 created_by uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,id),
 unique(workspace_id,employee_id,from_date,to_date,source_ids),
 foreign key(workspace_id,employee_id) references person(workspace_id,user_id),
 foreign key(workspace_id,created_by) references person(workspace_id,user_id)
);
create table assessment_note (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 packet_id uuid not null,
 actor_id uuid not null,
 actor_label text not null,
 kind text not null check(kind in ('acknowledge','disagree','comment','assessment','exception')),
 note text not null,
 followup text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,packet_id) references assessment_packet(workspace_id,id),
 foreign key(workspace_id,actor_id) references person(workspace_id,user_id)
);
create index assessment_notes_idx on assessment_note(workspace_id,packet_id,id);
create trigger assessment_packet_immutable before update or delete on assessment_packet for each row execute function prevent_report_overwrite();
create trigger assessment_note_immutable before update or delete on assessment_note for each row execute function prevent_report_overwrite();

create function assessment_change(w uuid,a uuid,action text,target uuid,data jsonb) returns uuid
language plpgsql set search_path=agt,pg_catalog as $$
declare f date; u date; emp uuid; sources uuid[]; ident uuid; n integer; p jsonb; note_text text; note_kind text;
begin
 if action='assessment' then
  f:=(data->>'from')::date;u:=(data->>'to')::date;emp:=(data->>'employee')::uuid;
  if f is null or u is null or extract(day from f)<>1 or extract(day from u)<>1 or u not in ((f+interval '1 month')::date,(f+interval '3 months')::date,(f+interval '12 months')::date) then raise exception 'Invalid assessment period';end if;
  if not exists(select 1 from person where workspace_id=w and user_id=emp) then raise exception 'Unknown workforce reference';end if;
  if jsonb_typeof(data->'sources') is distinct from 'array' then raise exception 'Choose finalized report sources';end if;
  if jsonb_array_length(data->'sources') not between 1 and 12 then raise exception 'Choose finalized report sources';end if;
  select array_agg(x::uuid order by x::uuid) into sources from jsonb_array_elements_text(data->'sources') x;
  select count(distinct month_start) into n from report_snapshot where workspace_id=w and id=any(sources) and month_start>=f and month_start<u;
  if n<>cardinality(sources) then raise exception 'Invalid assessment report sources';end if;
  -- A personnel evaluation exclusion is not an operational access restriction.
  -- Use the selected immutable month, never today's mutable assignment.
  if exists(select 1 from report_snapshot where workspace_id=w and id=any(sources) and (frozen_evaluation_participation(facts,emp) in ('excluded','pending') or (exists(select 1 from person where workspace_id=w and user_id=emp and identity_kind='timetracker-intern') and not exists(select 1 from jsonb_array_elements(coalesce(facts->'personnel','[]'::jsonb)) x where x->>'personnelId'=emp::text)))) then
   raise exception 'Selected report includes a month with excluded or pending evaluation participation; retain operational report and select eligible months';
  end if;

  if exists(select 1 from assessment_packet where workspace_id=w and employee_id=emp and from_date=f and to_date=u and source_ids=sources) then raise exception 'Assessment packet already exists';end if;
  p:=report_aggregate(w,f,u,sources,emp);
  insert into assessment_packet(workspace_id,employee_id,employee_label,from_date,to_date,source_ids,projection,created_by)
  values(w,emp,(select display_name from person where workspace_id=w and user_id=emp),f,u,sources,p,a) returning id into ident;
 else
  select id into ident from assessment_packet where workspace_id=w and id=target;
  if not found then raise exception 'Unknown assessment packet';end if;
  note_kind:=split_part(action,':',2);
  if note_kind not in ('acknowledge','disagree','comment','assessment','exception') then raise exception 'Unsupported assessment action';end if;
  note_text:=required_text(data->>'note');
  if note_kind='assessment' then perform required_text(data->>'followup');end if;
  insert into assessment_note(workspace_id,packet_id,actor_id,actor_label,kind,note,followup) values(w,ident,a,(select display_name from person where workspace_id=w and user_id=a),note_kind,note_text,coalesce(data->>'followup',''));
 end if;
 return ident;
end $$;
create function assessment_detail(w uuid,t uuid) returns jsonb language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'id',p.id,'kind','assessment','ticket',null,'version',s.revision,'employeeId',p.employee_id,'employee',p.employee_label,'from',p.from_date,'to',p.to_date,'sources',p.projection->'months','expectedMonths',p.projection->'expectedMonths','counts',p.projection->'counts','formula',p.projection->'formula','workTypes',p.projection->'workTypes','createdAt',p.created_at,
 'response',(select n.kind from assessment_note n where n.workspace_id=w and n.packet_id=p.id and n.kind in ('acknowledge','disagree') order by n.id desc limit 1),
 'assessed',exists(select 1 from assessment_note n where n.workspace_id=w and n.packet_id=p.id and n.kind='assessment'))
 from assessment_packet p join workspace s on s.id=p.workspace_id where p.workspace_id=w and p.id=t
$$;
create function assessment_page(w uuid,after_id uuid,page_size integer,expected_revision bigint) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; out jsonb;
begin
 if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid assessment page';end if;
 select revision into rev from workspace where id=w;
 if not found or (expected_revision is not null and expected_revision<>rev) then raise exception 'Read revision changed';end if;
 with page as materialized(select p.id,assessment_detail(w,p.id) as row from assessment_packet p where p.workspace_id=w and (after_id is null or p.id>after_id) order by p.id limit page_size+1),
 visible as(select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select id from visible order by id desc limit 1) else null end) into out;
 return out;
end $$;
create function assessment_history(w uuid,t uuid,after_id bigint,page_size integer,expected_revision bigint) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; out jsonb;
begin
 if page_size is null or page_size not between 1 and 100 or after_id is null or after_id<0 then raise exception 'Invalid assessment history';end if;
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if not exists(select 1 from assessment_packet where workspace_id=w and id=t) then raise exception 'Unknown assessment packet';end if;
 with page as materialized(select n.id,jsonb_build_object('id',n.id,'kind',n.kind,'actorId',n.actor_id,'actor',n.actor_label,'note',n.note,'followup',n.followup,'at',n.created_at) as row from assessment_note n where n.workspace_id=w and n.packet_id=t and n.id>after_id order by n.id limit page_size+1),
 visible as(select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'id',t,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(id) from visible) else null end) into out;
 return out;
end $$;

-- Disposable read contract. No production migration or exposed RPC.
set search_path=agt,pg_catalog;
create table reference_candidate (
 workspace_id uuid not null references workspace(id),
 id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('person','entity','customer','opportunity','project','po','contract','cost_centre')),
 source_system text not null,
 source_id uuid not null,
 label text not null,
 reason text not null,
 primary key(workspace_id,id),
 unique(workspace_id,kind,source_system,source_id)
);
-- Unresolved candidates are not allocations. No matching by display name.
create view read_records as
 select workspace_id,user_id as id,'people'::text as collection,
 jsonb_build_object('id',user_id,'label',display_name,'detail',department_code,'state','Mapped') as row
 from person
 union all
 select workspace_id,id,'entities',jsonb_build_object('id',id,'label',code,'detail','Business entity','state','Mapped') from entity
 union all
 select workspace_id,id,'customers',jsonb_build_object('id',id,'label',label,'detail',source_system,'state','Mapped') from customer
 union all
 select workspace_id,id,'allocations',jsonb_build_object('id',id,'label',label,'detail',kind,'state',
 case when agt.valid_allocation(workspace_id,id) then 'Allocatable' when kind='project' and active then 'Project reference' else 'Unresolved / inactive' end) from commercial_reference
 union all
 select t.workspace_id,t.id,'tasks',jsonb_build_object('id',t.id,'label',t.title,'detail',k.number,'state',t.status) from task t join ticket k on k.id=t.id
 union all
 select r.workspace_id,r.id,'requests',jsonb_build_object('id',r.id,'label',r.title,'detail',k.number,'state',r.status) from requisition r join ticket k on k.id=r.id
 union all
 select workspace_id,id,'unresolved',jsonb_build_object('id',id,'label',label,'detail',kind||' · '||reason,'state','Unresolved') from reference_candidate;

create function read_page(w uuid, collection_name text, after_id uuid, page_size integer, expected_revision bigint default null)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 if collection_name is null or collection_name not in ('people','entities','customers','allocations','tasks','requests','unresolved')
 or page_size is null or page_size<1 or page_size>100 then raise exception 'Invalid page request'; end if;
 select revision into rev from workspace where id=w;
 if not found then raise exception 'Unknown workspace'; end if;
 if expected_revision is not null and expected_revision<>rev then raise exception 'Read revision changed; restart pagination'; end if;
 with page as materialized (
  select id,row from read_records
  where workspace_id=w and collection=collection_name and (after_id is null or id>after_id)
  order by id limit page_size+1
 ), visible as (
  select id,row from page order by id limit page_size
 )
 select jsonb_build_object('workspaceId',w,'collection',collection_name,'version',rev,
 'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>page_size then (select id from visible order by id desc limit 1) else null end)
 into result;
 return result;
end $$;

-- Disposable task-detail contract; no production migration.
set search_path=agt,pg_catalog;
create function task_detail(w uuid,t uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'version',ws.revision,'id',a.id,'ticket',k.number,
 'workType',a.work_type,'routine',(select jsonb_build_object('templateVersion',o.template_version,'items',(select jsonb_agg(to_jsonb(i) order by i.position) from routine_item i where i.task_id=a.id)) from routine_occurrence o where o.task_id=a.id),'title',a.title,'criteria',a.criteria,'status',a.status,'due',a.due_at,
 'owner',p.display_name,'reviewer',r.display_name,'allocation',c.label,
 'parentId',a.parent_id,'ownerId',a.owner_id,'reviewerId',a.reviewer_id,'originalOwnerId',a.original_owner_id,'originalDepartment',a.original_department,
 'originalDue',a.original_due_at,'reportingDue',a.reporting_due_at,
 'blocker',(select jsonb_build_object('category',b.category,'note',b.note,'resolver',bp.display_name,'followup',b.followup_at)
 from task_blocker b join person bp on bp.workspace_id=b.workspace_id and bp.user_id=b.resolver_id where b.task_id=a.id and b.resolved_at is null),
 'latestSubmission',(select jsonb_build_object('id',s.id,'version',s.version,'summary',s.summary,'evidence',s.evidence)
 from submission s where s.task_id=a.id order by s.version desc limit 1),
 'acceptedSubmission',a.accepted_submission_id)
 from task a join workspace ws on ws.id=a.workspace_id join ticket k on k.id=a.id
 join person p on p.workspace_id=w and p.user_id=a.owner_id
 join person r on r.workspace_id=w and r.user_id=a.reviewer_id
 join commercial_reference c on c.workspace_id=w and c.id=a.allocation_id
 where a.workspace_id=w and a.id=t
$$;
create function submission_page(w uuid,t uuid,after_version integer,page_size integer,expected_revision bigint)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 if page_size is null or page_size<1 or page_size>100 or after_version is null or after_version<0 then raise exception 'Invalid submission page';end if;
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if not exists(select 1 from task where workspace_id=w and id=t) then raise exception 'Unknown task';end if;
 with page as materialized (
 select s.version,jsonb_build_object('id',s.id,'version',s.version,'summary',s.summary,'evidence',s.evidence,'review',r.result,'note',r.note,'checklist',s.checklist_snapshot,'attachments',evidence_manifest(w,t,s.id)) as row
 from submission s left join review r on r.submission_id=s.id
 where s.task_id=t and s.version>after_version order by s.version limit page_size+1
 ), visible as (select * from page order by version limit page_size)
 select jsonb_build_object('workspaceId',w,'taskId',t,'version',rev,'rows',coalesce((select jsonb_agg(row order by version) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>page_size then (select max(version) from visible) else null end) into result;
 return result;
end $$;

create function event_page(w uuid,t uuid,after_id bigint,page_size integer,expected_revision bigint)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 if page_size is null or page_size<1 or page_size>100 or after_id is null or after_id<0 then raise exception 'Invalid event page';end if;
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if not exists(select 1 from task where workspace_id=w and id=t) then raise exception 'Unknown task';end if;
 with page as materialized (
 select e.id,jsonb_build_object('id',e.id,'action',e.action,'detail',e.detail,'at',e.created_at,'actor',p.display_name) as row
 from event e join person p on p.workspace_id=e.workspace_id and p.user_id=e.actor_id
 where e.workspace_id=w and (e.ticket_id=t or e.detail->>'childId'=t::text) and e.id>after_id order by e.id limit page_size+1
 ), visible as (select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'taskId',t,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>page_size then (select max(id) from visible) else null end) into result;
 return result;
end $$;

-- Disposable reference schema only.
set search_path=agt,pg_catalog;
create function request_detail(w uuid,t uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'version',ws.revision,'id',r.id,'ticket',k.number,
 'title',r.title,'criteria',r.criteria,'status',r.status,'requestedDue',r.requested_due,
 'committedDue',r.committed_due,'requesting',r.requesting,'receiving',r.receiving,
 'allocationId',r.allocation_id,'allocation',c.label)
 from requisition r join workspace ws on ws.id=r.workspace_id join ticket k on k.id=r.id
 join commercial_reference c on c.workspace_id=w and c.id=r.allocation_id
 where r.workspace_id=w and r.id=t
$$;
create function request_page(w uuid,t uuid,kind text,after_id text,page_size integer,expected_revision bigint)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 if kind not in ('children','activity') or page_size is null or page_size<1 or page_size>100 then raise exception 'Invalid request page';end if;
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if not exists(select 1 from requisition where workspace_id=w and id=t) then raise exception 'Unknown requisition';end if;
 if kind='children' then
  with page as materialized (
   select a.id::text as cursor,jsonb_build_object('id',a.id,'ticket',k.number,'title',a.title,'status',a.status,'submission',a.accepted_submission_id,'disposition',a.cancelled_disposition) as row
   from task a join ticket k on k.id=a.id where a.workspace_id=w and a.parent_id=t and (after_id is null or a.id>after_id::uuid)
   order by a.id limit page_size+1
  ), visible as (select * from page order by cursor limit page_size)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(row order by cursor) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(cursor) from visible) else null end) into result;
 else
  with page as materialized (
   select e.id,jsonb_build_object('id',e.id,'action',e.action,'detail',e.detail,'at',e.created_at,'actor',p.display_name) as row
   from event e join person p on p.workspace_id=e.workspace_id and p.user_id=e.actor_id
   where e.workspace_id=w and (e.ticket_id=t or e.detail->>'parentId'=t::text) and (after_id is null or e.id>after_id::bigint)
   order by e.id limit page_size+1
  ), visible as (select * from page order by id limit page_size)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(id)::text from visible) else null end) into result;
 end if;
 return result||jsonb_build_object('workspaceId',w,'requestId',t,'version',rev,'kind',kind);
end $$;
create index event_parent_idx on event(workspace_id,(detail->>'parentId'),id);
create index event_child_idx on event(workspace_id,(detail->>'childId'),id);

-- Disposable routine configuration, coverage and generation projection.
set search_path=agt,pg_catalog;
create view routine_records as
 select v.workspace_id,v.id,'template'::text as kind,
 jsonb_build_object('id',v.id,'ticket',null,'kind','template','label',v.title,'templateVersion',v.version,'ownerId',v.owner_id,'owner',p.display_name,'items',v.items,'reviewerId',v.reviewer_id,'allocationId',v.allocation_id) as row
 from (select distinct on(workspace_id,id) * from routine_template order by workspace_id,id,version desc) v
 join person p on p.workspace_id=v.workspace_id and p.user_id=v.owner_id
 union all
 select s.workspace_id,s.id,'schedule',
 jsonb_build_object('id',s.id,'ticket',null,'kind','schedule','label',p.display_name||' · '||s.work_date||' · '||s.shift,'ownerId',s.owner_id,'workDate',s.work_date,'shift',s.shift,'due',s.due_at,'eligibility',s.eligibility,'taskId',o.task_id,
 'coverage',case when o.task_id is not null then 'Generated' when s.eligibility='Scheduled' then 'Coverage gap' else s.eligibility end)
 from routine_schedule s join person p on p.workspace_id=s.workspace_id and p.user_id=s.owner_id
 left join routine_occurrence o on o.schedule_id=s.id;
create function routine_detail(w uuid,t uuid,record_kind text) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select r.row||jsonb_build_object('workspaceId',w,'version',s.revision) from routine_records r join workspace s on s.id=r.workspace_id
 where r.workspace_id=w and r.id=t and r.kind=record_kind
$$;
create function routine_page(w uuid,record_kind text,after_id uuid,page_size integer,expected_revision bigint)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint;result jsonb;
begin
 if record_kind not in ('template','schedule') or page_size is null or page_size<1 or page_size>100 then raise exception 'Invalid routine page';end if;
 select revision into rev from workspace where id=w;
 if not found or (expected_revision is not null and expected_revision<>rev) then raise exception 'Read revision changed';end if;
 with page as materialized (select id,row from routine_records where workspace_id=w and kind=record_kind and (after_id is null or id>after_id) order by id limit page_size+1),
 visible as (select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'kind',record_kind,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>page_size then (select id from visible order by id desc limit 1) else null end) into result;
 return result;
end $$;

set search_path=agt,pg_catalog;
create view labor_records as
 select l.workspace_id,l.id,l.work_date,l.status,l.minutes,
 jsonb_build_object('id',l.id,'ticket',null,'kind','labor','entryVersion',l.version,'taskId',l.task_id,'taskTicket',k.number,'taskTitle',t.title,'workType',t.work_type,
 'employeeId',l.employee_id,'employee',p.display_name,'department',l.department_code,'allocation',l.allocation_snapshot,'date',l.work_date,'minutes',l.minutes,'activity',l.activity,'start',l.start_at,'end',l.end_at,'status',l.status,'reason',l.reason,
 'dailyMinutes',(select coalesce(sum(x.minutes),0) from labor_current x where x.workspace_id=l.workspace_id and x.employee_id=l.employee_id and x.work_date=l.work_date and x.status<>'Returned'),
 'intervalUnverified',l.start_at is null) as row
 from labor_current l join ticket k on k.id=l.task_id join task t on t.id=l.task_id join person p on p.workspace_id=l.workspace_id and p.user_id=l.employee_id;
create function labor_detail(w uuid,t uuid) returns jsonb language sql stable set search_path=agt,pg_catalog as $$
 select r.row||jsonb_build_object('workspaceId',w,'version',s.revision) from labor_records r join workspace s on s.id=r.workspace_id where r.workspace_id=w and r.id=t
$$;
create function labor_page(w uuid,after_id uuid,page_size integer,expected_revision bigint,from_date date,to_date date,approved_only boolean)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint;result jsonb;
begin
 if page_size is null or page_size<1 or page_size>100 or from_date is null or to_date is null or to_date<=from_date or to_date-from_date>366 then raise exception 'Invalid labor period or page';end if;
 select revision into rev from workspace where id=w;
 if not found or (expected_revision is not null and expected_revision<>rev) then raise exception 'Read revision changed';end if;
 with page as materialized(select id,row from labor_records where workspace_id=w and work_date>=from_date and work_date<to_date and (not approved_only or status='Approved') and (after_id is null or id>after_id) order by id limit page_size+1),
 visible as(select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>page_size then (select id from visible order by id desc limit 1) else null end,
 'approvedMinutes',(select coalesce(sum(minutes),0) from labor_current where workspace_id=w and work_date>=from_date and work_date<to_date and status='Approved'))
 into result;
 return result;
end $$;
create function labor_history(w uuid,t uuid,after_version integer,page_size integer,expected_revision bigint)
returns jsonb language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 if page_size is null or page_size<1 or page_size>100 or after_version is null or after_version<0 then raise exception 'Invalid labor history page';end if;
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if not exists(select 1 from labor_entry where workspace_id=w and id=t) then raise exception 'Unknown labor entry';end if;
 with page as materialized(select v.version,jsonb_build_object('entryVersion',v.version,'date',v.work_date,'minutes',v.minutes,'activity',v.activity,'start',v.start_at,'end',v.end_at,'reason',v.reason,'status',coalesce(r.decision,'Submitted'),'reviewNote',r.note,'reviewerId',r.actor_id,'reviewedAt',r.reviewed_at) as row
 from labor_version v left join labor_review r on r.entry_id=v.entry_id and r.version=v.version where v.entry_id=t and v.version>after_version order by v.version limit page_size+1),
 visible as(select * from page order by version limit page_size)
 select jsonb_build_object('workspaceId',w,'id',t,'version',rev,'rows',coalesce((select jsonb_agg(row order by version) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(version) from visible) else null end) into result;
 return result;
end $$;

-- Disposable notification foundation; no scheduler, external mail or new grants.
set search_path=agt,pg_catalog;
create table notification_config (
 workspace_id uuid primary key references workspace(id),
 weekdays integer[] not null,
 holidays date[] not null,
 contacts jsonb not null,
 updated_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,updated_by) references person(workspace_id,user_id)
);
create table notification_digest (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references workspace(id),
 digest_date date not null,
 scheduled_at timestamptz not null,
 captured_at timestamptz not null,
 source_revision bigint not null,
 config jsonb not null,
 created_by uuid not null,
 delivered_at timestamptz,
 delivered_by uuid,
 unique(workspace_id,id),
 unique(workspace_id,digest_date),
 foreign key(workspace_id,created_by) references person(workspace_id,user_id),
 foreign key(workspace_id,delivered_by) references person(workspace_id,user_id)
);
create table notification_item (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 digest_id uuid not null,
 ticket_id uuid not null,
 kind text not null,
 recipient_id uuid,
 recipient_label text,
 department_code text,
 title text not null,
 ticket_number text not null,
 anchor_at timestamptz not null,
 context jsonb not null,
 read_at timestamptz,
 read_by uuid,
 unique(digest_id,ticket_id,kind),
 foreign key(workspace_id,digest_id) references notification_digest(workspace_id,id),
 foreign key(workspace_id,ticket_id) references ticket(workspace_id,id),
 foreign key(workspace_id,recipient_id) references person(workspace_id,user_id),
 foreign key(department_code) references department(code),
 foreign key(workspace_id,read_by) references person(workspace_id,user_id)
);
create index notification_inbox_idx on notification_item(workspace_id,recipient_id,digest_id,id);
create function notification_settings(w uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select coalesce((select jsonb_build_object('weekdays',weekdays,'holidays',holidays,'contacts',contacts,'configured',true,'updatedAt',updated_at,'updatedBy',updated_by) from notification_config where workspace_id=w),
 '{"weekdays":[1,2,3,4,5],"holidays":[],"contacts":{},"configured":false}'::jsonb)
$$;
-- Count completed working dates after submission date, including current date
-- only strictly after the same Manila clock time. Explicit holidays are excluded.
create function notification_workdays(start_at timestamptz,end_at timestamptz,days integer[],holidays date[]) returns integer
language sql stable set search_path=agt,pg_catalog as $$
 select count(*)::integer from generate_series((start_at at time zone 'Asia/Manila')::date+1,
 (end_at at time zone 'Asia/Manila')::date,interval '1 day') d
 where extract(isodow from d)::integer=any(days) and not (d::date=any(holidays))
 and (d::date+(start_at at time zone 'Asia/Manila')::time) at time zone 'Asia/Manila'<end_at
$$;
-- Current-state selection only. The as_of argument is internal/testable, not
-- a historical reconstruction API. Host preview/generate always use server now.
create function notification_candidates(w uuid,as_of timestamptz,cfg jsonb)
returns table(ticket_id uuid,kind text,recipient_id uuid,department_code text,title text,ticket_number text,anchor_at timestamptz,context jsonb)
language sql stable set search_path=agt,pg_catalog as $$
 with cal as (select array(select x::integer from jsonb_array_elements_text(cfg->'weekdays') x) days,array(select x::date from jsonb_array_elements_text(cfg->'holidays') x) holidays),
 task_rows as (
 select t.*,k.number from task t join ticket k on k.id=t.id where t.workspace_id=w and k.created_at<=as_of
 ), req_rows as (
 select r.*,k.number from requisition r join ticket k on k.id=r.id where r.workspace_id=w and k.created_at<=as_of
 ), requests as (
 select r.*,case when r.status in ('Clarification Needed','For Requester Acceptance') then r.requesting else r.receiving end dept,
 case when r.status='Submitted' then 'request-response' when r.status='Clarification Needed' then 'request-clarification' when r.status='For Requester Acceptance' then 'request-acceptance' when r.committed_due<as_of then 'request-overdue' else 'request-upcoming' end reason,
 case when r.status in ('Submitted','Clarification Needed','For Requester Acceptance') then coalesce(e.created_at,(select created_at from ticket where id=r.id)) else r.committed_due end anchor
 from req_rows r left join lateral(select created_at from event where workspace_id=w and ticket_id=r.id and action in ('request:submit','request:resubmit','request:clarify','request:deliver') and created_at<=as_of order by id desc limit 1)e on true
 where r.status in ('Submitted','Clarification Needed','For Requester Acceptance') or (r.status in ('Accepted','Assigned','In Progress') and r.committed_due is not null and (r.committed_due at time zone 'Asia/Manila')::date<=(as_of at time zone 'Asia/Manila')::date+2)
 )
 select t.id,case when t.due_at<as_of then 'task-overdue' else 'task-upcoming' end,t.owner_id,null::text,t.title,t.number,t.due_at,jsonb_build_object('status',t.status)
 from task_rows t where t.status in ('Assigned','In Progress','Blocked') and (t.due_at at time zone 'Asia/Manila')::date<=(as_of at time zone 'Asia/Manila')::date+2
 union all
 select t.id,'blocker-followup',b.resolver_id,null::text,t.title,t.number,b.followup_at,jsonb_build_object('blockerId',b.id,'status',t.status)
 from task_rows t join task_blocker b on b.task_id=t.id and b.workspace_id=w and b.resolved_at is null where t.status='Blocked' and b.created_at<=as_of and b.followup_at<=as_of
 union all
 select t.id,'review-wait',t.reviewer_id,null::text,t.title,t.number,s.submitted_at,jsonb_build_object('submissionId',s.id,'workingDays',notification_workdays(s.submitted_at,as_of,cal.days,cal.holidays))
 from task_rows t cross join cal join lateral(select * from submission where task_id=t.id and submitted_at<=as_of order by version desc limit 1)s on true
 where t.status='For Review' and not exists(select 1 from review where submission_id=s.id) and notification_workdays(s.submitted_at,as_of,cal.days,cal.holidays)>=2
 union all
 select r.id,r.reason,p.user_id,r.dept,r.title,r.number,r.anchor,jsonb_build_object('status',r.status,'department',r.dept)
 from requests r left join person p on p.workspace_id=w and p.user_id::text=cfg->'contacts'->>r.dept and p.department_code=r.dept
$$;
create function notification_change(w uuid,a uuid,action text,target uuid,data jsonb) returns uuid
language plpgsql set search_path=agt,pg_catalog as $$
declare cfg jsonb; days integer[]; holidays date[]; contacts jsonb; ident uuid; d notification_digest%rowtype; now_at timestamptz:=clock_timestamp(); today date; n bigint;
begin
 if action='notification:configure' then
  if target is distinct from w or jsonb_typeof(data->'weekdays') is distinct from 'array' or jsonb_typeof(data->'holidays') is distinct from 'array' or jsonb_typeof(data->'contacts') is distinct from 'object' then raise exception 'Invalid notification configuration';end if;
  if jsonb_array_length(data->'weekdays') not between 1 and 7 or jsonb_array_length(data->'holidays')>366 then raise exception 'Invalid notification calendar';end if;
  if exists(select 1 from jsonb_array_elements(data->'weekdays') x where jsonb_typeof(x)<>'number' or x#>>'{}' !~ '^[1-7]$') or exists(select 1 from jsonb_array_elements(data->'holidays') x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid notification calendar';end if;
  select array_agg(x::integer order by x::integer) into days from jsonb_array_elements_text(data->'weekdays') x;
  begin select coalesce(array_agg(x::date order by x::date),'{}'::date[]) into holidays from jsonb_array_elements_text(data->'holidays') x;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid notification calendar';end;
  if exists(select 1 from unnest(days) x where x is null or x not between 1 and 7) or cardinality(days)<>(select count(distinct x) from unnest(days) x) or cardinality(holidays)<>(select count(distinct x) from unnest(holidays) x) then raise exception 'Invalid notification calendar';end if;
  contacts:=data->'contacts';
  if exists(select 1 from jsonb_each_text(contacts) x where not exists(select 1 from person p where p.workspace_id=w and p.department_code=x.key and p.user_id::text=x.value)) then raise exception 'Invalid department contact';end if;
  insert into notification_config(workspace_id,weekdays,holidays,contacts,updated_by) values(w,days,holidays,contacts,a)
  on conflict(workspace_id) do update set weekdays=excluded.weekdays,holidays=excluded.holidays,contacts=excluded.contacts,updated_by=a,updated_at=now_at;
  return w;
 elsif action='notification-digest' then
  today:=(now_at at time zone 'Asia/Manila')::date;
  if (now_at at time zone 'Asia/Manila')::time<time '08:00' then raise exception 'Daily digest is scheduled at 08:00 Manila';end if;
  select id into ident from notification_digest where workspace_id=w and digest_date=today;
  if found then return ident;end if;
  cfg:=notification_settings(w);
  insert into notification_digest(workspace_id,digest_date,scheduled_at,captured_at,source_revision,config,created_by)
  values(w,today,(today+time '08:00') at time zone 'Asia/Manila',now_at,(select revision from workspace where id=w),cfg,a) returning id into ident;
  insert into notification_item(workspace_id,digest_id,ticket_id,kind,recipient_id,recipient_label,department_code,title,ticket_number,anchor_at,context)
  select w,ident,c.ticket_id,c.kind,c.recipient_id,p.display_name,c.department_code,c.title,c.ticket_number,c.anchor_at,c.context from notification_candidates(w,now_at,cfg)c left join person p on p.workspace_id=w and p.user_id=c.recipient_id;
  return ident;
 else
  select * into d from notification_digest where workspace_id=w and id=target;
  if not found then raise exception 'Unknown notification digest';end if;
  if action='notification:deliver' then
   update notification_digest set delivered_at=now_at,delivered_by=a where id=target and delivered_at is null;
  elsif action='notification:read' then
   if d.delivered_at is null then raise exception 'Deliver digest before recording read';end if;
   if jsonb_typeof(data->'item') is distinct from 'number' or data->>'item' !~ '^[0-9]{1,15}$' then raise exception 'Unknown routed notification';end if;
  n:=(data->>'item')::bigint;
   if not exists(select 1 from notification_item where workspace_id=w and digest_id=target and id=n and recipient_id is not null) then raise exception 'Unknown routed notification';end if;
   update notification_item set read_at=now_at,read_by=a where id=n and read_at is null;
  else raise exception 'Unsupported notification action';end if;
  return target;
 end if;
end $$;
create function notification_detail(w uuid,t uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 select jsonb_build_object('workspaceId',w,'id',t,'ticket',null,'kind','notification','version',s.revision,'config',notification_settings(w))
 from workspace s where s.id=w and t=w
 union all
 select jsonb_build_object('workspaceId',w,'id',d.id,'ticket',null,'kind','notification','version',s.revision,'date',d.digest_date,'scheduledAt',d.scheduled_at,'capturedAt',d.captured_at,'sourceRevision',d.source_revision,'config',d.config,'deliveredAt',d.delivered_at,'deliveredBy',d.delivered_by,
 'count',(select count(*) from notification_item where digest_id=d.id),'unresolved',(select count(*) from notification_item where digest_id=d.id and recipient_id is null))
 from notification_digest d join workspace s on s.id=d.workspace_id where d.workspace_id=w and d.id=t
$$;
create function notification_preview(w uuid) returns jsonb
language sql stable set search_path=agt,pg_catalog as $$
 with clock as(select statement_timestamp() at time zone 'Asia/Manila' local_now,statement_timestamp() at), cfg as(select notification_settings(w) value), candidates as materialized(select c.* from clock,cfg,notification_candidates(w,clock.at,cfg.value)c)
 select jsonb_build_object('workspaceId',w,'version',s.revision,'date',clock.local_now::date,'asOf',clock.at,'ready',clock.local_now::time>=time '08:00','existingId',(select id from notification_digest where workspace_id=w and digest_date=clock.local_now::date),'count',(select count(*) from candidates),'unresolved',(select count(*) from candidates where recipient_id is null),'groups',coalesce((select jsonb_object_agg(kind,n) from (select kind,count(*) n from candidates group by kind) g),'{}'::jsonb),'config',cfg.value)
 from workspace s,clock,cfg where s.id=w
$$;
create function notification_list(w uuid,after_date date,page_size integer,expected_revision bigint) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 select revision into rev from workspace where id=w;
 if not found or (expected_revision is not null and expected_revision<>rev) then raise exception 'Read revision changed';end if;
 if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid notification page';end if;
 with page as materialized(select d.digest_date,notification_detail(w,d.id) row from notification_digest d where d.workspace_id=w and (after_date is null or d.digest_date<after_date) order by d.digest_date desc limit page_size+1), visible as(select * from page order by digest_date desc limit page_size)
 select jsonb_build_object('workspaceId',w,'version',rev,'rows',coalesce((select jsonb_agg(row order by digest_date desc) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select min(digest_date) from visible) else null end) into result;
 return result;
end $$;
create function notification_page(w uuid,t uuid,after_id bigint,page_size integer,expected_revision bigint) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint; result jsonb;
begin
 select revision into rev from workspace where id=w;
 if not found or rev is distinct from expected_revision then raise exception 'Read revision changed';end if;
 if after_id is null or after_id<0 or page_size is null or page_size not between 1 and 100 then raise exception 'Invalid notification page';end if;
 if not exists(select 1 from notification_digest where workspace_id=w and id=t) then raise exception 'Unknown notification digest';end if;
 with page as materialized(select i.id,jsonb_build_object('id',i.id,'ticketId',i.ticket_id,'kind',i.kind,'recipientId',i.recipient_id,'recipient',i.recipient_label,'department',i.department_code,'title',i.title,'ticket',i.ticket_number,'anchorAt',i.anchor_at,'context',i.context,'readAt',i.read_at,'readBy',i.read_by) row from notification_item i where i.workspace_id=w and i.digest_id=t and i.id>after_id order by i.id limit page_size+1), visible as(select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'id',t,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(id) from visible) else null end) into result;
 return result;
end $$;

-- Local canonical recipient inbox. Explicit publish uses existing digest
-- delivery transaction; no duplicate outbox, email or background scheduler.
set search_path=agt,pg_catalog;
create function notification_inbox(w uuid,a uuid,after_id bigint,page_size integer,expected_revision bigint default null) returns jsonb
language plpgsql stable set search_path=agt,pg_catalog as $$
declare rev bigint;result jsonb;
begin
 select revision into rev from workspace where id=w;
 if not found or (expected_revision is not null and expected_revision<>rev) then raise exception 'Read revision changed';end if;
 if after_id is null or after_id<0 or page_size is null or page_size not between 1 and 100 then raise exception 'Invalid inbox page';end if;
 with page as materialized(
  select i.id,jsonb_build_object('id',i.id,'digestId',i.digest_id,'ticketId',i.ticket_id,'ticket',i.ticket_number,'title',i.title,'kind',i.kind,'recipientId',i.recipient_id,'deliveredAt',d.delivered_at,'readAt',i.read_at) row
  from notification_item i join notification_digest d on d.workspace_id=i.workspace_id and d.id=i.digest_id
  where i.workspace_id=w and i.recipient_id=a and d.delivered_at is not null and i.id>after_id order by i.id limit page_size+1
 ),visible as(select * from page order by id limit page_size)
 select jsonb_build_object('workspaceId',w,'recipientId',a,'version',rev,'rows',coalesce((select jsonb_agg(row order by id) from visible),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>page_size then (select max(id) from visible) else null end) into result;
 return result;
end $$;

reset search_path;
revoke all on schema agt from public,anon,authenticated,service_role;
revoke all on all tables in schema agt from public,anon,authenticated,service_role;
revoke all on all sequences in schema agt from public,anon,authenticated,service_role;
revoke all on all functions in schema agt from public,anon,authenticated,service_role;
-- CP-AGT-19A.2: server-derived initial workforce activation.
-- No client-supplied identities, department overrides or actor impersonation.
create function private.agt_activate_workforce_v1(expected_revision text)
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
 case when e.role='OJT' or e.shared_id is not null or dept->>'label'='OJT' then 'OJT_PENDING'
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
 'capabilities',jsonb_build_object('scope','workforce-only','organizationPolicy',jsonb_build_object('contract','agt-organization-v1'),'progressiveWorkforce',jsonb_build_object('contract','agt-progressive-workforce-v1')),
 'profiles',(select jsonb_agg(jsonb_build_object('workspaceId',w,'id',u->>'id','label',u->>'displayName','status',u->>'status')) from jsonb_array_elements(capture->'data'->'team'->'users')u),
 'members',(select jsonb_agg(jsonb_build_object('workspaceId',w,'userId',u->>'id','active',true)) from jsonb_array_elements(capture->'data'->'team'->'users')u),
 'employees',(select jsonb_agg(jsonb_build_object('workspaceId',w,'id',x->>'id','authUserId',x->>'auth_id','sharedUserId',x->>'shared_id','label',x->>'label','active',true,'sourceRole',x->>'role','sourceSystem',case when x->>'shared_id' is null then 'time-tracker' else 'time-tracker-ojt' end)) from jsonb_array_elements(rows)x),
 'sourceDepartments',capture->'data'->'departments',
 'assignments',(select jsonb_agg(jsonb_build_object('workspaceId',w,'userId',aa->>'userId','departmentId',d->>'id','active',true)) from jsonb_array_elements(capture->'data'->'assignments'->'assignments')aa join jsonb_array_elements(capture->'data'->'departments')d on d->>'label'=aa->>'department'),
 'departmentLinks',(select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'sourceId',d.dept_id,'target',d.reporting,'confirmed',true,'sourceRevision',rev,'evidenceRef','CP-AGT-17B:user-organizational-decisions:2026-11-24')),'[]'::jsonb) from (select distinct x->>'dept_id' dept_id,x->>'reporting' reporting from jsonb_array_elements(rows)x where x->>'reporting'<>'OJT_PENDING')d),
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
-- Activation uses the existing signed workforce capture admission.
revoke all on function private.agt_activate_workforce_v1(text) from public,anon,authenticated,service_role;

create function private.agt_workforce_readback_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb; w uuid; r uuid; v text;
begin
 c:=private.agt_workforce_capture_v1();
 w:=(c->>'workspaceId')::uuid;
 if w is distinct from '00000000-0000-4000-8000-000000000001'::uuid or c->>'userId' is distinct from auth.uid()::text or auth.uid() is null then
  raise exception 'Workforce scope unavailable' using errcode='42501';
 end if;
 select review_id,source_revision into r,v from agt.crm_source_review where workspace_id=w order by review_revision desc limit 1;
 return jsonb_build_object('workspaceId',w,'sourceRevision',v,'currentSourceRevision',c->>'sourceRevision','reviewId',r,
 'personnel',(select count(*) from agt.person where workspace_id=w),
 'classifications',(select count(*) from agt.personnel_classification where workspace_id=w and source_review_id=r),
 'reportingDepartments',coalesce((select jsonb_object_agg(department_code,n) from (select department_code,count(*) n from agt.person where workspace_id=w group by department_code)d),'{}'::jsonb),
 'identityDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(p.user_id,p.department_code,p.identity_kind,p.shared_login_id) order by p.user_id)::text,'[]'),'UTF8')),'hex') from agt.person p where p.workspace_id=w));
end $$;
create function public.agt_activate_workforce_v1(expected_revision text)
returns jsonb language sql security invoker set search_path='' as $$select private.agt_activate_workforce_v1(expected_revision)$$;
create function public.agt_workforce_readback_v1()
returns jsonb language sql stable security invoker set search_path='' as $$select private.agt_workforce_readback_v1()$$;
revoke all on function private.agt_workforce_readback_v1(),public.agt_activate_workforce_v1(text),public.agt_workforce_readback_v1() from public,anon,authenticated,service_role;
grant execute on function private.agt_activate_workforce_v1(text),private.agt_workforce_readback_v1(),public.agt_activate_workforce_v1(text),public.agt_workforce_readback_v1() to authenticated;
notify pgrst,'reload schema';
;
