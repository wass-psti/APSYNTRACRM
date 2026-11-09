-- FuelTrack+ v3: isolated, transactional backend. NOT applied to production by this migration commit.
-- Authoritative module roles, membership, signed session and board grants remain in WatchdogWorkspace.
-- Direct table privileges are revoked; only tightly scoped RPC functions expose records.
create table if not exists public.fueltrack_v3_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  workspace_id uuid not null,
  board_id uuid not null,
  requested_by uuid not null,
  client_key uuid not null,
  kind text not null check (kind in ('vehicle','container')),
  details jsonb not null check (jsonb_typeof(details)='object'),
  state text not null default 'submitted'
    check (state in ('submitted','approved','rejected','refueling_done','completed')),
  revision bigint not null default 1 check (revision>=1),
  decided_by uuid,
  decided_at timestamptz,
  rejection_reason text,
  refueled_by uuid,
  refueled_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  actual_amount numeric(14,2) check (actual_amount>0),
  fuel_liters numeric(14,3) check (fuel_liters>0),
  receipt_number text check (char_length(receipt_number)<=120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, requested_by, client_key)
);
create index if not exists fueltrack_v3_requests_queue_idx
  on public.fueltrack_v3_requests (workspace_id, board_id, state, created_at desc);
create index if not exists fueltrack_v3_requests_owner_idx
  on public.fueltrack_v3_requests (workspace_id, requested_by, created_at desc);
alter table public.fueltrack_v3_requests enable row level security;
revoke all on public.fueltrack_v3_requests from public, anon, authenticated;

-- Authoritative transition audit is separate from the legacy module activity stream:
-- the latter accepts independently appended user events and is not reliable proof of writes.
create table if not exists public.fueltrack_v3_audit_events (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 board_id uuid not null,
 request_id uuid not null references public.fueltrack_v3_requests(id),
 revision bigint not null check (revision >= 1),
 actor_id uuid not null,
 operation text not null check (operation in ('submit','approve','reject','refuel','complete')),
 from_state text,
 to_state text not null,
 occurred_at timestamptz not null default now(),
 unique (request_id, revision)
);
create index if not exists fueltrack_v3_audit_lookup_idx
 on public.fueltrack_v3_audit_events(workspace_id,board_id,occurred_at desc);
alter table public.fueltrack_v3_audit_events enable row level security;
revoke all on public.fueltrack_v3_audit_events from public,anon,authenticated;
create or replace function public.fueltrack_v3_block_audit_mutation()
 returns trigger language plpgsql set search_path = '' as $$
begin
 raise exception 'FuelTrack audit is immutable' using errcode='42501';
end; $$;
drop trigger if exists fueltrack_v3_audit_immutable on public.fueltrack_v3_audit_events;
create trigger fueltrack_v3_audit_immutable
 before update or delete on public.fueltrack_v3_audit_events
 for each row execute function public.fueltrack_v3_block_audit_mutation();

-- Guard performs authorization on *every* RPC invocation, even for reads.
-- Admin-only transitions until a verified fuel-attendant permission model exists.
create or replace function public.fueltrack_v3_guard(
 p_board_id uuid, p_admin boolean default false, p_write boolean default false
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_ws uuid; v_role text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_ws:=public.current_workspace_id(v_user);
 if v_ws is null or not public.has_module_access('fueltrack-plus',v_user) then
  raise exception 'FuelTrack module access denied' using errcode='42501';
 end if;
 v_role:=public.module_role_for('fueltrack-plus',v_user);
 if v_role not in ('Admin','User') or (p_admin and v_role<>'Admin') then
  raise exception 'FuelTrack role denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.work_boards b
    where b.id=p_board_id and b.workspace_id=v_ws
      and b.name='FuelTrack+ v3'
      and b.description like '[APSYNTRA:MODULE:fueltrack:v1]%'
      and b.status='active') then
  raise exception 'FuelTrack board not available' using errcode='42501';
 end if;
 if public.work_board_access(p_board_id,case when p_write then 'edit' else 'view' end) is distinct from true then
  raise exception 'FuelTrack board access denied' using errcode='42501';
 end if;
 return v_ws;
