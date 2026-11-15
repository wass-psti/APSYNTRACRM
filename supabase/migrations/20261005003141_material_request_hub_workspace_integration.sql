-- Material Request Hub integration schema for WatchdogWorkspace.
-- Domain authorization is app-scoped and independent after initial administrator bootstrap.

create schema if not exists private;

create table if not exists public.material_request_hub_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER')),
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','disabled')),
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.material_request_hub_requests (
  id text primary key default ('mrh-' || gen_random_uuid()::text),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requestor_user_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 240),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  type_of_request text check (type_of_request is null or type_of_request in ('Client PO','Project BOM')),
  source_inventory text check (source_inventory is null or source_inventory in ('WASS Inventory','PSTI Inventory','WAO Inventory','IFAB')),
  type_of_invoice text check (type_of_invoice is null or type_of_invoice in ('Service Invoice','Sales Invoice','No Invoice')),
  requested_qty numeric check (requested_qty is null or requested_qty >= 0),
  total_cost numeric check (total_cost is null or total_cost >= 0),
  remarks text check (remarks is null or char_length(remarks) <= 4000),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  charge_to_project_no jsonb not null default '{"linkedItems":[]}'::jsonb,
  description text check (description is null or char_length(description) <= 8000),
  unit_price numeric check (unit_price is null or unit_price >= 0),
  stock_code text check (stock_code is null or char_length(stock_code) <= 200),
  available_qty numeric check (available_qty is null or available_qty >= 0),
  part_no_order_code jsonb not null default '{"linkedItems":[]}'::jsonb,
  client_po_file jsonb,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id),
  rejected_at timestamptz,
  released_by uuid references public.profiles(id),
  released_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);

create table if not exists public.material_request_hub_subitems (
  id text primary key default ('mrh-sub-' || gen_random_uuid()::text),
  workspace_id uuid not null,
  request_id text not null,
  name text not null check (char_length(name) between 1 and 500),
  status text check (status is null or char_length(status) <= 120),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,request_id) references public.material_request_hub_requests(workspace_id,id) on delete cascade
);

create table if not exists public.material_request_hub_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  request_id text not null,
  creator_user_id uuid not null references public.profiles(id),
  text_body text not null check (char_length(text_body) between 1 and 8000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,request_id) references public.material_request_hub_requests(workspace_id,id) on delete cascade
);

create table if not exists public.material_request_hub_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  request_id text not null,
  update_id uuid references public.material_request_hub_updates(id) on delete set null,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 500),
  mime_type text not null check (char_length(mime_type) <= 200),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  creator_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,request_id) references public.material_request_hub_requests(workspace_id,id) on delete cascade
);

create table if not exists public.material_request_hub_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text,
  actor_user_id uuid references public.profiles(id),
  event_type text not null check (char_length(event_type) between 1 and 100),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (workspace_id,request_id) references public.material_request_hub_requests(workspace_id,id) on delete cascade
);

create index if not exists material_request_hub_requests_workspace_status_idx on public.material_request_hub_requests(workspace_id,status,created_at desc);
create index if not exists material_request_hub_requests_workspace_source_idx on public.material_request_hub_requests(workspace_id,source_inventory);
create index if not exists material_request_hub_activity_request_idx on public.material_request_hub_activity(workspace_id,request_id,created_at desc);
create index if not exists material_request_hub_updates_request_idx on public.material_request_hub_updates(workspace_id,request_id,created_at desc);
create index if not exists material_request_hub_attachments_request_idx on public.material_request_hub_attachments(workspace_id,request_id,created_at desc);

insert into public.material_request_hub_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
select wm.workspace_id, wm.user_id, 'ADMIN', true, 'active', null
from public.workspace_members wm
join public.profiles p on p.id=wm.user_id and p.status='active'
where wm.active=true and lower(p.platform_role) in ('admin','administrator','general manager','general_manager')
on conflict (workspace_id,user_id) do nothing;

create or replace function private.material_request_hub_current_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select m.role
  from public.material_request_hub_memberships m
  join public.workspace_members wm on wm.workspace_id=m.workspace_id and wm.user_id=m.user_id and wm.active=true
  join public.profiles p on p.id=m.user_id and p.status='active'
  where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.enabled=true and m.status='active'
  limit 1;
$$;

