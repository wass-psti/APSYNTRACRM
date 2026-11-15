create table if not exists public.tradelink_cleanup_reference_fences (
 workspace_id uuid not null,
 storage_key text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 primary key(workspace_id,storage_key),
 constraint tradelink_reference_fence_duration check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);
alter table public.tradelink_cleanup_reference_fences enable row level security;
revoke all on public.tradelink_cleanup_reference_fences from public,anon,authenticated;
create or replace function public.tradelink_cleanup_reference_write_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.module_id='tradelink' and new.state_key='tradelink_state_v1' and new.scope='shared' and new.owner_key='*' then
   if exists(
    select 1 from public.tradelink_cleanup_reference_fences f
     where f.workspace_id=new.workspace_id and f.expires_at>now()
      and jsonb_path_exists(new.value::jsonb,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',f.storage_key))
   ) then
    raise exception 'TRADELINK_REFERENCE_FENCED' using errcode='40001';
   end if;
 end if;
 return new;
end; $$;
drop trigger if exists tradelink_cleanup_reference_write_guard on public.module_state_entries;
create trigger tradelink_cleanup_reference_write_guard
before insert or update of value on public.module_state_entries
for each row execute function public.tradelink_cleanup_reference_write_guard();
revoke all on function public.tradelink_cleanup_reference_write_guard() from public,anon,authenticated;;
