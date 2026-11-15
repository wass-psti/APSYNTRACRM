create schema if not exists private;

create table if not exists public.material_tracker_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('ADMIN','USER','VIEWER')),
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','disabled')),
  assigned_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.material_tracker_materials (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null default ('mt-' || gen_random_uuid()::text),
  name text not null,
  group_id text not null default 'new_group',
  group_title text not null default 'Engineering Services',
  payload jsonb not null default '{}'::jsonb,
  creator_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id),
  primary key (workspace_id,id)
);
create index if not exists material_tracker_materials_active_idx on public.material_tracker_materials(workspace_id,archived_at,created_at desc);
create index if not exists material_tracker_materials_source_idx on public.material_tracker_materials(workspace_id,((payload->>'sourceType')));

create table if not exists public.material_tracker_tasks (
  workspace_id uuid not null,
  material_id text not null,
  id text not null default ('task-' || gen_random_uuid()::text),
  name text not null,
  status text not null default 'Working on it',
  due_date date null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,material_id,id),
  foreign key (workspace_id,material_id) references public.material_tracker_materials(workspace_id,id) on delete cascade
);

create table if not exists public.material_tracker_activity (
  workspace_id uuid not null,
  material_id text not null,
  id text not null default ('act-' || gen_random_uuid()::text),
  text text not null,
  actor_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id,material_id,id),
  foreign key (workspace_id,material_id) references public.material_tracker_materials(workspace_id,id) on delete cascade
);
create index if not exists material_tracker_activity_order_idx on public.material_tracker_activity(workspace_id,material_id,created_at desc);

create table if not exists public.material_tracker_comments (
  workspace_id uuid not null,
  material_id text not null,
  id text not null default ('cmt-' || gen_random_uuid()::text),
  text text not null,
  author_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null,
  primary key (workspace_id,material_id,id),
  foreign key (workspace_id,material_id) references public.material_tracker_materials(workspace_id,id) on delete cascade
);
create index if not exists material_tracker_comments_order_idx on public.material_tracker_comments(workspace_id,material_id,created_at);

create table if not exists public.material_tracker_notifications (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  material_id text null,
  message text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  primary key (workspace_id,id)
);

create table if not exists public.material_tracker_forex_rates (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  usd numeric null,
  eur numeric null,
  updated_by uuid null references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_tracker_daily_metrics (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_date date not null,
  item_count integer not null default 0,
  recorded_at timestamptz not null default now(),
  primary key (workspace_id,metric_date)
);

create table if not exists public.material_tracker_user_state (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_key text not null,
  value jsonb null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id,state_key)
);

create table if not exists public.material_tracker_presence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

alter table public.material_tracker_memberships enable row level security;
alter table public.material_tracker_materials enable row level security;
alter table public.material_tracker_tasks enable row level security;
alter table public.material_tracker_activity enable row level security;
alter table public.material_tracker_comments enable row level security;
alter table public.material_tracker_notifications enable row level security;
alter table public.material_tracker_forex_rates enable row level security;
alter table public.material_tracker_daily_metrics enable row level security;
alter table public.material_tracker_user_state enable row level security;
alter table public.material_tracker_presence enable row level security;

revoke all on public.material_tracker_memberships, public.material_tracker_materials, public.material_tracker_tasks,
  public.material_tracker_activity, public.material_tracker_comments, public.material_tracker_notifications,
  public.material_tracker_forex_rates, public.material_tracker_daily_metrics, public.material_tracker_user_state,
  public.material_tracker_presence from anon, authenticated;

create or replace function private.material_tracker_current_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path='public','pg_temp' as $$
  select m.role from public.material_tracker_memberships m
  where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.enabled=true and m.status='active' limit 1;
$$;

