alter table public.fueltrans_memberships add column if not exists display_name text;
alter table public.fueltrans_memberships add column if not exists email text;
update public.fueltrans_memberships m set display_name = coalesce(p.display_name, p.email), email = p.email, updated_at = now() from public.profiles p where p.id = m.user_id and (m.display_name is null or m.email is null);
create index if not exists fueltrans_memberships_email_idx on public.fueltrans_memberships(workspace_id, lower(email)) where email is not null;;
