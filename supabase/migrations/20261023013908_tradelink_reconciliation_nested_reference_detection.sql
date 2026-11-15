create or replace function public.tradelink_reconciliation_assess(p_storage_key text)
returns table(status text,workspace_revision bigint,storage_object_present boolean)
language plpgsql security definer set search_path='' as $$
declare
 caller uuid:=auth.uid(); ws uuid; payload jsonb; rev bigint;
 found_state boolean; found_object boolean; is_referenced boolean; result text;
begin
 if caller is null or not public.has_module_access('tradelink',caller) or
 not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
  raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' then
  raise exception 'Invalid workspace attachment key' using errcode='22023';
 end if;
 if not exists(select 1 from public.tradelink_attachment_reconciliation c where c.workspace_id=ws and c.storage_key=p_storage_key) then
  raise exception 'Reconciliation candidate not found' using errcode='22023';
 end if;
 select e.value::jsonb,e.revision into payload,rev from public.module_state_entries e
 where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared' limit 1;
 found_state:=found and jsonb_typeof(payload)='object' and jsonb_typeof(payload->'attachments')='array';
 is_referenced:=coalesce(jsonb_path_exists(payload,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',p_storage_key)),false);
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into found_object;
 if is_referenced then result:='referenced';
 elsif not found_state then result:='unverifiable';
 else result:='unreferenced-at-revision';
 end if;
 update public.tradelink_attachment_reconciliation c set status=result,observed_revision=rev,observed_at=now(),updated_at=now()
 where c.workspace_id=ws and c.storage_key=p_storage_key;
 return query select result,rev,found_object;
end; $$;
revoke all on function public.tradelink_reconciliation_assess(text) from public,anon;
grant execute on function public.tradelink_reconciliation_assess(text) to authenticated;;