create or replace function private.material_tracker_has_access(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select auth.uid() is not null
    and exists(select 1 from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid() and wm.active=true)
    and private.material_tracker_current_role(p_workspace_id) is not null;
$$;

create or replace function private.material_tracker_can_write(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select coalesce(private.material_tracker_current_role(p_workspace_id) in ('ADMIN','USER'),false);
$$;

create or replace function private.material_tracker_is_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select coalesce(private.material_tracker_current_role(p_workspace_id)='ADMIN',false);
$$;

revoke all on function private.material_tracker_current_role(uuid) from public, anon;
revoke all on function private.material_tracker_has_access(uuid) from public, anon;
revoke all on function private.material_tracker_can_write(uuid) from public, anon;
revoke all on function private.material_tracker_is_admin(uuid) from public, anon;
grant execute on function private.material_tracker_current_role(uuid) to authenticated;
grant execute on function private.material_tracker_has_access(uuid) to authenticated;
grant execute on function private.material_tracker_can_write(uuid) to authenticated;
grant execute on function private.material_tracker_is_admin(uuid) to authenticated;

insert into public.material_tracker_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
select wm.workspace_id,wm.user_id,
       case when p.platform_role='admin_general_manager' then 'ADMIN' else 'USER' end,
       true,'active',null
from public.workspace_members wm
join public.profiles p on p.id=wm.user_id and p.status='active'
where wm.active=true
on conflict (workspace_id,user_id) do nothing;

create or replace function private.material_tracker_group_title(p_group_id text)
returns text language sql immutable as $$
  select case p_group_id when 'topics' then 'Items for Quotation' else 'Engineering Services' end;
$$;

create or replace function private.material_tracker_material_json(m public.material_tracker_materials)
returns jsonb language sql stable security definer set search_path='public','pg_temp' as $$
  select coalesce(m.payload,'{}'::jsonb)
    || jsonb_build_object(
      'id',m.id,'name',m.name,
      'group',jsonb_build_object('id',m.group_id,'title',m.group_title),
      'creator',jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email)),
      'createdAt',m.created_at,'updatedAt',m.updated_at
    )
  from public.profiles p where p.id=m.creator_user_id;
$$;

create or replace function private.material_tracker_record_metric(p_workspace_id uuid)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare c integer;
begin
  select count(*) into c from public.material_tracker_materials m where m.workspace_id=p_workspace_id and m.archived_at is null;
  insert into public.material_tracker_daily_metrics(workspace_id,metric_date,item_count,recorded_at)
  values(p_workspace_id,current_date,c,now())
  on conflict(workspace_id,metric_date) do update set item_count=excluded.item_count,recorded_at=now();
end $$;

create or replace function public.material_tracker_bootstrap(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); r text; prof public.profiles%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  r:=private.material_tracker_current_role(p_workspace_id);
  select * into prof from public.profiles where id=caller and status='active';
  return jsonb_build_object('workspaceId',p_workspace_id,'role',r,'enabled',true,
    'user',jsonb_build_object('id',prof.id::text,'email',prof.email,'name',coalesce(prof.display_name,prof.email)));
end $$;

create or replace function public.material_tracker_current_user(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); prof public.profiles%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select * into prof from public.profiles where id=caller and status='active';
  return jsonb_build_object('id',prof.id::text,'name',coalesce(prof.display_name,prof.email),'email',prof.email,'photo_thumb',null,'role',private.material_tracker_current_role(p_workspace_id));
end $$;

create or replace function public.material_tracker_directory(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email),'email',p.email,'photo_thumb',null,'role',m.role) order by lower(coalesce(p.display_name,p.email))),'[]'::jsonb)
    into result
  from public.material_tracker_memberships m join public.profiles p on p.id=m.user_id
  where m.workspace_id=p_workspace_id and m.enabled=true and m.status='active' and p.status='active';
  return result;
end $$;