end; $$;

-- Validates a bounded, type-specific request payload; values remain server-owned.
create or replace function public.fueltrack_v3_valid_details(p_kind text,p jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare v_count integer;
begin
 if p_kind not in ('vehicle','container') or jsonb_typeof(p)<>'object' or
    pg_catalog.octet_length(p::text)>8192 then return false; end if;
 if nullif(pg_catalog.btrim(coalesce(p->>'purpose','')),'') is null or
    pg_catalog.char_length(p->>'purpose')>500 then return false; end if;
 -- Never persist caller-supplied identity, role, status, audit, or extra keys.
 if exists (
   select 1 from jsonb_object_keys(p) as item(k)
   where not (
     (p_kind='vehicle' and item.k in
       ('plate','owner','origin','destination','purpose','odometer','distance'))
     or (p_kind='container' and item.k in
       ('containerCount','responsiblePerson','purpose'))
   )
 ) then return false; end if;
 if p_kind='vehicle' then
  if nullif(pg_catalog.btrim(coalesce(p->>'plate','')),'') is null or
     nullif(pg_catalog.btrim(coalesce(p->>'owner','')),'') is null or
     nullif(pg_catalog.btrim(coalesce(p->>'origin','')),'') is null or
     nullif(pg_catalog.btrim(coalesce(p->>'destination','')),'') is null or
     pg_catalog.char_length(p->>'plate')>40 or pg_catalog.char_length(p->>'owner')>150 or
     pg_catalog.char_length(p->>'origin')>240 or pg_catalog.char_length(p->>'destination')>240
  then return false; end if;
  if p ? 'odometer' and (jsonb_typeof(p->'odometer')<>'number' or
     ((p->>'odometer')::numeric<0 or (p->>'odometer')::numeric>1000000000)) then return false; end if;
  if p ? 'distance' and (jsonb_typeof(p->'distance')<>'number' or
     ((p->>'distance')::numeric<0 or (p->>'distance')::numeric>10000000)) then return false; end if;
 else
  if nullif(pg_catalog.btrim(coalesce(p->>'responsiblePerson','')),'') is null or
     pg_catalog.char_length(p->>'responsiblePerson')>150 or
     jsonb_typeof(p->'containerCount')<>'number' then return false; end if;
  v_count:=(p->>'containerCount')::integer;
  if v_count<1 or v_count>10000 or (p->>'containerCount')::numeric<>v_count then return false; end if;
 end if;
 return true;
exception when others then return false;
end; $$;

-- Idempotent create: only the signed requestor owns the submitted record.
create or replace function public.fueltrack_v3_submit(
 p_board_id uuid,p_client_key uuid,p_kind text,p_details jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_user uuid:=auth.uid(); r public.fueltrack_v3_requests%rowtype;
 v_inserted boolean:=false;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,true);
 if p_client_key is null or not public.fueltrack_v3_valid_details(p_kind,p_details) then
  raise exception 'Invalid fuel request details' using errcode='22023';
 end if;
 insert into public.fueltrack_v3_requests(workspace_id,board_id,requested_by,client_key,kind,details)
 values(v_ws,p_board_id,v_user,p_client_key,p_kind,p_details)
 on conflict(workspace_id,requested_by,client_key) do nothing
 returning * into r;
 v_inserted:=found;
 if not v_inserted then
  select * into r from public.fueltrack_v3_requests
    where workspace_id=v_ws and requested_by=v_user and client_key=p_client_key;
  if r.id is null or r.board_id<>p_board_id or r.kind<>p_kind or r.details<>p_details then
    raise exception 'Idempotency key belongs to different request' using errcode='23505';
  end if;
 else
  insert into public.fueltrack_v3_audit_events
   (workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state)
   values(v_ws,p_board_id,r.id,r.revision,v_user,'submit',null,'submitted');
  perform public.append_module_activity('fueltrack-plus',
   'ft3-'||r.id::text||'-submit','submit','Fuel request submitted','New fuel request',r.id::text,
   jsonb_build_object('kind',r.kind,'revision',r.revision));
 end if;
 return jsonb_build_object('id',r.id,'state',r.state,'revision',r.revision,
    'idempotent',not v_inserted);
end; $$;

-- Reads use the same signed access guard; Users see only their own requests.
-- Aggregates are computed from precisely the rows visible to that actor.
create or replace function public.fueltrack_v3_read(p_board_id uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_user uuid:=auth.uid(); v_admin boolean; v_rows jsonb; v_summary jsonb;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,false);
 v_admin:=public.module_role_for('fueltrack-plus',v_user)='Admin';
 if p_limit is null or p_limit<1 or p_limit>200 then
  raise exception 'Invalid page size' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 into v_rows from (
   select r.id,r.kind,r.details,r.state,r.revision,r.requested_by,r.created_at,
     r.updated_at,r.decided_at,r.refueled_at,r.completed_at,r.actual_amount,
     r.fuel_liters,r.receipt_number
   from public.fueltrack_v3_requests r
   where r.workspace_id=v_ws and r.board_id=p_board_id and (v_admin or r.requested_by=v_user)
   order by r.created_at desc,r.id desc limit p_limit
 ) t;
 select jsonb_build_object(
  'total',count(*),
  'submitted',count(*) filter(where state='submitted'),
  'approved',count(*) filter(where state='approved'),
  'rejected',count(*) filter(where state='rejected'),
  'refuelingDone',count(*) filter(where state='refueling_done'),
  'completed',count(*) filter(where state='completed'),
  'pendingCount',count(*) filter(where state='submitted'),
  'activeQueue',count(*) filter(where state in ('approved','refueling_done')),
  'overdueCount',count(*) filter(where state='approved'
    and created_at < now()-interval '24 hours'),
  'approvedToday',count(*) filter(where decided_at at time zone 'Asia/Manila' >=
    date_trunc('day',now() at time zone 'Asia/Manila') and rejection_reason is null),
  'rejectedToday',count(*) filter(where decided_at at time zone 'Asia/Manila' >=
    date_trunc('day',now() at time zone 'Asia/Manila') and state='rejected'),
  'completedToday',count(*) filter(where completed_at at time zone 'Asia/Manila' >=
    date_trunc('day',now() at time zone 'Asia/Manila')),
  'totalAmount',coalesce(sum(actual_amount) filter(where state='completed'),0),
  'totalLiters',coalesce(sum(fuel_liters) filter(where state='completed'),0)
 ) into v_summary
 from public.fueltrack_v3_requests r
 where r.workspace_id=v_ws and r.board_id=p_board_id and (v_admin or r.requested_by=v_user);
 return jsonb_build_object('status','VERIFIED_READ','boardId',p_board_id,
    'workspaceId',v_ws,'role',case when v_admin then 'Admin' else 'User' end,
    'rows',v_rows,'summary',v_summary,'limit',p_limit);
end; $$;

-- Admin review is a single compare-and-swap transition.
create or replace function public.fueltrack_v3_decide(
 p_board_id uuid,p_request_id uuid,p_expected_revision bigint,
 p_decision text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; r public.fueltrack_v3_requests%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 if p_decision not in ('approved','rejected') or p_expected_revision is null or
    p_expected_revision<1 or char_length(coalesce(p_reason,''))>1000 or
    (p_decision='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null) then
  raise exception 'Invalid review decision' using errcode='22023'; end if;
 update public.fueltrack_v3_requests set state=p_decision,revision=revision+1,
    decided_by=auth.uid(),decided_at=now(),rejection_reason=
      case when p_decision='rejected' then btrim(p_reason) else null end,
    updated_at=now()
 where id=p_request_id and workspace_id=v_ws and board_id=p_board_id
   and state='submitted' and revision=p_expected_revision
 returning * into r;
 if not found then raise exception 'Request changed or access denied' using errcode='40001'; end if;
 insert into public.fueltrack_v3_audit_events
  (workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state)
  values(v_ws,p_board_id,r.id,r.revision,auth.uid(),
   case when p_decision='approved' then 'approve' else 'reject' end,'submitted',p_decision);
 perform public.append_module_activity('fueltrack-plus','ft3-'||r.id::text||'-'||r.revision,
   'review','Fuel request '||p_decision,coalesce(r.rejection_reason,p_decision),
   r.id::text,jsonb_build_object('state',r.state,'revision',r.revision));
 return jsonb_build_object('id',r.id,'state',r.state,'revision',r.revision);
end; $$;

-- Refueling is two explicit server transactions, never a client-only status.
create or replace function public.fueltrack_v3_mark_refueled(
 p_board_id uuid,p_request_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; r public.fueltrack_v3_requests%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 update public.fueltrack_v3_requests set state='refueling_done',revision=revision+1,
  refueled_by=auth.uid(),refueled_at=now(),updated_at=now()
 where id=p_request_id and workspace_id=v_ws and board_id=p_board_id and
   state='approved' and revision=p_expected_revision
 returning * into r;
 if not found then raise exception 'Request changed or access denied' using errcode='40001'; end if;
 insert into public.fueltrack_v3_audit_events
  (workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state)
  values(v_ws,p_board_id,r.id,r.revision,auth.uid(),'refuel','approved','refueling_done');
 perform public.append_module_activity('fueltrack-plus','ft3-'||r.id::text||'-'||r.revision,
  'review','Refueling marked done','Physical refueling confirmed',r.id::text,
  jsonb_build_object('state',r.state,'revision',r.revision));
 return jsonb_build_object('id',r.id,'state',r.state,'revision',r.revision);
end; $$;

create or replace function public.fueltrack_v3_complete(
 p_board_id uuid,p_request_id uuid,p_expected_revision bigint,
 p_actual_amount numeric,p_fuel_liters numeric,p_receipt_number text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; r public.fueltrack_v3_requests%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 if p_actual_amount is null or p_actual_amount<=0 or p_actual_amount>9999999999 or
    p_fuel_liters is null or p_fuel_liters<=0 or p_fuel_liters>999999 or
    char_length(coalesce(p_receipt_number,''))>120 then
  raise exception 'Invalid refueling receipt' using errcode='22023'; end if;
 update public.fueltrack_v3_requests set state='completed',revision=revision+1,
  completed_by=auth.uid(),completed_at=now(),updated_at=now(),
  actual_amount=p_actual_amount,fuel_liters=p_fuel_liters,
  receipt_number=nullif(btrim(coalesce(p_receipt_number,'')),'')
 where id=p_request_id and workspace_id=v_ws and board_id=p_board_id and
   state='refueling_done' and revision=p_expected_revision
 returning * into r;
 if not found then raise exception 'Request changed or access denied' using errcode='40001'; end if;
 insert into public.fueltrack_v3_audit_events
  (workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state)
  values(v_ws,p_board_id,r.id,r.revision,auth.uid(),'complete','refueling_done','completed');
 perform public.append_module_activity('fueltrack-plus','ft3-'||r.id::text||'-'||r.revision,
  'review','Fuel request completed','Refueling receipt recorded',r.id::text,
  jsonb_build_object('state',r.state,'revision',r.revision,
    'amount',r.actual_amount,'liters',r.fuel_liters));
 return jsonb_build_object('id',r.id,'state',r.state,'revision',r.revision);
end; $$;

-- Daily historical aggregates power Analytics without truncating to a UI page.
create or replace function public.fueltrack_v3_analytics(
 p_board_id uuid,p_days integer default 90
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_user uuid:=auth.uid(); v_admin boolean; v_rows jsonb;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,false);
 v_admin:=public.module_role_for('fueltrack-plus',v_user)='Admin';
 if p_days is null or p_days<1 or p_days>365 then
  raise exception 'Invalid analytics window' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.day),'[]'::jsonb)
 into v_rows from (
  select (r.completed_at at time zone 'Asia/Manila')::date as day,
    count(*)::integer as transactions,
    coalesce(sum(r.actual_amount),0) as amount,
    coalesce(sum(r.fuel_liters),0) as liters
  from public.fueltrack_v3_requests r
  where r.workspace_id=v_ws and r.board_id=p_board_id
    and (v_admin or r.requested_by=v_user)
    and r.state='completed'
    and (r.completed_at at time zone 'Asia/Manila')::date >=
      (now() at time zone 'Asia/Manila')::date - (p_days-1)
  group by (r.completed_at at time zone 'Asia/Manila')::date
 ) t;
 return jsonb_build_object('status','VERIFIED_READ','boardId',p_board_id,
  'workspaceId',v_ws,'days',p_days,'daily',v_rows);
end; $$;

-- Only Admin can read immutable transition evidence (distinct from legacy activity).
create or replace function public.fueltrack_v3_audit_read(
 p_board_id uuid,p_before_id bigint default null,p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_events jsonb; v_next bigint; v_has_more boolean;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,false);
 if p_limit is null or p_limit<1 or p_limit>200 or
    (p_before_id is not null and p_before_id<1) then
   raise exception 'Invalid audit page' using errcode='22023';end if;
 with page as (
  select a.id,a.request_id,a.operation,a.to_state,a.from_state,
   a.revision,a.occurred_at,a.actor_id,
   coalesce(p.display_name,p.email,'Actor unavailable') as actor_name
  from public.fueltrack_v3_audit_events a
  left join public.profiles p on p.id=a.actor_id
  where a.workspace_id=v_ws and a.board_id=p_board_id
    and (p_before_id is null or a.id<p_before_id)
  order by a.id desc limit p_limit+1
 ), used as (
   select * from page order by id desc limit p_limit
 )
 select
   coalesce((select jsonb_agg(jsonb_build_object(
    'event_id','ft3-'||id::text,
    'sequence',id,
    'event_type','request_'||operation,
    'title','Fuel request '||operation,
    'message',coalesce(from_state,'new')||' → '||to_state,
    'request_id',request_id,
    'actor_name',actor_name,
    'occurred_at',occurred_at) order by id desc) from used),'[]'::jsonb),
   (select min(id) from used),
   (select count(*)>p_limit from page)
 into v_events,v_next,v_has_more;
 return jsonb_build_object('status','VERIFIED_READ','boardId',p_board_id,
  'workspaceId',v_ws,'events',v_events,'nextCursor',v_next,
  'hasMore',v_has_more);
end; $$;

-- Default privileges are PUBLIC for new functions: explicitly revoke before granting.
revoke all on function public.fueltrack_v3_block_audit_mutation() from public,anon,authenticated;
revoke all on function public.fueltrack_v3_guard(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_valid_details(text,jsonb) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_submit(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_read(uuid,integer) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_decide(uuid,uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_mark_refueled(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_complete(uuid,uuid,bigint,numeric,numeric,text) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_analytics(uuid,integer) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_audit_read(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.fueltrack_v3_analytics(uuid,integer) to authenticated;
grant execute on function public.fueltrack_v3_audit_read(uuid,bigint,integer) to authenticated;
grant execute on function public.fueltrack_v3_submit(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.fueltrack_v3_read(uuid,integer) to authenticated;
grant execute on function public.fueltrack_v3_decide(uuid,uuid,bigint,text,text) to authenticated;
grant execute on function public.fueltrack_v3_mark_refueled(uuid,uuid,bigint) to authenticated;
grant execute on function public.fueltrack_v3_complete(uuid,uuid,bigint,numeric,numeric,text) to authenticated;
