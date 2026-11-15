create table if not exists public.tradelink_attachment_cleanup_audit(request_id uuid primary key default gen_random_uuid(),workspace_id uuid not null,storage_key text not null,requested_by uuid not null,expected_revision bigint not null,observed_revision bigint,assessment text not null,storage_object_present boolean,execution_status text not null default 'blocked' check(execution_status='blocked'),requested_at timestamptz not null default now());
create index if not exists tradelink_cleanup_audit_scope_time_idx on public.tradelink_attachment_cleanup_audit(workspace_id,requested_at desc);
alter table public.tradelink_attachment_cleanup_audit enable row level security;
revoke all on public.tradelink_attachment_cleanup_audit from public,anon,authenticated;
create or replace function public.tradelink_reconciliation_request_cleanup(p_storage_key text,p_expected_revision bigint)
returns table(request_id uuid,decision text,observed_revision bigint,deletion_enabled boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();ws uuid;guard record;logged_id uuid;
begin
if actor is null or not public.has_module_access('tradelink',actor) or not(public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
ws:=public.current_workspace_id(actor);
if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
raise exception 'Invalid cleanup candidate or revision' using errcode='22023';end if;
select v.decision,v.current_revision,v.storage_object_present into guard from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
if not found then raise exception 'Reconciliation verification unavailable' using errcode='22023';end if;
insert into public.tradelink_attachment_cleanup_audit(workspace_id,storage_key,requested_by,expected_revision,observed_revision,assessment,storage_object_present)
values(ws,p_storage_key,actor,p_expected_revision,guard.current_revision,guard.decision,guard.storage_object_present)
returning public.tradelink_attachment_cleanup_audit.request_id into logged_id;
return query select logged_id,('blocked:'||guard.decision)::text,guard.current_revision::bigint,false;
end;$$;
revoke all on function public.tradelink_reconciliation_request_cleanup(text,bigint) from public,anon;
grant execute on function public.tradelink_reconciliation_request_cleanup(text,bigint) to authenticated;;
