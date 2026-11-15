create or replace function public.tradelink_reconciliation_cleanup_preflight(p_storage_key text,p_expected_revision bigint)
returns table(decision text,observed_revision bigint,eligible_for_review boolean,deletion_enabled boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ws uuid; candidate record; verified record;
begin
 if actor is null or not public.has_module_access('tradelink',actor)
    or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
   raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
   raise exception 'Invalid cleanup candidate or revision' using errcode='22023';
 end if;
 select c.created_at,c.status into candidate from public.tradelink_attachment_reconciliation c
 where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select v.decision,v.current_revision,v.storage_object_present into verified
 from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
 if not found then raise exception 'Reconciliation verification unavailable' using errcode='22023'; end if;
 return query select
 case
  when candidate.created_at>now()-interval '24 hours' then 'blocked:grace-period'
  when verified.decision<>'unreferenced-at-locked-revision' then 'blocked:'||verified.decision
  when not verified.storage_object_present then 'blocked:object-absent'
  else 'review-only:unreferenced-at-revision'
 end::text,
 verified.current_revision::bigint,
 (candidate.created_at<=now()-interval '24 hours' and verified.decision='unreferenced-at-locked-revision' and verified.storage_object_present)::boolean,
 false::boolean;
end; $$;
revoke all on function public.tradelink_reconciliation_cleanup_preflight(text,bigint) from public,anon;
grant execute on function public.tradelink_reconciliation_cleanup_preflight(text,bigint) to authenticated;;
