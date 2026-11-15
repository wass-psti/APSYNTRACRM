create table if not exists public.order_intake_create_idempotency (
 workspace_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null,
 payload_hash text not null,
 order_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,request_id)
);
alter table public.order_intake_create_idempotency enable row level security;
revoke all on public.order_intake_create_idempotency from public,anon,authenticated;
create or replace function public.order_intake_create_idempotent(p_order jsonb,p_request_id uuid)
returns public.order_intake_orders language plpgsql security definer set search_path='pg_catalog','public' as $$
declare actor uuid:=auth.uid();ws uuid;recorded record;created public.order_intake_orders%rowtype;digest text;
begin
 if actor is null or not public.is_platform_admin(actor) or not public.has_module_access('order-intake',actor) then raise exception 'ORDER_INTAKE_ACCESS_DENIED' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_request_id is null or p_order is null or jsonb_typeof(p_order)<>'object' then raise exception 'ORDER_INTAKE_INVALID_IDEMPOTENCY' using errcode='22023';end if;
 digest:=md5(p_order::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ws::text||':'||p_request_id::text,0));
 select i.actor_id,i.payload_hash,i.order_id into recorded from public.order_intake_create_idempotency i where i.workspace_id=ws and i.request_id=p_request_id;
 if found then
  if recorded.actor_id<>actor or recorded.payload_hash<>digest then raise exception 'ORDER_INTAKE_IDEMPOTENCY_KEY_REUSED' using errcode='22023';end if;
  select * into created from public.order_intake_orders o where o.workspace_id=ws and o.id=recorded.order_id;
  if not found then raise exception 'ORDER_INTAKE_IDEMPOTENCY_RECORD_MISSING' using errcode='22023';end if;
  return created;
 end if;
 created:=public.order_intake_create(p_order);
 insert into public.order_intake_create_idempotency(workspace_id,request_id,actor_id,payload_hash,order_id) values(ws,p_request_id,actor,digest,created.id);
 return created;
end;$$;
revoke all on function public.order_intake_create_idempotent(jsonb,uuid) from public,anon;
grant execute on function public.order_intake_create_idempotent(jsonb,uuid) to authenticated;;
