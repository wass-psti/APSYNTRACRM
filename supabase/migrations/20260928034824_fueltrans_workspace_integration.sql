create schema if not exists private;

create table if not exists public.fueltrans_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist','unioil','aramco','rephil','petron','viewer')),
  client_code text,
  enabled boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint fueltrans_membership_client_role_ck check ((role in ('unioil','aramco','rephil','petron') and client_code is not null) or role not in ('unioil','aramco','rephil','petron'))
);
create index if not exists fueltrans_memberships_role_idx on public.fueltrans_memberships(workspace_id, role) where enabled;

create table if not exists public.fueltrans_tickets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  ticket_number text,
  client_code text,
  created_by uuid references public.profiles(id) on delete set null,
  assigned_l1 uuid references public.profiles(id) on delete set null,
  assigned_l2 uuid references public.profiles(id) on delete set null,
  status text not null default 'Open',
  archived boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists fueltrans_tickets_workspace_status_idx on public.fueltrans_tickets(workspace_id, status, updated_at desc);
create index if not exists fueltrans_tickets_workspace_client_idx on public.fueltrans_tickets(workspace_id, client_code, updated_at desc);
create index if not exists fueltrans_tickets_created_by_idx on public.fueltrans_tickets(workspace_id, created_by);

create table if not exists public.fueltrans_user_state (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_key text not null,
  value jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, state_key)
);

create or replace function private.fueltrans_current_role(p_workspace_id uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else (select m.role from public.fueltrans_memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.enabled = true limit 1) end;
$$;
create or replace function private.fueltrans_current_client(p_workspace_id uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else (select upper(coalesce(m.client_code, m.role)) from public.fueltrans_memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.enabled = true and m.role in ('unioil','aramco','rephil','petron') limit 1) end;
$$;
create or replace function private.fueltrans_is_internal(p_workspace_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.fueltrans_current_role(p_workspace_id) in ('admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist'), false);
$$;
create or replace function private.fueltrans_can_view_ticket(p_workspace_id uuid, p_ticket_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then false when private.fueltrans_is_internal(p_workspace_id) then exists (select 1 from public.fueltrans_tickets t where t.workspace_id = p_workspace_id and t.id = p_ticket_id) else exists (select 1 from public.fueltrans_tickets t where t.workspace_id = p_workspace_id and t.id = p_ticket_id and upper(coalesce(t.client_code,'')) = coalesce(private.fueltrans_current_client(p_workspace_id),'')) end;
$$;
revoke all on function private.fueltrans_current_role(uuid) from public;
revoke all on function private.fueltrans_current_client(uuid) from public;
revoke all on function private.fueltrans_is_internal(uuid) from public;
revoke all on function private.fueltrans_can_view_ticket(uuid,text) from public;
grant usage on schema private to authenticated;
grant execute on function private.fueltrans_current_role(uuid) to authenticated;
grant execute on function private.fueltrans_current_client(uuid) to authenticated;
grant execute on function private.fueltrans_is_internal(uuid) to authenticated;
grant execute on function private.fueltrans_can_view_ticket(uuid,text) to authenticated;

alter table public.fueltrans_memberships enable row level security;
alter table public.fueltrans_tickets enable row level security;
alter table public.fueltrans_user_state enable row level security;
revoke all on public.fueltrans_memberships from anon;
revoke all on public.fueltrans_tickets from anon;
revoke all on public.fueltrans_user_state from anon;
grant select, insert, update, delete on public.fueltrans_memberships to authenticated;
grant select, insert, update, delete on public.fueltrans_tickets to authenticated;
grant select, insert, update, delete on public.fueltrans_user_state to authenticated;

drop policy if exists fueltrans_memberships_select on public.fueltrans_memberships;
create policy fueltrans_memberships_select on public.fueltrans_memberships for select to authenticated using (user_id = (select auth.uid()) or private.fueltrans_current_role(workspace_id) in ('admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist'));
drop policy if exists fueltrans_memberships_insert on public.fueltrans_memberships;
create policy fueltrans_memberships_insert on public.fueltrans_memberships for insert to authenticated with check (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans'));
drop policy if exists fueltrans_memberships_update on public.fueltrans_memberships;
create policy fueltrans_memberships_update on public.fueltrans_memberships for update to authenticated using (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans')) with check (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans'));
drop policy if exists fueltrans_memberships_delete on public.fueltrans_memberships;
create policy fueltrans_memberships_delete on public.fueltrans_memberships for delete to authenticated using (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans'));

drop policy if exists fueltrans_tickets_select on public.fueltrans_tickets;
create policy fueltrans_tickets_select on public.fueltrans_tickets for select to authenticated using (private.fueltrans_is_internal(workspace_id) or upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),''));
drop policy if exists fueltrans_tickets_insert on public.fueltrans_tickets;
create policy fueltrans_tickets_insert on public.fueltrans_tickets for insert to authenticated with check ((private.fueltrans_current_role(workspace_id) in ('admin','call_center_specialist')) or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),'') and created_by = (select auth.uid())));
drop policy if exists fueltrans_tickets_update on public.fueltrans_tickets;
create policy fueltrans_tickets_update on public.fueltrans_tickets for update to authenticated using (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans','global_l1_support','local_l2_support') or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),'') and created_by = (select auth.uid()))) with check (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans','global_l1_support','local_l2_support') or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),'') and created_by = (select auth.uid())));
drop policy if exists fueltrans_tickets_delete on public.fueltrans_tickets;
create policy fueltrans_tickets_delete on public.fueltrans_tickets for delete to authenticated using (private.fueltrans_current_role(workspace_id) = 'admin');

