-- Stage G M39 — Authentication, Session & Access Context Stabilization
-- One authenticated, read-only transaction snapshot for the current user's profile
-- and module assignments. No user id is accepted from the browser.

create or replace function public.wm_auth_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'module_id', m.module_id,
        'role', m.role,
        'enabled', m.enabled,
        'updated_at', m.updated_at
      ) order by m.module_id
    ),
    '[]'::jsonb
  ), greatest(v_revision, max(m.updated_at))
  into v_assignments, v_revision
  from public.module_role_assignments m
  where m.user_id = v_user_id;

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
grant execute on function public.wm_auth_access_context() to authenticated;
notify pgrst, 'reload schema';
