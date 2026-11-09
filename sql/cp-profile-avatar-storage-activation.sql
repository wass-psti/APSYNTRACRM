-- APSYNTRA CRM account avatars: private Storage, shared-workspace reads,
-- self-owned immutable objects, and compare-and-swap profile references.
begin;

alter table public.profiles
  add column if not exists avatar_path text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass
      and conname='profiles_avatar_path_owner_shape'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_owner_shape
      check (
        avatar_path is null
        or avatar_path ~ (
          '^' || id::text ||
          '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
        )
      );
  end if;
end
$constraint$;

insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  ('account-avatars', 'account-avatars', false, 400000, array['image/webp']::text[])
on conflict (id) do nothing;

do $bucket$
declare
  current_bucket storage.buckets%rowtype;
begin
  select * into current_bucket
  from storage.buckets where id='account-avatars';
  if not found
     or current_bucket.public is distinct from false
     or current_bucket.file_size_limit is distinct from 400000
     or current_bucket.allowed_mime_types is distinct from array['image/webp']::text[] then
    raise exception 'account-avatars bucket exists with unexpected security configuration';
  end if;
end
$bucket$;

create or replace function private.profile_avatar_can_read(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles owner_profile
      where owner_profile.id = p_owner_id
        and owner_profile.status = 'active'
        and (
          owner_profile.id = auth.uid()
          or exists (
            select 1
            from public.profiles viewer_profile
            join public.workspace_members viewer_members
              on viewer_members.user_id = viewer_profile.id
             and viewer_members.active = true
            join public.workspace_members owner_members
              on owner_members.workspace_id = viewer_members.workspace_id
             and owner_members.user_id = owner_profile.id
             and owner_members.active = true
            where viewer_profile.id = auth.uid()
              and viewer_profile.status = 'active'
          )
        )
    ),
    false
  );
$function$;

revoke all on function private.profile_avatar_can_read(uuid) from public, anon;
grant execute on function private.profile_avatar_can_read(uuid) to authenticated;

create policy "account_avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'account-avatars'
  and owner_id = (select auth.uid()::text)
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
);

create policy "account_avatars_read_shared_workspace"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'account-avatars'
  and cardinality(storage.foldername(name)) = 1
  and owner_id = (storage.foldername(name))[1]
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info'
  ])
  and private.profile_avatar_can_read(((storage.foldername(name))[1])::uuid)
);

create policy "account_avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'account-avatars'
  and owner_id = (select auth.uid()::text)
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
);

create or replace function public.set_own_profile_avatar(
  p_avatar_path text,
  p_expected_avatar_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_expected_avatar_path is not null
     and p_expected_avatar_path !~ (
       '^' || v_actor::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
     ) then
    raise exception 'Invalid expected avatar reference' using errcode = '22023';
  end if;

  if p_avatar_path is not null then
    if p_avatar_path !~ (
      '^' || v_actor::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
    ) then
      raise exception 'Invalid avatar reference' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from storage.objects object_row
      where object_row.bucket_id = 'account-avatars'
        and object_row.name = p_avatar_path
        and object_row.owner_id = v_actor::text
    ) then
      raise exception 'Avatar upload is missing or not owned by this account'
        using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set avatar_path = p_avatar_path,
         updated_at = clock_timestamp()
   where id = v_actor
     and status = 'active'
     and avatar_path is not distinct from p_expected_avatar_path
  returning updated_at into v_updated_at;

  if not found then
    raise exception 'Profile avatar changed; reload and retry'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'avatar_path', p_avatar_path,
    'updated_at', v_updated_at
  );
end;
$function$;

revoke all on function public.set_own_profile_avatar(text, text) from public, anon;
grant execute on function public.set_own_profile_avatar(text, text) to authenticated;

create or replace function public.wm_auth_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_profile jsonb;
  v_assignments jsonb;
  v_revision timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'display_name', p.display_name,
    'avatar_path', p.avatar_path,
    'platform_role', p.platform_role,
    'status', p.status,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ), p.updated_at
  into v_profile, v_revision
  from public.profiles p
  where p.id = v_actor;

  if v_profile is null then
    raise exception 'Authenticated profile is missing' using errcode = 'P0002';
  end if;

  -- Preserve the authoritative Material Tracker assignment projection.
  with assignments as (
    select m.user_id, m.module_id, m.role, m.enabled, m.updated_at
    from public.module_role_assignments m
    where m.user_id = v_actor
    union all
    select mt.user_id, 'material-tracker'::text, mt.role,
      (mt.enabled = true and mt.status = 'active') as enabled, mt.updated_at
    from public.material_tracker_memberships mt
    join public.workspace_members wm
      on wm.workspace_id = mt.workspace_id
     and wm.user_id = mt.user_id
     and wm.active = true
    where mt.user_id = v_actor
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'module_id', a.module_id,
      'role', a.role,
      'enabled', a.enabled,
      'updated_at', a.updated_at
    ) order by a.module_id),
    '[]'::jsonb
  ), greatest(v_revision, max(a.updated_at))
  into v_assignments, v_revision
  from assignments a;

  -- Preserve host-authoritative active workspace resolution.
  if v_profile->>'status' = 'active' then
    v_workspace := public.current_workspace_id(v_actor);
    if v_workspace is not null and not exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = v_workspace
        and wm.user_id = v_actor
        and wm.active
    ) then
      v_workspace := null;
    end if;
  end if;

  return jsonb_build_object(
    'schema_version', '1.43.3-profile-avatar',
    'user_id', v_actor,
    'workspace_id', v_workspace,
    'profile', v_profile,
    'assignments', v_assignments,
    'revision', coalesce(v_revision, now())
  );
end;
$function$;

commit;