create or replace function public.material_tracker_list_materials(p_workspace_id uuid,p_where jsonb default '{}'::jsonb,p_sort jsonb default null,p_limit integer default 200,p_cursor integer default 0)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare lim integer:=greatest(1,least(coalesce(p_limit,200),500)); off integer:=greatest(0,coalesce(p_cursor,0)); total integer; rows jsonb; sort_col text:=coalesce(p_sort->>'column','createdAt'); sort_dir text:=lower(coalesce(p_sort->>'direction','desc'));
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select count(*) into total from public.material_tracker_materials m
   where m.workspace_id=p_workspace_id and m.archived_at is null
     and (not (p_where ? 'sourceType') or lower(coalesce(m.payload->>'sourceType',''))=lower(p_where->>'sourceType'))
     and (not (p_where ? 'name') or lower(m.name) like '%'||lower(p_where->>'name')||'%')
     and (not (p_where ? 'materialDescription') or lower(coalesce(m.payload->>'materialDescription','')) like '%'||lower(coalesce(p_where->'materialDescription'->>'contains',p_where->>'materialDescription',''))||'%')
     and (not (p_where ? 'vendorDetails') or lower(coalesce(m.payload->>'vendorDetails','')) like '%'||lower(coalesce(p_where->'vendorDetails'->>'contains',p_where->>'vendorDetails',''))||'%');
  select coalesce(jsonb_agg(private.material_tracker_material_json(q.m)),'[]'::jsonb) into rows
  from (
    select m from public.material_tracker_materials m
    where m.workspace_id=p_workspace_id and m.archived_at is null
      and (not (p_where ? 'sourceType') or lower(coalesce(m.payload->>'sourceType',''))=lower(p_where->>'sourceType'))
      and (not (p_where ? 'name') or lower(m.name) like '%'||lower(p_where->>'name')||'%')
      and (not (p_where ? 'materialDescription') or lower(coalesce(m.payload->>'materialDescription','')) like '%'||lower(coalesce(p_where->'materialDescription'->>'contains',p_where->>'materialDescription',''))||'%')
      and (not (p_where ? 'vendorDetails') or lower(coalesce(m.payload->>'vendorDetails','')) like '%'||lower(coalesce(p_where->'vendorDetails'->>'contains',p_where->>'vendorDetails',''))||'%')
    order by
      case when sort_col='name' and sort_dir='asc' then lower(m.name) end asc,
      case when sort_col='name' and sort_dir='desc' then lower(m.name) end desc,
      case when sort_col='createdAt' and sort_dir='asc' then m.created_at end asc,
      case when sort_col='createdAt' and sort_dir='desc' then m.created_at end desc,
      m.created_at desc
    limit lim offset off
  ) q;
  return jsonb_build_object('items',rows,'cursor',case when off+lim<total then (off+lim)::text else null end);
end $$;

create or replace function public.material_tracker_get_material(p_workspace_id uuid,p_material_id text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare m public.material_tracker_materials%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select * into m from public.material_tracker_materials where workspace_id=p_workspace_id and id=p_material_id and archived_at is null;
  if not found then raise exception 'Material not found' using errcode='P0002'; end if;
  return private.material_tracker_material_json(m);
end $$;

create or replace function public.material_tracker_create_material(p_workspace_id uuid,p_fields jsonb,p_group_id text default 'new_group')
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); m public.material_tracker_materials%rowtype; nm text; fx public.material_tracker_forex_rates%rowtype; clean jsonb;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker write denied' using errcode='42501'; end if;
  nm:=trim(coalesce(p_fields->>'name','')); if nm='' then raise exception 'Part Number / name is required' using errcode='22023'; end if;
  clean:=coalesce(p_fields,'{}'::jsonb)-'groupId'-'name';
  select * into fx from public.material_tracker_forex_rates where workspace_id=p_workspace_id;
  if not (clean ? 'exRateUsd') and fx.usd is not null then clean:=jsonb_set(clean,'{exRateUsd}',to_jsonb(to_char(fx.usd,'FM999999990.00')),true); end if;
  if not (clean ? 'exRateEur') and fx.eur is not null then clean:=jsonb_set(clean,'{exRateEur}',to_jsonb(to_char(fx.eur,'FM999999990.00')),true); end if;
  insert into public.material_tracker_materials(workspace_id,name,group_id,group_title,payload,creator_user_id)
  values(p_workspace_id,nm,coalesce(nullif(p_group_id,''),'new_group'),private.material_tracker_group_title(coalesce(nullif(p_group_id,''),'new_group')),clean,caller)
  returning * into m;
  insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material created.',caller);
  perform private.material_tracker_record_metric(p_workspace_id);
  return private.material_tracker_material_json(m);
end $$;

create or replace function public.material_tracker_update_material(p_workspace_id uuid,p_material_id text,p_updates jsonb default '{}'::jsonb,p_group_id text default null)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); m public.material_tracker_materials%rowtype; new_name text; msg text;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker write denied' using errcode='42501'; end if;
  select * into m from public.material_tracker_materials where workspace_id=p_workspace_id and id=p_material_id and archived_at is null for update;
  if not found then raise exception 'Material not found' using errcode='P0002'; end if;
  new_name:=case when p_updates ? 'name' then trim(coalesce(p_updates->>'name','')) else m.name end;
  if new_name='' then raise exception 'Part Number / name is required' using errcode='22023'; end if;
  update public.material_tracker_materials set
    name=new_name,
    group_id=case when p_group_id is not null then p_group_id else group_id end,
    group_title=case when p_group_id is not null then private.material_tracker_group_title(p_group_id) else group_title end,
    payload=(payload || (coalesce(p_updates,'{}'::jsonb)-'name')),
    updated_at=now()
  where workspace_id=p_workspace_id and id=p_material_id returning * into m;
  msg:=case when p_group_id is not null then 'Material updated and moved to '||p_group_id else 'Material updated' end;
  insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,p_material_id,msg,caller);
  return private.material_tracker_material_json(m);
