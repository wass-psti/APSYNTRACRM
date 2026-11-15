do $$
declare
  missing text[] := array[]::text[];
begin
  if to_regclass('public.fueltrans_memberships') is null then missing := array_append(missing, 'public.fueltrans_memberships'); end if;
  if to_regclass('public.fueltrans_tickets') is null then missing := array_append(missing, 'public.fueltrans_tickets'); end if;
  if to_regclass('public.fueltrans_user_state') is null then missing := array_append(missing, 'public.fueltrans_user_state'); end if;

  if array_length(missing, 1) is not null then
    raise exception 'FuelTrans host schema missing required relations: %', array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='workspace_id' and data_type='uuid') then raise exception 'fueltrans_memberships.workspace_id uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='user_id' and data_type='uuid') then raise exception 'fueltrans_memberships.user_id uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='role' and data_type='text') then raise exception 'fueltrans_memberships.role text is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='client_code' and data_type='text') then raise exception 'fueltrans_memberships.client_code text is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='enabled' and data_type='boolean') then raise exception 'fueltrans_memberships.enabled boolean is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_memberships' and column_name='status' and data_type='text') then raise exception 'fueltrans_memberships.status text is required'; end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_tickets' and column_name='workspace_id' and data_type='uuid') then raise exception 'fueltrans_tickets.workspace_id uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_tickets' and column_name='created_by' and data_type='uuid') then raise exception 'fueltrans_tickets.created_by uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_tickets' and column_name='assigned_l1' and data_type='uuid') then raise exception 'fueltrans_tickets.assigned_l1 uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_tickets' and column_name='assigned_l2' and data_type='uuid') then raise exception 'fueltrans_tickets.assigned_l2 uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_tickets' and column_name='payload' and data_type='jsonb') then raise exception 'fueltrans_tickets.payload jsonb is required'; end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_user_state' and column_name='workspace_id' and data_type='uuid') then raise exception 'fueltrans_user_state.workspace_id uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_user_state' and column_name='user_id' and data_type='uuid') then raise exception 'fueltrans_user_state.user_id uuid is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_user_state' and column_name='state_key' and data_type='text') then raise exception 'fueltrans_user_state.state_key text is required'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fueltrans_user_state' and column_name='revision' and data_type='bigint') then raise exception 'fueltrans_user_state.revision bigint is required'; end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='fueltrans_memberships' and c.relrowsecurity) then raise exception 'RLS must be enabled on fueltrans_memberships'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='fueltrans_tickets' and c.relrowsecurity) then raise exception 'RLS must be enabled on fueltrans_tickets'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='fueltrans_user_state' and c.relrowsecurity) then raise exception 'RLS must be enabled on fueltrans_user_state'; end if;

  if to_regprocedure('private.fueltrans_current_role(uuid)') is null then raise exception 'private.fueltrans_current_role(uuid) is required'; end if;
  if to_regprocedure('private.fueltrans_current_client(uuid)') is null then raise exception 'private.fueltrans_current_client(uuid) is required'; end if;
  if to_regprocedure('private.fueltrans_is_internal(uuid)') is null then raise exception 'private.fueltrans_is_internal(uuid) is required'; end if;

  if has_function_privilege('anon', 'private.fueltrans_current_role(uuid)', 'EXECUTE') then raise exception 'anon must not execute private.fueltrans_current_role(uuid)'; end if;
  if not has_function_privilege('authenticated', 'private.fueltrans_current_role(uuid)', 'EXECUTE') then raise exception 'authenticated must execute private.fueltrans_current_role(uuid)'; end if;
end
$$;;
