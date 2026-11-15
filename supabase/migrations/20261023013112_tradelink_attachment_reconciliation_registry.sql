create table if not exists public.tradelink_attachment_reconciliation (
 workspace_id uuid not null,
 storage_key text not null,
 attachment_id text not null,
 reported_by uuid not null,
 reason text not null check (reason in ('commit-uncertain','cleanup-failed')),
 status text not null default 'pending' check (status in ('pending','referenced','unreferenced-at-revision','unverifiable')),
 observed_revision bigint,
 observed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,storage_key),
 constraint tradelink_reconciliation_key_size check(length(storage_key) between 5 and 1024),
 constraint tradelink_reconciliation_attachment_size check(length(attachment_id) between 1 and 200)
);
alter table public.tradelink_attachment_reconciliation enable row level security;
revoke all on public.tradelink_attachment_reconciliation from public, anon, authenticated;
create or replace function public.tradelink_reconciliation_report(p_storage_key text,p_attachment_id text,p_reason text)
returns text language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); ws uuid;
begin
 if caller is null or not public.has_module_access('tradelink',caller) then
  raise exception 'TradeLink authorization required' using errcode='42501';
 end if;
 ws := public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or
 length(p_storage_key)>1024 or p_attachment_id is null or length(p_attachment_id) not between 1 and 200 or
 p_reason not in ('commit-uncertain','cleanup-failed') then
  raise exception 'Invalid reconciliation candidate' using errcode='22023';
 end if;
 insert into public.tradelink_attachment_reconciliation (workspace_id,storage_key,attachment_id,reported_by,reason)
 values (ws,p_storage_key,p_attachment_id,caller,p_reason)
 on conflict (workspace_id,storage_key) do update set updated_at=now(),reason=excluded.reason,status='pending',observed_revision=null,observed_at=null;
 return 'pending';
end; $$;
create or replace function public.tradelink_reconciliation_assess(p_storage_key text)
returns table(status text,workspace_revision bigint,storage_object_present boolean)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ws uuid; payload jsonb; rev bigint; found_state boolean; found_object boolean; result text;
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
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into found_object;
 if not found_state then result:='unverifiable';
 elsif exists(select 1 from jsonb_array_elements(payload->'attachments') a where a->>'storageKey'=p_storage_key) then result:='referenced';
 else result:='unreferenced-at-revision';
 end if;
 update public.tradelink_attachment_reconciliation c set status=result,observed_revision=rev,observed_at=now(),updated_at=now()
 where c.workspace_id=ws and c.storage_key=p_storage_key;
 return query select result,rev,found_object;
end; $$;
revoke all on function public.tradelink_reconciliation_report(text,text,text) from public,anon;
revoke all on function public.tradelink_reconciliation_assess(text) from public,anon;
grant execute on function public.tradelink_reconciliation_report(text,text,text) to authenticated;
grant execute on function public.tradelink_reconciliation_assess(text) to authenticated;;