end $$;

create or replace function public.material_tracker_archive_material(p_workspace_id uuid,p_material_id text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); affected integer;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker archive denied' using errcode='42501'; end if;
  update public.material_tracker_materials set archived_at=now(),archived_by=caller,updated_at=now()
   where workspace_id=p_workspace_id and id=p_material_id and archived_at is null;
  get diagnostics affected=row_count; if affected=0 then raise exception 'Material not found' using errcode='P0002'; end if;
  perform private.material_tracker_record_metric(p_workspace_id);
  return jsonb_build_object('ok',true,'id',p_material_id);
end $$;

create or replace function public.material_tracker_list_activity(p_workspace_id uuid,p_material_id text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'text',a.text,'body',a.text,'createdAt',a.created_at,'creator',jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email))) order by a.created_at desc),'[]'::jsonb)
    into result from public.material_tracker_activity a join public.profiles p on p.id=a.actor_user_id
    where a.workspace_id=p_workspace_id and a.material_id=p_material_id;
  return jsonb_build_object('updates',result);
end $$;

create or replace function public.material_tracker_list_tasks(p_workspace_id uuid,p_material_id text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(coalesce(t.payload,'{}'::jsonb)||jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'date',t.due_date,'createdAt',t.created_at,'updatedAt',t.updated_at) order by t.created_at),'[]'::jsonb)
    into result from public.material_tracker_tasks t where t.workspace_id=p_workspace_id and t.material_id=p_material_id;
  return jsonb_build_object('subitems',result);
end $$;

create or replace function public.material_tracker_create_task(p_workspace_id uuid,p_material_id text,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); t public.material_tracker_tasks%rowtype; nm text;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker write denied' using errcode='42501'; end if;
  if not exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and id=p_material_id and archived_at is null) then raise exception 'Material not found' using errcode='P0002'; end if;
  nm:=trim(coalesce(p_fields->>'name','')); if nm='' then raise exception 'Task name required' using errcode='22023'; end if;
  insert into public.material_tracker_tasks(workspace_id,material_id,name,status,due_date,payload,created_by)
  values(p_workspace_id,p_material_id,nm,coalesce(nullif(p_fields->>'status',''),'Working on it'),nullif(p_fields->>'date','')::date,coalesce(p_fields,'{}'::jsonb)-'name'-'status'-'date',caller)
  returning * into t;
  insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,p_material_id,'Task added: '||t.name,caller);
  return coalesce(t.payload,'{}'::jsonb)||jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'date',t.due_date,'createdAt',t.created_at);
end $$;

create or replace function public.material_tracker_update_task(p_workspace_id uuid,p_material_id text,p_task_id text,p_updates jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare caller uuid:=auth.uid(); t public.material_tracker_tasks%rowtype;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker write denied' using errcode='42501'; end if;
  update public.material_tracker_tasks set
    name=case when p_updates ? 'name' then trim(p_updates->>'name') else name end,
    status=case when p_updates ? 'status' then p_updates->>'status' else status end,
    due_date=case when p_updates ? 'date' then nullif(p_updates->>'date','')::date else due_date end,
    payload=payload||(p_updates-'name'-'status'-'date'),updated_at=now()
  where workspace_id=p_workspace_id and material_id=p_material_id and id=p_task_id returning * into t;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,p_material_id,'Task updated: '||t.name,caller);
  return coalesce(t.payload,'{}'::jsonb)||jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'date',t.due_date,'createdAt',t.created_at,'updatedAt',t.updated_at);
end $$;