create or replace function private.material_request_hub_has_access(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select private.material_request_hub_current_role(p_workspace_id) is not null; $$;
create or replace function private.material_request_hub_can_write(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(private.material_request_hub_current_role(p_workspace_id) in ('ADMIN','REQUESTOR','APPROVER','WAREHOUSE'),false); $$;
create or replace function private.material_request_hub_can_approve(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(private.material_request_hub_current_role(p_workspace_id) in ('ADMIN','APPROVER'),false); $$;
create or replace function private.material_request_hub_can_release(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(private.material_request_hub_current_role(p_workspace_id) in ('ADMIN','WAREHOUSE'),false); $$;
create or replace function private.material_request_hub_is_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(private.material_request_hub_current_role(p_workspace_id)='ADMIN',false); $$;
create or replace function private.material_request_hub_status_label(p_status text)
returns text language sql immutable as $$ select case p_status when 'approved' then '✅ Approved' when 'rejected' then '❌ Rejected' else '⏳ Pending' end; $$;
create or replace function private.material_request_hub_status_value(p_status text)
returns text language sql immutable as $$ select case when lower(coalesce(p_status,'')) like '%approved%' then 'approved' when lower(coalesce(p_status,'')) like '%rejected%' then 'rejected' else 'pending' end; $$;
create or replace function private.material_request_hub_group_json(p_status text)
returns jsonb language sql immutable as $$ select case when p_status='approved' then jsonb_build_object('id','release_queue','title','Approved / Release Queue') else jsonb_build_object('id','request_queue','title','Requests / Returned') end; $$;
create or replace function private.material_request_hub_capabilities(p_role text)
returns jsonb language sql immutable as $$ select case p_role when 'ADMIN' then '["view","create","edit","approve","reject","release","comment","attach","admin"]'::jsonb when 'REQUESTOR' then '["view","create","edit","comment","attach"]'::jsonb when 'APPROVER' then '["view","approve","reject","comment","attach"]'::jsonb when 'WAREHOUSE' then '["view","release","comment","attach"]'::jsonb else '["view"]'::jsonb end; $$;

create or replace function private.material_request_hub_can_edit_request(p_workspace_id uuid,p_request_id text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare r public.material_request_hub_requests%rowtype; role_name text;
begin role_name:=private.material_request_hub_current_role(p_workspace_id); if role_name='ADMIN' then return true; end if; if role_name<>'REQUESTOR' then return false; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id; return found and r.requestor_user_id=auth.uid() and r.status in ('pending','rejected') and r.released_at is null; end $$;

create or replace function private.material_request_hub_request_json(r public.material_request_hub_requests)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',r.id,'name',r.name,'approvalStatus',private.material_request_hub_status_label(r.status),'typeOfRequest',case when r.type_of_request is null then '[]'::jsonb else jsonb_build_array(r.type_of_request) end,'sourceInventory',case when r.source_inventory is null then '[]'::jsonb else jsonb_build_array(r.source_inventory) end,'typeOfInvoice',case when r.type_of_invoice is null then '[]'::jsonb else jsonb_build_array(r.type_of_invoice) end,'requestedQty',r.requested_qty,'totalCost',coalesce(r.total_cost,case when r.requested_qty is not null and r.unit_price is not null then r.requested_qty*r.unit_price else null end),'releasedDate',r.released_at,'remarks',coalesce(r.remarks,''),'rejectionReason',coalesce(r.rejection_reason,''),'daysPending',case when r.status='pending' then greatest(0,floor(extract(epoch from (now()-r.created_at))/86400))::int::text || ' days' else null end,'chargeToProjectNo',coalesce(r.charge_to_project_no,'{"linkedItems":[]}'::jsonb),'description',jsonb_build_object('displayValue',r.description),'unitPrice',jsonb_build_object('displayValue',r.unit_price),'stockCode',jsonb_build_object('displayValue',r.stock_code),'availableQty',jsonb_build_object('displayValue',r.available_qty),'partNoOrderCode',coalesce(r.part_no_order_code,'{"linkedItems":[]}'::jsonb),'clientPoFile',r.client_po_file,'group',private.material_request_hub_group_json(r.status),'creator',jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email)),'createdAt',r.created_at,'updatedAt',r.updated_at,'version',r.version) from public.profiles p where p.id=r.requestor_user_id;
$$;

create or replace function public.material_request_hub_bootstrap(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); role_name text; prof public.profiles%rowtype; begin if caller is null then raise exception 'authentication required' using errcode='42501'; end if; if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'Material Request Hub access denied' using errcode='42501'; end if; role_name:=private.material_request_hub_current_role(p_workspace_id); select * into prof from public.profiles where id=caller and status='active'; return jsonb_build_object('workspaceId',p_workspace_id,'role',role_name,'capabilities',private.material_request_hub_capabilities(role_name),'user',jsonb_build_object('id',prof.id::text,'email',prof.email,'name',coalesce(prof.display_name,prof.email))); end $$;

create or replace function public.material_request_hub_directory(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ begin if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if; return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email),'email',p.email,'role',m.role) order by coalesce(p.display_name,p.email)) from public.material_request_hub_memberships m join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace_id and m.enabled=true and m.status='active' and p.status='active'),'[]'::jsonb); end $$;

create or replace function public.material_request_hub_list_requests(p_workspace_id uuid,p_where jsonb default '{}'::jsonb,p_sort jsonb default '{}'::jsonb,p_limit int default 25,p_cursor text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare off int:=greatest(0,coalesce(nullif(p_cursor,'')::int,0)); lim int:=least(greatest(coalesce(p_limit,25),1),100); rows jsonb; cnt int;
begin if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if; with filtered as (select r.* from public.material_request_hub_requests r where r.workspace_id=p_workspace_id and (not (p_where ? 'approvalStatus') or r.status = any(array(select private.material_request_hub_status_value(v#>>'{}') from jsonb_array_elements(p_where->'approvalStatus') v))) and (not (p_where ? 'sourceInventory') or r.source_inventory ilike '%'||coalesce(p_where#>>'{sourceInventory,contains}',p_where->>'sourceInventory')||'%') and (not (p_where ? 'name') or r.name ilike '%'||(p_where->>'name')||'%') and (not (p_where ? 'group') or ((r.status='approved' and (p_where->'group') ? 'release_queue') or (r.status<>'approved' and (p_where->'group') ? 'request_queue'))) order by r.created_at desc,r.id desc offset off limit lim+1), page as (select * from filtered limit lim) select coalesce(jsonb_agg(private.material_request_hub_request_json(page.*)),'[]'::jsonb) into rows from page; select count(*) into cnt from filtered; return jsonb_build_object('items',rows,'cursor',case when cnt>lim then (off+lim)::text else null end); end $$;

create or replace function public.material_request_hub_get_request(p_workspace_id uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.material_request_hub_requests%rowtype; base jsonb; subs jsonb; assets jsonb; ups jsonb;
begin if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id; if not found then raise exception 'request not found' using errcode='P0002'; end if; base:=private.material_request_hub_request_json(r); select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'status',s.status,'date',s.due_date,'createdAt',s.created_at) order by s.created_at),'[]'::jsonb) into subs from public.material_request_hub_subitems s where s.workspace_id=p_workspace_id and s.request_id=p_request_id; select coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'name',a.name,'file_extension',lower(regexp_replace(a.name,'.*\.','','g')),'file_size',a.size_bytes,'mime_type',a.mime_type,'storagePath',a.storage_path,'createdAt',a.created_at) order by a.created_at desc),'[]'::jsonb) into assets from public.material_request_hub_attachments a where a.workspace_id=p_workspace_id and a.request_id=p_request_id; select coalesce(jsonb_agg(jsonb_build_object('id',u.id::text,'itemId',u.request_id,'creator',jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email)),'created_at',u.created_at,'text_body',u.text_body) order by u.created_at desc),'[]'::jsonb) into ups from public.material_request_hub_updates u join public.profiles p on p.id=u.creator_user_id where u.workspace_id=p_workspace_id and u.request_id=p_request_id; return base || jsonb_build_object('subitems',subs,'assets',assets,'updates',ups); end $$;