drop policy if exists fueltrans_user_state_select on public.fueltrans_user_state;
create policy fueltrans_user_state_select on public.fueltrans_user_state for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists fueltrans_user_state_insert on public.fueltrans_user_state;
create policy fueltrans_user_state_insert on public.fueltrans_user_state for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists fueltrans_user_state_update on public.fueltrans_user_state;
create policy fueltrans_user_state_update on public.fueltrans_user_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists fueltrans_user_state_delete on public.fueltrans_user_state;
create policy fueltrans_user_state_delete on public.fueltrans_user_state for delete to authenticated using (user_id = (select auth.uid()));

insert into public.fueltrans_memberships (workspace_id, user_id, role, enabled, assigned_by)
select '00000000-0000-4000-8000-000000000001'::uuid, p.id, 'fueltrans', true, null from public.profiles p where p.platform_role = 'admin_general_manager' and p.status = 'active' on conflict (workspace_id, user_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit) values ('fueltrans-evidence', 'fueltrans-evidence', false, 26214400) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists fueltrans_evidence_select on storage.objects;
create policy fueltrans_evidence_select on storage.objects for select to authenticated using (bucket_id = 'fueltrans-evidence' and private.fueltrans_can_view_ticket(nullif((storage.foldername(name))[1], '')::uuid, (storage.foldername(name))[2]));
drop policy if exists fueltrans_evidence_insert on storage.objects;
create policy fueltrans_evidence_insert on storage.objects for insert to authenticated with check (bucket_id = 'fueltrans-evidence' and private.fueltrans_can_view_ticket(nullif((storage.foldername(name))[1], '')::uuid, (storage.foldername(name))[2]) and private.fueltrans_current_role(nullif((storage.foldername(name))[1], '')::uuid) <> 'viewer');
drop policy if exists fueltrans_evidence_update on storage.objects;
create policy fueltrans_evidence_update on storage.objects for update to authenticated using (bucket_id = 'fueltrans-evidence' and private.fueltrans_current_role(nullif((storage.foldername(name))[1], '')::uuid) = 'admin') with check (bucket_id = 'fueltrans-evidence' and private.fueltrans_current_role(nullif((storage.foldername(name))[1], '')::uuid) = 'admin');
drop policy if exists fueltrans_evidence_delete on storage.objects;
create policy fueltrans_evidence_delete on storage.objects for delete to authenticated using (bucket_id = 'fueltrans-evidence' and private.fueltrans_current_role(nullif((storage.foldername(name))[1], '')::uuid) = 'admin');;
