alter table public.fueltrans_memberships
  add column if not exists status text not null default 'active';

alter table public.fueltrans_memberships
  drop constraint if exists fueltrans_memberships_status_ck;
alter table public.fueltrans_memberships
  add constraint fueltrans_memberships_status_ck
  check (status in ('active','inactive','suspended','pending'));

update public.fueltrans_memberships m
set role = 'admin', status = 'active', enabled = true, updated_at = now()
from public.profiles p
where p.id = m.user_id
  and p.platform_role = 'admin_general_manager'
  and p.status = 'active'
  and m.workspace_id = '00000000-0000-4000-8000-000000000001'::uuid
  and m.role = 'fueltrans';

create table if not exists public.fueltrans_sessions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  terminated_at timestamptz,
  terminated_by uuid references public.profiles(id) on delete set null,
  primary key (workspace_id, session_id)
);
create index if not exists fueltrans_sessions_user_activity_idx on public.fueltrans_sessions(workspace_id, user_id, last_activity desc);

create table if not exists public.fueltrans_audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  action text,
  user_name text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists fueltrans_audit_events_workspace_time_idx on public.fueltrans_audit_events(workspace_id, occurred_at desc);
create index if not exists fueltrans_audit_events_target_idx on public.fueltrans_audit_events(workspace_id, target_user_id, occurred_at desc);

alter table public.fueltrans_sessions enable row level security;
alter table public.fueltrans_audit_events enable row level security;
revoke all on public.fueltrans_sessions from anon;
revoke all on public.fueltrans_audit_events from anon;
grant select, insert, update, delete on public.fueltrans_sessions to authenticated;
grant select, insert on public.fueltrans_audit_events to authenticated;
grant usage, select on sequence public.fueltrans_audit_events_id_seq to authenticated;

drop policy if exists fueltrans_memberships_insert on public.fueltrans_memberships;
create policy fueltrans_memberships_insert on public.fueltrans_memberships for insert to authenticated with check (private.fueltrans_current_role(workspace_id) = 'admin');
drop policy if exists fueltrans_memberships_update on public.fueltrans_memberships;
create policy fueltrans_memberships_update on public.fueltrans_memberships for update to authenticated using (private.fueltrans_current_role(workspace_id) = 'admin') with check (private.fueltrans_current_role(workspace_id) = 'admin');
drop policy if exists fueltrans_memberships_delete on public.fueltrans_memberships;
create policy fueltrans_memberships_delete on public.fueltrans_memberships for delete to authenticated using (private.fueltrans_current_role(workspace_id) = 'admin');

create or replace function private.fueltrans_current_role(p_workspace_id uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else (select m.role from public.fueltrans_memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.enabled = true and m.status = 'active' limit 1) end;
$$;
create or replace function private.fueltrans_current_client(p_workspace_id uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else (select upper(coalesce(m.client_code, m.role)) from public.fueltrans_memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.enabled = true and m.status = 'active' and m.role in ('unioil','aramco','rephil','petron') limit 1) end;
$$;
revoke all on function private.fueltrans_current_role(uuid) from public;
revoke all on function private.fueltrans_current_client(uuid) from public;
grant execute on function private.fueltrans_current_role(uuid) to authenticated;
grant execute on function private.fueltrans_current_client(uuid) to authenticated;

drop policy if exists fueltrans_sessions_select on public.fueltrans_sessions;
create policy fueltrans_sessions_select on public.fueltrans_sessions for select to authenticated using (user_id = (select auth.uid()) or private.fueltrans_current_role(workspace_id) = 'admin');
drop policy if exists fueltrans_sessions_insert on public.fueltrans_sessions;
create policy fueltrans_sessions_insert on public.fueltrans_sessions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists fueltrans_sessions_update on public.fueltrans_sessions;
create policy fueltrans_sessions_update on public.fueltrans_sessions for update to authenticated using (user_id = (select auth.uid()) or private.fueltrans_current_role(workspace_id) = 'admin') with check (user_id = (select auth.uid()) or private.fueltrans_current_role(workspace_id) = 'admin');
drop policy if exists fueltrans_sessions_delete on public.fueltrans_sessions;
create policy fueltrans_sessions_delete on public.fueltrans_sessions for delete to authenticated using (user_id = (select auth.uid()) or private.fueltrans_current_role(workspace_id) = 'admin');

drop policy if exists fueltrans_audit_events_select on public.fueltrans_audit_events;
create policy fueltrans_audit_events_select on public.fueltrans_audit_events for select to authenticated using (private.fueltrans_current_role(workspace_id) = 'admin');
drop policy if exists fueltrans_audit_events_insert on public.fueltrans_audit_events;
create policy fueltrans_audit_events_insert on public.fueltrans_audit_events for insert to authenticated with check (actor_user_id = (select auth.uid()));

create or replace function private.fueltrans_guard_ticket_mutation() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  v_role := private.fueltrans_current_role(new.workspace_id);
  if tg_op = 'UPDATE' and v_role in ('unioil','aramco','rephil','petron') then
    if new.client_code is distinct from old.client_code or new.created_by is distinct from old.created_by or new.assigned_l1 is distinct from old.assigned_l1 or new.assigned_l2 is distinct from old.assigned_l2 or new.status is distinct from old.status or new.archived is distinct from old.archived then
      raise exception 'FuelTrans client accounts cannot modify workflow authority fields';
    end if;
  end if;
  if tg_op = 'UPDATE' and v_role in ('fueltrans','watchdog_employee','call_center_specialist') then
    if new.client_code is distinct from old.client_code or new.created_by is distinct from old.created_by or new.assigned_l1 is distinct from old.assigned_l1 or new.assigned_l2 is distinct from old.assigned_l2 or new.status is distinct from old.status or new.archived is distinct from old.archived then
      raise exception 'FuelTrans role is not permitted to modify workflow authority fields';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.fueltrans_guard_ticket_mutation() from public;
drop trigger if exists fueltrans_guard_ticket_mutation on public.fueltrans_tickets;
create trigger fueltrans_guard_ticket_mutation before update on public.fueltrans_tickets for each row execute function private.fueltrans_guard_ticket_mutation();;