create or replace function public.material_request_hub_create_request(p_workspace_id uuid,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; nm text; t text; s text; inv text;
begin if not private.material_request_hub_can_write(p_workspace_id) then raise exception 'write denied' using errcode='42501'; end if; nm:=left(trim(coalesce(p_fields->>'name','New Request')),240); if nm='' then nm:='New Request'; end if; t:=nullif(p_fields->>'typeOfRequest',''); s:=nullif(p_fields->>'sourceInventory',''); inv:=nullif(p_fields->>'typeOfInvoice',''); if t is not null and t not in ('Client PO','Project BOM') then raise exception 'invalid request type' using errcode='22023'; end if; if s is not null and s not in ('WASS Inventory','PSTI Inventory','WAO Inventory','IFAB') then raise exception 'invalid inventory source' using errcode='22023'; end if; if inv is not null and inv not in ('Service Invoice','Sales Invoice','No Invoice') then raise exception 'invalid invoice type' using errcode='22023'; end if; insert into public.material_request_hub_requests(workspace_id,requestor_user_id,name,type_of_request,source_inventory,type_of_invoice,requested_qty,remarks) values(p_workspace_id,caller,nm,t,s,inv,nullif(p_fields->>'requestedQty','')::numeric,left(coalesce(p_fields->>'remarks',''),4000)) returning * into r; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'created','{}'); return private.material_request_hub_request_json(r); end $$;

