create or replace function public.tradelink_cleanup_fence_activate(p_storage_key text,p_expected_revision bigint)
returns table(decision text,expires_at timestamptz,deletion_enabled boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ws uuid; state_revision bigint; candidate_created timestamptz; check_result record; fence_expiry timestamptz;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid fence parameters' using errcode='22023';end if;
 select e.revision into state_revision from public.module_state_entries e where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared' and e.owner_key='*' for update;
 if not found or state_revision<>p_expected_revision then return query select 'blocked:stale-or-missing-revision'::text,null::timestamptz,false;return;end if;
 select c.created_at into candidate_created from public.tradelink_attachment_reconciliation c where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Candidate not found' using errcode='22023';end if;
 if candidate_created>now()-interval '24 hours' then return query select 'blocked:grace-period'::text,null::timestamptz,false;return;end if;
 select v.decision,v.current_revision,v.storage_object_present into check_result from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
 if not found or check_result.decision<>'unreferenced-at-locked-revision' or not check_result.storage_object_present then return query select ('blocked:'||coalesce(check_result.decision,'unverifiable'))::text,null::timestamptz,false;return;end if;
 fence_expiry:=now()+interval '30 seconds';
 insert into public.tradelink_cleanup_reference_fences(workspace_id,storage_key,created_at,expires_at)
 values(ws,p_storage_key,now(),fence_expiry)
 on conflict(workspace_id,storage_key) do update set created_at=now(),expires_at=excluded.expires_at;
 return query select 'fenced:review-only'::text,fence_expiry,false;
end;$$;
revoke all on function public.tradelink_cleanup_fence_activate(text,bigint) from public,anon;
grant execute on function public.tradelink_cleanup_fence_activate(text,bigint) to authenticated;
create or replace function public.tradelink_cleanup_fence_release(p_storage_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();ws uuid;released_count integer;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' then raise exception 'Invalid workspace key' using errcode='22023';end if;
 delete from public.tradelink_cleanup_reference_fences f where f.workspace_id=ws and f.storage_key=p_storage_key;
 get diagnostics released_count=row_count;
 return released_count>0;
end;$$;
revoke all on function public.tradelink_cleanup_fence_release(text) from public,anon;
grant execute on function public.tradelink_cleanup_fence_release(text) to authenticated;;