create or replace function public.material_tracker_create_notification(p_workspace_id uuid,p_material_id text,p_user_id uuid,p_message text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.material_tracker_memberships where workspace_id=p_workspace_id and user_id=p_user_id and enabled=true and status='active') then raise exception 'Notification target is not an active Material Tracker member' using errcode='22023'; end if;
  insert into public.material_tracker_notifications(workspace_id,user_id,material_id,message,created_by) values(p_workspace_id,p_user_id,p_material_id,left(coalesce(p_message,''),2000),auth.uid());
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.material_tracker_aggregates(p_workspace_id uuid,p_group_by text default null,p_metrics jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  if p_group_by='sourceType' then
    select coalesce(jsonb_agg(jsonb_build_object('sourceType',source_type,'count',count_value,'totalBuying',total_buying) order by source_type),'[]'::jsonb) into result
    from (select coalesce(payload->>'sourceType','') source_type,count(*) count_value,sum(coalesce(nullif(payload->>'buyingPrice','')::numeric,0)) total_buying
          from public.material_tracker_materials where workspace_id=p_workspace_id and archived_at is null group by 1) x;
    return result;
  end if;
  select jsonb_build_array(jsonb_build_object('count',count(*),'totalBuying',coalesce(sum(coalesce(nullif(payload->>'buyingPrice','')::numeric,0)),0),'avgBuying',coalesce(avg(coalesce(nullif(payload->>'buyingPrice','')::numeric,0)),0))) into result
  from public.material_tracker_materials where workspace_id=p_workspace_id and archived_at is null;
  return result;
end $$;

create or replace function public.material_tracker_get_forex(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare f public.material_tracker_forex_rates%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select * into f from public.material_tracker_forex_rates where workspace_id=p_workspace_id;
  return jsonb_build_object('usd',f.usd,'eur',f.eur,'updatedAt',f.updated_at,'isDemo',false);
end $$;

create or replace function public.material_tracker_set_forex(p_workspace_id uuid,p_rates jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare f public.material_tracker_forex_rates%rowtype;
begin
  if not private.material_tracker_is_admin(p_workspace_id) then raise exception 'Material Tracker forex administration denied' using errcode='42501'; end if;
  insert into public.material_tracker_forex_rates(workspace_id,usd,eur,updated_by,updated_at)
  values(p_workspace_id,nullif(p_rates->>'usd','')::numeric,nullif(p_rates->>'eur','')::numeric,auth.uid(),now())
  on conflict(workspace_id) do update set usd=excluded.usd,eur=excluded.eur,updated_by=auth.uid(),updated_at=now()
  returning * into f;
  return jsonb_build_object('usd',f.usd,'eur',f.eur,'updatedAt',f.updated_at,'isDemo',false);
end $$;

create or replace function public.material_tracker_history(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',metric_date,'count',item_count) order by metric_date),'[]'::jsonb) into result
  from public.material_tracker_daily_metrics where workspace_id=p_workspace_id;
  return jsonb_build_object('history',result);
end $$;

create or replace function public.material_tracker_get_user_state(p_workspace_id uuid,p_state_key text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare e public.material_tracker_user_state%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select * into e from public.material_tracker_user_state where workspace_id=p_workspace_id and user_id=auth.uid() and state_key=p_state_key;
  return jsonb_build_object('value',e.value,'version',coalesce(e.revision,0));
end $$;

create or replace function public.material_tracker_put_user_state(p_workspace_id uuid,p_state_key text,p_value jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare current_rev bigint; result_rev bigint;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  if p_state_key not in ('material_sourcing_saved_views','material_sourcing_starred','material_sourcing_col_prefs','material_sourcing_col_widths','material_sourcing_col_order') then raise exception 'Unsupported Material Tracker user state key' using errcode='22023'; end if;
  select revision into current_rev from public.material_tracker_user_state where workspace_id=p_workspace_id and user_id=auth.uid() and state_key=p_state_key for update;
  if p_expected_revision is not null and coalesce(current_rev,0)<>p_expected_revision then raise exception 'version conflict: expected %, current %',p_expected_revision,coalesce(current_rev,0) using errcode='40001'; end if;
  insert into public.material_tracker_user_state(workspace_id,user_id,state_key,value,revision,updated_at)
  values(p_workspace_id,auth.uid(),p_state_key,p_value,1,now())
  on conflict(workspace_id,user_id,state_key) do update set value=excluded.value,revision=public.material_tracker_user_state.revision+1,updated_at=now()
  returning revision into result_rev;
  return jsonb_build_object('value',p_value,'version',result_rev);
end $$;

create or replace function public.material_tracker_list_comments(p_workspace_id uuid,p_material_id text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'text',c.text,'authorName',coalesce(p.display_name,p.email),'authorId',p.id::text,'createdAt',c.created_at,'editedAt',c.edited_at) order by c.created_at),'[]'::jsonb)
    into result from public.material_tracker_comments c join public.profiles p on p.id=c.author_user_id
    where c.workspace_id=p_workspace_id and c.material_id=p_material_id and c.deleted_at is null;
  return result;
end $$;

create or replace function public.material_tracker_add_comment(p_workspace_id uuid,p_material_id text,p_text text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare c public.material_tracker_comments%rowtype; p public.profiles%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  if trim(coalesce(p_text,''))='' then raise exception 'Comment text required' using errcode='22023'; end if;
  if not exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and id=p_material_id and archived_at is null) then raise exception 'Material not found' using errcode='P0002'; end if;
  insert into public.material_tracker_comments(workspace_id,material_id,text,author_user_id) values(p_workspace_id,p_material_id,left(trim(p_text),8000),auth.uid()) returning * into c;
  select * into p from public.profiles where id=auth.uid();
  return jsonb_build_object('id',c.id,'text',c.text,'authorName',coalesce(p.display_name,p.email),'authorId',p.id::text,'createdAt',c.created_at,'editedAt',c.edited_at);
end $$;

create or replace function public.material_tracker_edit_comment(p_workspace_id uuid,p_comment_id text,p_text text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare c public.material_tracker_comments%rowtype; p public.profiles%rowtype;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  update public.material_tracker_comments set text=left(trim(p_text),8000),edited_at=now()
   where workspace_id=p_workspace_id and id=p_comment_id and deleted_at is null and (author_user_id=auth.uid() or private.material_tracker_is_admin(p_workspace_id)) returning * into c;
  if not found then raise exception 'Comment not found or edit denied' using errcode='42501'; end if;
  select * into p from public.profiles where id=c.author_user_id;
  return jsonb_build_object('id',c.id,'text',c.text,'authorName',coalesce(p.display_name,p.email),'authorId',p.id::text,'createdAt',c.created_at,'editedAt',c.edited_at);
end $$;

create or replace function public.material_tracker_delete_comment(p_workspace_id uuid,p_comment_id text)
returns boolean language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare affected integer;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  update public.material_tracker_comments set deleted_at=now() where workspace_id=p_workspace_id and id=p_comment_id and deleted_at is null and (author_user_id=auth.uid() or private.material_tracker_is_admin(p_workspace_id));
  get diagnostics affected=row_count; if affected=0 then raise exception 'Comment not found or delete denied' using errcode='42501'; end if;
  return true;
end $$;

create or replace function public.material_tracker_presence_heartbeat(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare result jsonb;
begin
  if not private.material_tracker_has_access(p_workspace_id) then raise exception 'Material Tracker access denied' using errcode='42501'; end if;
  delete from public.material_tracker_presence where workspace_id=p_workspace_id and last_seen<now()-interval '7 days';
  insert into public.material_tracker_presence(workspace_id,user_id,last_seen) values(p_workspace_id,auth.uid(),now())
  on conflict(workspace_id,user_id) do update set last_seen=now();
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email),'photo',null,'lastSeen',extract(epoch from pr.last_seen)*1000) order by lower(coalesce(p.display_name,p.email))),'[]'::jsonb)
    into result from public.material_tracker_presence pr join public.profiles p on p.id=pr.user_id
    join public.material_tracker_memberships m on m.workspace_id=pr.workspace_id and m.user_id=pr.user_id and m.enabled=true and m.status='active'
    where pr.workspace_id=p_workspace_id and pr.user_id<>auth.uid() and pr.last_seen>=now()-interval '90 seconds';
  return result;
end $$;

create or replace function public.material_tracker_admin_set_role(p_workspace_id uuid,p_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
begin
  if not private.material_tracker_is_admin(p_workspace_id) then raise exception 'Material Tracker administration denied' using errcode='42501'; end if;
  if p_role not in ('ADMIN','USER','VIEWER') then raise exception 'Unsupported Material Tracker role' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and active=true) then raise exception 'User is not an active workspace member' using errcode='22023'; end if;
  insert into public.material_tracker_memberships(workspace_id,user_id,role,enabled,status,assigned_by,updated_at)
  values(p_workspace_id,p_user_id,p_role,true,'active',auth.uid(),now())
  on conflict(workspace_id,user_id) do update set role=excluded.role,enabled=true,status='active',assigned_by=auth.uid(),updated_at=now();
  return jsonb_build_object('ok',true,'userId',p_user_id,'role',p_role);
end $$;

revoke all on function public.material_tracker_bootstrap(uuid) from public, anon;
revoke all on function public.material_tracker_current_user(uuid) from public, anon;
revoke all on function public.material_tracker_directory(uuid) from public, anon;
revoke all on function public.material_tracker_list_materials(uuid,jsonb,jsonb,integer,integer) from public, anon;
revoke all on function public.material_tracker_get_material(uuid,text) from public, anon;
revoke all on function public.material_tracker_create_material(uuid,jsonb,text) from public, anon;
revoke all on function public.material_tracker_update_material(uuid,text,jsonb,text) from public, anon;
revoke all on function public.material_tracker_archive_material(uuid,text) from public, anon;
revoke all on function public.material_tracker_list_activity(uuid,text) from public, anon;
revoke all on function public.material_tracker_list_tasks(uuid,text) from public, anon;
revoke all on function public.material_tracker_create_task(uuid,text,jsonb) from public, anon;
revoke all on function public.material_tracker_update_task(uuid,text,text,jsonb) from public, anon;
revoke all on function public.material_tracker_create_notification(uuid,text,uuid,text) from public, anon;
revoke all on function public.material_tracker_aggregates(uuid,text,jsonb) from public, anon;
revoke all on function public.material_tracker_get_forex(uuid) from public, anon;
revoke all on function public.material_tracker_set_forex(uuid,jsonb) from public, anon;
revoke all on function public.material_tracker_history(uuid) from public, anon;
revoke all on function public.material_tracker_get_user_state(uuid,text) from public, anon;
revoke all on function public.material_tracker_put_user_state(uuid,text,jsonb,bigint) from public, anon;
revoke all on function public.material_tracker_list_comments(uuid,text) from public, anon;
revoke all on function public.material_tracker_add_comment(uuid,text,text) from public, anon;
revoke all on function public.material_tracker_edit_comment(uuid,text,text) from public, anon;
revoke all on function public.material_tracker_delete_comment(uuid,text) from public, anon;
revoke all on function public.material_tracker_presence_heartbeat(uuid) from public, anon;
revoke all on function public.material_tracker_admin_set_role(uuid,uuid,text) from public, anon;

grant execute on function public.material_tracker_bootstrap(uuid) to authenticated;
grant execute on function public.material_tracker_current_user(uuid) to authenticated;
grant execute on function public.material_tracker_directory(uuid) to authenticated;
grant execute on function public.material_tracker_list_materials(uuid,jsonb,jsonb,integer,integer) to authenticated;
grant execute on function public.material_tracker_get_material(uuid,text) to authenticated;
grant execute on function public.material_tracker_create_material(uuid,jsonb,text) to authenticated;
grant execute on function public.material_tracker_update_material(uuid,text,jsonb,text) to authenticated;
grant execute on function public.material_tracker_archive_material(uuid,text) to authenticated;
grant execute on function public.material_tracker_list_activity(uuid,text) to authenticated;
grant execute on function public.material_tracker_list_tasks(uuid,text) to authenticated;
grant execute on function public.material_tracker_create_task(uuid,text,jsonb) to authenticated;
grant execute on function public.material_tracker_update_task(uuid,text,text,jsonb) to authenticated;
grant execute on function public.material_tracker_create_notification(uuid,text,uuid,text) to authenticated;
grant execute on function public.material_tracker_aggregates(uuid,text,jsonb) to authenticated;
grant execute on function public.material_tracker_get_forex(uuid) to authenticated;
grant execute on function public.material_tracker_set_forex(uuid,jsonb) to authenticated;
grant execute on function public.material_tracker_history(uuid) to authenticated;
grant execute on function public.material_tracker_get_user_state(uuid,text) to authenticated;
grant execute on function public.material_tracker_put_user_state(uuid,text,jsonb,bigint) to authenticated;
grant execute on function public.material_tracker_list_comments(uuid,text) to authenticated;
grant execute on function public.material_tracker_add_comment(uuid,text,text) to authenticated;
grant execute on function public.material_tracker_edit_comment(uuid,text,text) to authenticated;
grant execute on function public.material_tracker_delete_comment(uuid,text) to authenticated;
grant execute on function public.material_tracker_presence_heartbeat(uuid) to authenticated;
grant execute on function public.material_tracker_admin_set_role(uuid,uuid,text) to authenticated;;