create or replace function public.material_request_hub_update_request(p_workspace_id uuid,p_request_id text,p_fields jsonb,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; t text; s text; inv text;
begin if not private.material_request_hub_can_edit_request(p_workspace_id,p_request_id) then raise exception 'edit denied' using errcode='42501'; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id for update; if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale request version' using errcode='40001'; end if; t:=case when p_fields ? 'typeOfRequest' then nullif(p_fields->>'typeOfRequest','') else r.type_of_request end; s:=case when p_fields ? 'sourceInventory' then nullif(p_fields->>'sourceInventory','') else r.source_inventory end; inv:=case when p_fields ? 'typeOfInvoice' then nullif(p_fields->>'typeOfInvoice','') else r.type_of_invoice end; if t is not null and t not in ('Client PO','Project BOM') then raise exception 'invalid request type' using errcode='22023'; end if; if s is not null and s not in ('WASS Inventory','PSTI Inventory','WAO Inventory','IFAB') then raise exception 'invalid inventory source' using errcode='22023'; end if; if inv is not null and inv not in ('Service Invoice','Sales Invoice','No Invoice') then raise exception 'invalid invoice type' using errcode='22023'; end if; update public.material_request_hub_requests set name=case when p_fields ? 'name' then left(coalesce(nullif(trim(p_fields->>'name'),''),'New Request'),240) else name end,type_of_request=t,source_inventory=s,type_of_invoice=inv,requested_qty=case when p_fields ? 'requestedQty' then nullif(p_fields->>'requestedQty','')::numeric else requested_qty end,remarks=case when p_fields ? 'remarks' then left(coalesce(p_fields->>'remarks',''),4000) else remarks end,updated_at=now(),version=version+1 where workspace_id=p_workspace_id and id=p_request_id returning * into r; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'edited',jsonb_build_object('version',r.version)); return private.material_request_hub_request_json(r); end $$;

create or replace function public.material_request_hub_approve_request(p_workspace_id uuid,p_request_id text,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; begin if not private.material_request_hub_can_approve(p_workspace_id) then raise exception 'approval denied' using errcode='42501'; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id for update; if not found then raise exception 'request not found' using errcode='P0002'; end if; if r.status<>'pending' then raise exception 'only pending requests can be approved' using errcode='22023'; end if; if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale request version' using errcode='40001'; end if; update public.material_request_hub_requests set status='approved',rejection_reason=null,approved_by=caller,approved_at=now(),rejected_by=null,rejected_at=null,updated_at=now(),version=version+1 where workspace_id=p_workspace_id and id=p_request_id returning * into r; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'approved',jsonb_build_object('version',r.version)); return private.material_request_hub_request_json(r); end $$;

create or replace function public.material_request_hub_reject_request(p_workspace_id uuid,p_request_id text,p_reason text,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; reason text:=left(trim(coalesce(p_reason,'')),2000); begin if not private.material_request_hub_can_approve(p_workspace_id) then raise exception 'rejection denied' using errcode='42501'; end if; if reason='' then raise exception 'rejection reason required' using errcode='22023'; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id for update; if not found then raise exception 'request not found' using errcode='P0002'; end if; if r.status<>'pending' then raise exception 'only pending requests can be rejected' using errcode='22023'; end if; if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale request version' using errcode='40001'; end if; update public.material_request_hub_requests set status='rejected',rejection_reason=reason,rejected_by=caller,rejected_at=now(),approved_by=null,approved_at=null,updated_at=now(),version=version+1 where workspace_id=p_workspace_id and id=p_request_id returning * into r; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'rejected',jsonb_build_object('reason',reason,'version',r.version)); return private.material_request_hub_request_json(r); end $$;

create or replace function public.material_request_hub_release_request(p_workspace_id uuid,p_request_id text,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; begin if not private.material_request_hub_can_release(p_workspace_id) then raise exception 'release denied' using errcode='42501'; end if; select * into r from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id for update; if not found then raise exception 'request not found' using errcode='P0002'; end if; if r.status<>'approved' then raise exception 'only approved requests can be released' using errcode='22023'; end if; if r.released_at is not null then raise exception 'request is already released' using errcode='22023'; end if; if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale request version' using errcode='40001'; end if; update public.material_request_hub_requests set released_at=now(),released_by=caller,updated_at=now(),version=version+1 where workspace_id=p_workspace_id and id=p_request_id returning * into r; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'released',jsonb_build_object('version',r.version)); return private.material_request_hub_request_json(r); end $$;

create or replace function public.material_request_hub_aggregates(p_workspace_id uuid,p_group_by text default null,p_metrics jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ begin if not private.material_request_hub_has_access(p_workspace_id) then raise exception 'access denied' using errcode='42501'; end if; if p_group_by='approvalStatus' then return coalesce((select jsonb_agg(jsonb_build_object('approvalStatus',private.material_request_hub_status_label(status),'count',count(*),'totalQty',coalesce(sum(requested_qty),0)) order by status) from public.material_request_hub_requests where workspace_id=p_workspace_id group by workspace_id),'[]'::jsonb); elsif p_group_by='sourceInventory' then return coalesce((select jsonb_agg(jsonb_build_object('sourceInventory',source_inventory,'count',count(*)) order by source_inventory) from public.material_request_hub_requests where workspace_id=p_workspace_id and source_inventory is not null group by workspace_id),'[]'::jsonb); else return jsonb_build_array(jsonb_build_object('totalCount',(select count(*) from public.material_request_hub_requests where workspace_id=p_workspace_id),'totalRequestedQty',(select coalesce(sum(requested_qty),0) from public.material_request_hub_requests where workspace_id=p_workspace_id))); end if; end $$;

create or replace function public.material_request_hub_add_update(p_workspace_id uuid,p_request_id text,p_text text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); u public.material_request_hub_updates%rowtype; prof public.profiles%rowtype; begin if not private.material_request_hub_can_write(p_workspace_id) then raise exception 'comment denied' using errcode='42501'; end if; if not exists(select 1 from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id) then raise exception 'request not found' using errcode='P0002'; end if; insert into public.material_request_hub_updates(workspace_id,request_id,creator_user_id,text_body) values(p_workspace_id,p_request_id,caller,left(trim(p_text),8000)) returning * into u; select * into prof from public.profiles where id=caller; return jsonb_build_object('id',u.id::text,'itemId',u.request_id,'creator',jsonb_build_object('id',prof.id::text,'name',coalesce(prof.display_name,prof.email)),'created_at',u.created_at,'text_body',u.text_body); end $$;

create or replace function public.material_request_hub_register_attachment(p_workspace_id uuid,p_request_id text,p_update_id uuid,p_storage_path text,p_name text,p_mime_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); a public.material_request_hub_attachments%rowtype; ext text:=lower(regexp_replace(p_name,'.*\.','','g')); begin if not private.material_request_hub_can_write(p_workspace_id) then raise exception 'attachment denied' using errcode='42501'; end if; if p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'attachment size must be between 1 byte and 10 MB' using errcode='22023'; end if; if ext not in ('pdf','png','jpg','jpeg','webp','gif','doc','docx','xls','xlsx','csv','txt') then raise exception 'attachment extension is not allowed' using errcode='22023'; end if; if p_storage_path not like p_workspace_id::text||'/'||p_request_id||'/%' then raise exception 'invalid attachment path' using errcode='22023'; end if; if not exists(select 1 from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id) then raise exception 'request not found' using errcode='P0002'; end if; insert into public.material_request_hub_attachments(workspace_id,request_id,update_id,storage_path,name,mime_type,size_bytes,creator_user_id) values(p_workspace_id,p_request_id,p_update_id,p_storage_path,left(p_name,500),left(coalesce(p_mime_type,'application/octet-stream'),200),p_size_bytes,caller) returning * into a; insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,p_request_id,caller,'attachment_added',jsonb_build_object('attachmentId',a.id,'name',a.name)); return jsonb_build_object('id',a.id::text,'name',a.name,'file_extension',ext,'file_size',a.size_bytes,'mime_type',a.mime_type,'storagePath',a.storage_path,'createdAt',a.created_at); end $$;

create or replace function public.material_request_hub_admin_set_role(p_workspace_id uuid,p_user_id uuid,p_role text,p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$ declare caller uuid:=auth.uid(); role_name text:=upper(trim(p_role)); begin if not private.material_request_hub_is_admin(p_workspace_id) then raise exception 'admin required' using errcode='42501'; end if; if role_name not in ('ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER') then raise exception 'invalid role' using errcode='22023'; end if; if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and active=true) then raise exception 'user is not an active Workspace member' using errcode='22023'; end if; insert into public.material_request_hub_memberships(workspace_id,user_id,role,enabled,status,assigned_by) values(p_workspace_id,p_user_id,role_name,p_enabled,case when p_enabled then 'active' else 'disabled' end,caller) on conflict (workspace_id,user_id) do update set role=excluded.role,enabled=excluded.enabled,status=excluded.status,assigned_by=caller,updated_at=now(); return jsonb_build_object('workspaceId',p_workspace_id,'userId',p_user_id,'role',role_name,'enabled',p_enabled); end $$;

alter table public.material_request_hub_memberships enable row level security;
alter table public.material_request_hub_requests enable row level security;
alter table public.material_request_hub_subitems enable row level security;
alter table public.material_request_hub_updates enable row level security;
alter table public.material_request_hub_attachments enable row level security;
alter table public.material_request_hub_activity enable row level security;
revoke all on public.material_request_hub_memberships,public.material_request_hub_requests,public.material_request_hub_subitems,public.material_request_hub_updates,public.material_request_hub_attachments,public.material_request_hub_activity from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('material-request-hub-attachments','material-request-hub-attachments',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp','image/gif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.material_request_hub_storage_workspace(p_name text) returns uuid language plpgsql immutable as $$ begin return split_part(p_name,'/',1)::uuid; exception when others then return null; end $$;
drop policy if exists mrh_storage_select on storage.objects;
create policy mrh_storage_select on storage.objects for select to authenticated using (bucket_id='material-request-hub-attachments' and private.material_request_hub_has_access(private.material_request_hub_storage_workspace(name)));
drop policy if exists mrh_storage_insert on storage.objects;
create policy mrh_storage_insert on storage.objects for insert to authenticated with check (bucket_id='material-request-hub-attachments' and private.material_request_hub_can_write(private.material_request_hub_storage_workspace(name)));
drop policy if exists mrh_storage_delete on storage.objects;
create policy mrh_storage_delete on storage.objects for delete to authenticated using (bucket_id='material-request-hub-attachments' and private.material_request_hub_can_write(private.material_request_hub_storage_workspace(name)));

revoke all on function public.material_request_hub_bootstrap(uuid) from public,anon;
revoke all on function public.material_request_hub_directory(uuid) from public,anon;
revoke all on function public.material_request_hub_list_requests(uuid,jsonb,jsonb,int,text) from public,anon;
revoke all on function public.material_request_hub_get_request(uuid,text) from public,anon;
revoke all on function public.material_request_hub_create_request(uuid,jsonb) from public,anon;
revoke all on function public.material_request_hub_update_request(uuid,text,jsonb,bigint) from public,anon;
revoke all on function public.material_request_hub_approve_request(uuid,text,bigint) from public,anon;
revoke all on function public.material_request_hub_reject_request(uuid,text,text,bigint) from public,anon;
revoke all on function public.material_request_hub_release_request(uuid,text,bigint) from public,anon;
revoke all on function public.material_request_hub_aggregates(uuid,text,jsonb) from public,anon;
revoke all on function public.material_request_hub_add_update(uuid,text,text) from public,anon;
revoke all on function public.material_request_hub_register_attachment(uuid,text,uuid,text,text,text,bigint) from public,anon;
revoke all on function public.material_request_hub_admin_set_role(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.material_request_hub_bootstrap(uuid) to authenticated;
grant execute on function public.material_request_hub_directory(uuid) to authenticated;
grant execute on function public.material_request_hub_list_requests(uuid,jsonb,jsonb,int,text) to authenticated;
grant execute on function public.material_request_hub_get_request(uuid,text) to authenticated;
grant execute on function public.material_request_hub_create_request(uuid,jsonb) to authenticated;
grant execute on function public.material_request_hub_update_request(uuid,text,jsonb,bigint) to authenticated;
grant execute on function public.material_request_hub_approve_request(uuid,text,bigint) to authenticated;
grant execute on function public.material_request_hub_reject_request(uuid,text,text,bigint) to authenticated;
grant execute on function public.material_request_hub_release_request(uuid,text,bigint) to authenticated;
grant execute on function public.material_request_hub_aggregates(uuid,text,jsonb) to authenticated;
grant execute on function public.material_request_hub_add_update(uuid,text,text) to authenticated;
grant execute on function public.material_request_hub_register_attachment(uuid,text,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.material_request_hub_admin_set_role(uuid,uuid,text,boolean) to authenticated;;
