create or replace function public.tradelink_reconciliation_verify_revision(p_storage_key text,p_expected_revision bigint)
returns table(decision text,current_revision bigint,storage_object_present boolean)
language plpgsql security definer set search_path='' as $$
declare
 caller uuid := auth.uid(); ws uuid; payload jsonb; rev bigint;
 referenced boolean := false; manifest_valid boolean := false; present boolean := false; outcome text;
begin
 if caller is null or not public.has_module_access('tradelink',caller)
  or not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
  raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid reconciliation revision or workspace key' using errcode='22023';
 end if;
 perform 1 from public.tradelink_attachment_reconciliation c
  where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select e.value::jsonb,e.revision into payload,rev from public.module_state_entries e
  where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared'
  for share;
 if payload is not null and jsonb_typeof(payload)='object' then
   referenced := jsonb_path_exists(payload,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',p_storage_key));
   if jsonb_typeof(payload->'attachments')='array' then
    select not exists(
      select 1 from jsonb_array_elements(payload->'attachments') a
      where jsonb_typeof(a)<>'object' or nullif(btrim(a->>'id'),'') is null
      or nullif(btrim(a->>'documentId'),'') is null or nullif(btrim(a->>'storageKey'),'') is null
      or a->>'status' not in ('active','replaced','removed')
      or a->>'storageProvider' not in ('supabase-storage','local-disk','local-indexeddb')
      or (a->>'storageProvider'='supabase-storage' and left(a->>'storageKey',length(ws::text)+1)<>ws::text||'/'))
    and (select count(*)=count(distinct a->>'id') and count(*)=count(distinct a->>'storageKey')
       from jsonb_array_elements(payload->'attachments') a) into manifest_valid;
   end if;
 end if;
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into present;
 outcome := case
   when rev is null or rev<>p_expected_revision then 'stale-or-missing-revision'
   when referenced then 'referenced'
   when not manifest_valid then 'unverifiable'
   when not present then 'object-absent'
   else 'unreferenced-at-locked-revision'
 end;
 return query select outcome,rev,present;
end; $$;
revoke all on function public.tradelink_reconciliation_verify_revision(text,bigint) from public,anon;
grant execute on function public.tradelink_reconciliation_verify_revision(text,bigint) to authenticated;;
