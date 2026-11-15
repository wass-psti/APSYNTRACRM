-- Material Tracker host access-context integration.
-- Preserve Material Tracker membership as its authoritative app-scoped RBAC source.
-- Do not duplicate ADMIN/USER/VIEWER into module_role_assignments.

do $$
begin
  if to_regclass('public.material_tracker_memberships') is null then
    raise exception 'Material Tracker backend contract is missing public.material_tracker_memberships';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='material_tracker_bootstrap') then
    raise exception 'Material Tracker backend contract is missing public.material_tracker_bootstrap';
  end if;
end $$;

create or replace function public.wm_auth_access_context()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_assignments jsonb;
  v_revision timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'display_name', p.display_name,
    'platform_role', p.platform_role,
    'status', p.status,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ), p.updated_at
  into v_profile, v_revision
  from public.profiles p
  where p.id = v_user_id;

  if v_profile is null then
    raise exception 'Authenticated profile is missing' using errcode = 'P0002';
  end if;

  with assignments as (
    select m.user_id, m.module_id, m.role, m.enabled, m.updated_at
    from public.module_role_assignments m
    where m.user_id = v_user_id
    union all
    select mt.user_id, 'material-tracker'::text, mt.role,
      (mt.enabled = true and mt.status = 'active') as enabled, mt.updated_at
    from public.material_tracker_memberships mt
    join public.workspace_members wm
      on wm.workspace_id = mt.workspace_id and wm.user_id = mt.user_id and wm.active = true
    where mt.user_id = v_user_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', a.user_id,
        'module_id', a.module_id,
        'role', a.role,
        'enabled', a.enabled,
        'updated_at', a.updated_at
      ) order by a.module_id
    ),
    '[]'::jsonb
  ), greatest(v_revision, max(a.updated_at))
  into v_assignments, v_revision
  from assignments a;

  return jsonb_build_object(
    'schema_version', '1.43.2-m39-v1',
    'user_id', v_user_id,
    'profile', v_profile,
    'assignments', v_assignments,
    'revision', coalesce(v_revision, now())
  );
end;
$$;

revoke all on function public.wm_auth_access_context() from public;
revoke all on function public.wm_auth_access_context() from anon;
grant execute on function public.wm_auth_access_context() to authenticated;;
