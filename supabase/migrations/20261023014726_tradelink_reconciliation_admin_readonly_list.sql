create or replace function public.tradelink_reconciliation_list(p_limit integer default 50)
returns table(storage_key text,attachment_id text,reason text,status text,observed_revision bigint,storage_object_present boolean,reported_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ws uuid;
begin
 if caller is null or not public.has_module_access('tradelink',caller) or
 not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null then raise exception 'Workspace authorization required' using errcode='42501'; end if;
 return query
 select c.storage_key,c.attachment_id,c.reason,c.status,c.observed_revision,
 exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=c.storage_key),c.created_at
 from public.tradelink_attachment_reconciliation c where c.workspace_id=ws
 order by c.updated_at desc,c.storage_key asc limit least(greatest(coalesce(p_limit,50),1),100);
end; $$;
revoke all on function public.tradelink_reconciliation_list(integer) from public,anon;
grant execute on function public.tradelink_reconciliation_list(integer) to authenticated;;
