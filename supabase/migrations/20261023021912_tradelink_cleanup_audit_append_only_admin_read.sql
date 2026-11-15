create or replace function public.tradelink_cleanup_audit_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'TradeLink cleanup audit records are append-only' using errcode='42501';
end; $$;
drop trigger if exists tradelink_cleanup_audit_append_only on public.tradelink_attachment_cleanup_audit;
create trigger tradelink_cleanup_audit_append_only before update or delete on public.tradelink_attachment_cleanup_audit for each row execute function public.tradelink_cleanup_audit_immutable();
revoke all on function public.tradelink_cleanup_audit_immutable() from public,anon,authenticated;
create or replace function public.tradelink_reconciliation_cleanup_audit_list(p_limit integer default 50)
returns table(request_id uuid,storage_key text,requested_by uuid,expected_revision bigint,observed_revision bigint,assessment text,execution_status text,requested_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ws uuid;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or
 not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501'; end if;
 ws:=public.current_workspace_id(actor);
 if ws is null then raise exception 'Workspace authorization required' using errcode='42501'; end if;
 return query select a.request_id,a.storage_key,a.requested_by,a.expected_revision,a.observed_revision,a.assessment,a.execution_status,a.requested_at
 from public.tradelink_attachment_cleanup_audit a where a.workspace_id=ws
 order by a.requested_at desc,a.request_id desc limit least(greatest(coalesce(p_limit,50),1),100);
end; $$;
revoke all on function public.tradelink_reconciliation_cleanup_audit_list(integer) from public,anon;
grant execute on function public.tradelink_reconciliation_cleanup_audit_list(integer) to authenticated;;
