-- CP-DDA-FE-03A candidate: internal transaction contract only.
-- Not an automatically deployed migration. Host authentication and workspace
-- authorization must be resolved before any public wrapper is introduced.
create schema dda;
revoke all on schema dda from public;

create table dda.workspace_state (
  workspace_id uuid primary key references agt.workspace(id),
  revision bigint not null default 0 check (revision >= 0)
);
create table dda.category (
  workspace_id uuid not null references dda.workspace_state(workspace_id),
  id uuid not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  primary key (workspace_id,id)
);
create unique index dda_category_name_idx on dda.category(workspace_id,lower(name));
create table dda.activity (
  workspace_id uuid not null references dda.workspace_state(workspace_id),
  id uuid not null,
  person_id uuid not null,
  department_id text not null references agt.department(code),
  activity_date date not null,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 160),
  details text not null check (char_length(details) <= 2000),
  status text not null check (status in ('Pending','In Progress','Completed')),
  category_id uuid,
  primary key (workspace_id,id),
  foreign key (workspace_id,person_id) references agt.person(workspace_id,user_id),
  foreign key (workspace_id,category_id) references dda.category(workspace_id,id)
);
create index dda_activity_date_idx on dda.activity(workspace_id,activity_date,person_id);
create table dda.command_receipt (
  workspace_id uuid not null references dda.workspace_state(workspace_id),
  request_id uuid not null,
  command jsonb not null,
  committed_revision bigint,
  rejection_reason text,
  check ((committed_revision is null) <> (rejection_reason is null)),
  primary key (workspace_id,request_id)
);
create table dda.activity_event (
  workspace_id uuid not null,
  request_id uuid not null,
  record_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('save-activity','delete-activity','save-category')),
  before_record jsonb,
  after_record jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,request_id),
  foreign key (workspace_id,request_id) references dda.command_receipt(workspace_id,request_id)
);

create function dda.activity_json(a dda.activity) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',a.id,'personId',a.person_id,'departmentId',a.department_id,
    'date',to_char(a.activity_date,'YYYY-MM-DD'),'title',a.title,'details',a.details,
    'status',a.status,'categoryId',a.category_id)
$$;

create function dda.snapshot(w uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'workspaceId',w,
    'revision',coalesce((select revision from dda.workspace_state where workspace_id=w),0),
    'directory',jsonb_build_object(
      'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.code,'name',d.name) order by d.name,d.code)
        from agt.department d),'[]'::jsonb),
      'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.display_name,'departmentId',p.department_code) order by p.display_name,p.user_id)
        from agt.person p where p.workspace_id=w),'[]'::jsonb)),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id)
      from dda.category c where c.workspace_id=w),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(dda.activity_json(a) order by a.activity_date desc,a.id)
      from dda.activity a where a.workspace_id=w),'[]'::jsonb))
  from agt.workspace where id=w
$$;

