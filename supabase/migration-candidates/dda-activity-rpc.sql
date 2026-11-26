-- CP-DDA-FE-03A: candidate RPC boundary, not deployed automatically.
-- Depends on dda-activity-persistence.sql and existing CRM session/workspace helpers.
-- DDA has no independent role hierarchy. The active CRM workspace and existing
-- workforce identity are the authority; actor IDs never come from the browser.
begin;
revoke all on schema dda from public, anon, authenticated, service_role;
revoke all on all tables in schema dda from public, anon, authenticated, service_role;
revoke all on all functions in schema dda from public, anon, authenticated, service_role;

create function dda.require_actor(p_workspace_id uuid)
returns uuid language plpgsql stable security invoker set search_path='' as $actor$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not coalesce(private.wm_board_config_session_active(),false) then
    raise exception 'A signed CRM session is required' using errcode='28000';
  end if;
  if p_workspace_id is null or public.current_workspace_id(v_actor) is distinct from p_workspace_id then
    raise exception 'DDA requires the active CRM workspace' using errcode='42501';
  end if;
  if not exists(select 1 from agt.person p where p.workspace_id=p_workspace_id
      and p.user_id=v_actor and p.identity_kind='crm-user') then
    raise exception 'DDA workforce identity unavailable' using errcode='42501';
  end if;
  return v_actor;
end $actor$;

-- Private definer entry points are required because AGT and DDA tables are not
-- directly readable/writable by authenticated roles. Each entry checks the
-- current session and workspace before invoking the internal transaction.
create function dda.signed_snapshot(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $snapshot$
begin
  perform dda.require_actor(p_workspace_id);
  return dda.snapshot(p_workspace_id);
end $snapshot$;

create function dda.signed_submit(p_workspace_id uuid,p_request_id uuid,
    p_expected_revision bigint,p_action text,p_record jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $submit$
declare
  v_actor uuid := dda.require_actor(p_workspace_id);
begin
  return dda.submit(p_workspace_id,v_actor,p_request_id,p_expected_revision,p_action,p_record);
end $submit$;

-- The exposed functions remain SECURITY INVOKER, matching the CRM pattern.
create function public.dda_snapshot_v1(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $rpc$
  select dda.signed_snapshot(p_workspace_id)
$rpc$;
create function public.dda_submit_v1(p_workspace_id uuid,p_request_id uuid,
    p_expected_revision bigint,p_action text,p_record jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $rpc$
  select dda.signed_submit(p_workspace_id,p_request_id,p_expected_revision,p_action,p_record)
$rpc$;

revoke all on function dda.require_actor(uuid),dda.signed_snapshot(uuid),
  dda.signed_submit(uuid,uuid,bigint,text,jsonb),public.dda_snapshot_v1(uuid),
  public.dda_submit_v1(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema dda to authenticated;
grant execute on function dda.signed_snapshot(uuid),dda.signed_submit(uuid,uuid,bigint,text,jsonb),
  public.dda_snapshot_v1(uuid),public.dda_submit_v1(uuid,uuid,bigint,text,jsonb) to authenticated;
commit;
