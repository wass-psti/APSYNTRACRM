create schema if not exists private;

create table if not exists public.tool_traceability_memberships(
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in('ADMIN','LOGISTICS','USER','VIEWER')),
  enabled boolean not null default true,
  status text not null default 'active' check(status in('active','disabled')),
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);

create table if not exists public.tool_traceability_tools(
  id text primary key default ('tt-tool-'||gen_random_uuid()::text),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 300),
  item_type text not null default 'Tool' check(item_type in('Tool','Equipment')),
  category text,
  availability text not null default 'Available' check(availability in('Available','Pending Approval','In Use','Returned')),
  assigned_to jsonb not null default '[]'::jsonb,
  team_leader jsonb not null default '[]'::jsonb,
  current_request_id text,
  stock_quantity integer not null default 1 check(stock_quantity>=0),
  borrowed_quantity integer not null default 0 check(borrowed_quantity>=0),
  payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  creator_user_id uuid not null references public.profiles(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,id)
);

create table if not exists public.tool_traceability_requests(
  id text primary key default ('tt-req-'||gen_random_uuid()::text),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference text not null,
  name text not null check(char_length(name) between 1 and 500),
  request_status text not null default 'Pending Approval' check(request_status in('Pending Approval','Borrowed','Returned','Rejected')),
  extension_state text not null default 'None' check(extension_state in('None','Extension Requested','Extension Approved','Extension Denied')),
  borrow_from date, borrow_to date, actual_return date,
  team_members jsonb not null default '[]'::jsonb,
  team_leader jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  creator_user_id uuid not null references public.profiles(id),
  version bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,reference)
);

create table if not exists public.tool_traceability_request_tools(
  workspace_id uuid not null,
  request_id text not null,
  tool_id text not null,
  quantity integer not null default 1 check(quantity>0),
  returned_at timestamptz,
  primary key(workspace_id,request_id,tool_id),
  foreign key(workspace_id,request_id) references public.tool_traceability_requests(workspace_id,id) on delete cascade,
  foreign key(workspace_id,tool_id) references public.tool_traceability_tools(workspace_id,id) on delete restrict
);

create table if not exists public.tool_traceability_updates(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, request_id text not null,
 creator_user_id uuid not null references public.profiles(id), text_body text not null check(char_length(text_body) between 1 and 8000), created_at timestamptz not null default now(),
 foreign key(workspace_id,request_id) references public.tool_traceability_requests(workspace_id,id) on delete cascade
);
create table if not exists public.tool_traceability_attachments(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, request_id text not null, update_id uuid references public.tool_traceability_updates(id) on delete set null,
 storage_path text not null unique, name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760), creator_user_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,request_id) references public.tool_traceability_requests(workspace_id,id) on delete cascade
);
create table if not exists public.tool_traceability_activity(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 entity_type text not null check(entity_type in('tool','request','inventory','membership','state')), entity_id text, actor_user_id uuid references public.profiles(id),
 event_type text not null, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.tool_traceability_state(
 workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid, key text not null, value jsonb, version bigint not null default 0, updated_at timestamptz not null default now(),
 primary key(workspace_id,key,user_id)
);
create table if not exists public.tool_traceability_reference_counters(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade, value bigint not null default 0 check(value>=0), updated_at timestamptz not null default now()
);

create index if not exists tt_tools_ws_availability_idx on public.tool_traceability_tools(workspace_id,availability,name);
create index if not exists tt_requests_ws_status_idx on public.tool_traceability_requests(workspace_id,request_status,created_at desc);
create index if not exists tt_activity_entity_idx on public.tool_traceability_activity(workspace_id,entity_type,entity_id,created_at desc);

insert into public.tool_traceability_memberships(workspace_id,user_id,role,enabled,status)
select wm.workspace_id,wm.user_id,'ADMIN',true,'active' from public.workspace_members wm join public.profiles p on p.id=wm.user_id and p.status='active'
where wm.active=true and lower(p.platform_role) in('admin','administrator','general manager','general_manager') on conflict do nothing;;