-- The trusted host must supply the authenticated actor, never a client actor ID.
-- All writes are serialized per workspace. Receipts are checked before revisions
-- so retrying the exact command cannot duplicate a successful write.
create function dda.mutate(w uuid, actor uuid, request_key uuid, expected bigint, action text, record jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  rev bigint;
  input jsonb;
  receipt dda.command_receipt%rowtype;
  previous dda.activity%rowtype;
  updated dda.activity%rowtype;
  cat dda.category%rowtype;
  record_id uuid;
  person_id uuid;
  department_id text;
  activity_date date;
  before_value jsonb;
  after_value jsonb;
begin
  if w is null or actor is null or request_key is null or expected is null or expected<0 or
     action is null or jsonb_typeof(record) is distinct from 'object' then
    raise exception 'Invalid DDA command';
  end if;
  -- The signed RPC boundary supplies the authenticated CRM actor.
  -- Activity subjects, unlike actors, must exist in the workforce directory.
  insert into dda.workspace_state(workspace_id) values(w) on conflict do nothing;
  select revision into strict rev from dda.workspace_state where workspace_id=w for update;
  input:=jsonb_build_object('actor',actor,'expectedRevision',expected,'action',action,'record',record);
  select * into receipt from dda.command_receipt where workspace_id=w and request_id=request_key;
  if found then
    if receipt.command<>input then raise exception 'DDA request ID reused with different input'; end if;
    if receipt.rejection_reason is not null then raise exception 'DDA command already rejected'; end if;
    return dda.snapshot(w)||jsonb_build_object('acknowledgedRequestId',request_key,'acknowledgedRevision',receipt.committed_revision,'replayed',true);
  end if;
  if rev<>expected then raise exception 'DDA revision conflict'; end if;
  record_id:=(record->>'id')::uuid;
  if record_id is null then raise exception 'Missing DDA record ID'; end if;

  if action='save-activity' then
    select * into previous from dda.activity a where a.workspace_id=w and a.id=record_id;
    person_id:=(record->>'personId')::uuid;
    activity_date:=(record->>'date')::date;
    if activity_date is null or to_char(activity_date,'YYYY-MM-DD') is distinct from record->>'date' then
      raise exception 'Invalid DDA activity date';
    end if;
    if previous.id is not null then
      if previous.person_id is distinct from person_id or previous.activity_date is distinct from activity_date then
        raise exception 'DDA activity identity and date cannot change';
      end if;
      department_id:=previous.department_id;
      before_value:=dda.activity_json(previous);
    else
      select p.department_code into strict department_id from agt.person p where p.workspace_id=w and p.user_id=person_id;
    end if;
    if department_id is distinct from record->>'departmentId' then raise exception 'DDA department mismatch'; end if;
    insert into dda.activity(workspace_id,id,person_id,department_id,activity_date,title,details,status,category_id)
      values(w,record_id,person_id,department_id,activity_date,btrim(record->>'title'),btrim(coalesce(record->>'details','')),
        record->>'status',nullif(record->>'categoryId','')::uuid)
      on conflict (workspace_id,id) do update set title=excluded.title,details=excluded.details,status=excluded.status,category_id=excluded.category_id
      returning * into updated;
    after_value:=dda.activity_json(updated);
  elsif action='delete-activity' then
    delete from dda.activity a where a.workspace_id=w and a.id=record_id returning * into previous;
    if not found then raise exception 'DDA activity not found'; end if;
    before_value:=dda.activity_json(previous);
  elsif action='save-category' then
    select * into cat from dda.category c where c.workspace_id=w and c.id=record_id;
    if found then before_value:=jsonb_build_object('id',cat.id,'name',cat.name); end if;
    insert into dda.category(workspace_id,id,name) values(w,record_id,btrim(record->>'name'))
      on conflict (workspace_id,id) do update set name=excluded.name returning * into cat;
    after_value:=jsonb_build_object('id',cat.id,'name',cat.name);
  else
    raise exception 'Unknown DDA command';
  end if;
  rev:=rev+1;
  update dda.workspace_state set revision=rev where workspace_id=w;
  insert into dda.command_receipt(workspace_id,request_id,command,committed_revision) values(w,request_key,input,rev);
  insert into dda.activity_event(workspace_id,request_id,record_id,actor_id,action,before_record,after_record)
    values(w,request_key,record_id,actor,action,before_value,after_value);
  return dda.snapshot(w)||jsonb_build_object('acknowledgedRequestId',request_key,'acknowledgedRevision',rev,'replayed',false);
end $$;

-- Terminal outcomes are recorded atomically for both accepted and rejected commands.
-- The future signed host wrapper must derive actor from its existing session.
create function dda.submit(w uuid, actor uuid, request_key uuid, expected bigint, action text, record jsonb)
returns jsonb language plpgsql set search_path='' as $submit$
declare
  input jsonb;
  receipt dda.command_receipt%rowtype;
  reason text;
begin
  if w is null or actor is null or request_key is null or expected is null or expected<0 or
     action is null or jsonb_typeof(record) is distinct from 'object' then
    raise exception 'Invalid DDA command';
  end if;
  -- The signed RPC boundary supplies the authenticated CRM actor.
  -- Activity subjects, unlike actors, must exist in the workforce directory.
  insert into dda.workspace_state(workspace_id) values(w) on conflict do nothing;
  perform 1 from dda.workspace_state where workspace_id=w for update;
  input:=jsonb_build_object('actor',actor,'expectedRevision',expected,'action',action,'record',record);
  select * into receipt from dda.command_receipt where workspace_id=w and request_id=request_key;
  if found then
    if receipt.command<>input then raise exception 'DDA request ID reused with different input'; end if;
    if receipt.rejection_reason is not null then
      return dda.snapshot(w)||jsonb_build_object('rejectedRequestId',request_key,'rejectionReason',receipt.rejection_reason,'replayed',true);
    end if;
    return dda.mutate(w,actor,request_key,expected,action,record);
  end if;
  begin
    return dda.mutate(w,actor,request_key,expected,action,record);
  exception
    when unique_violation then reason:='Duplicate record or category.';
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation
      or datetime_field_overflow or invalid_datetime_format or no_data_found then reason:='Invalid activity data or reference.';
    when raise_exception then
      if sqlerrm='DDA revision conflict' then reason:='Activity data changed. Review the latest records before saving again.';
      elsif sqlerrm in ('Missing DDA record ID','Invalid DDA activity date','DDA activity identity and date cannot change','DDA department mismatch','DDA activity not found','Unknown DDA command') then
        reason:=sqlerrm;
      else raise;
      end if;
  end;
  insert into dda.command_receipt(workspace_id,request_id,command,rejection_reason) values(w,request_key,input,reason);
  return dda.snapshot(w)||jsonb_build_object('rejectedRequestId',request_key,'rejectionReason',reason,'replayed',false);
end $submit$;

revoke all on all tables in schema dda from public;
revoke all on all functions in schema dda from public;
