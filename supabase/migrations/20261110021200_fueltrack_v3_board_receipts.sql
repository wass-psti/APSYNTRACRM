-- FuelTrack+ v3 Board synchronization and private receipt integration.
-- APPLY ONLY AFTER 20261109115106_fueltrack_v3_backend_core.sql.
-- Staged; no production mutation from this source commit.
-- Fail before any schema write if the core RPC was activated with requests
-- that do not yet have a Board item. Migration must not orphan those records.
do $$
declare v_legacy boolean;
begin
 if exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='fueltrack_v3_requests'
   and column_name='board_item_id') then
  execute 'select exists(select 1 from public.fueltrack_v3_requests where board_item_id is null)'
   into v_legacy;
 else
  select exists(select 1 from public.fueltrack_v3_requests) into v_legacy;
 end if;
 if v_legacy then
  raise exception 'Legacy FuelTrack requests require an audited Board-link reconciliation'
   using errcode='23503';
 end if;
end $$;
alter table public.fueltrack_v3_requests
 add column if not exists board_item_id uuid;
create unique index if not exists fueltrack_v3_request_board_item_uq
 on public.fueltrack_v3_requests(board_item_id) where board_item_id is not null;
-- Validates Board item at runtime as legacy rows may already exist without projection.
-- A precise foreign key enforces deletion behavior once the established item table exists.
do $$
begin
 if not exists (select 1 from pg_constraint where conname='fueltrack_v3_board_item_fk') then
  alter table public.fueltrack_v3_requests
   add constraint fueltrack_v3_board_item_fk foreign key(board_item_id)
   references public.work_board_items(id) on delete restrict;
 end if;
end $$;

create or replace function public.fueltrack_v3_assert_link(
 p_board_id uuid,p_request_id uuid,p_item_id uuid
) returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if p_item_id is null or not exists (
  select 1 from public.fueltrack_v3_requests r
  join public.work_board_items i
   on i.id=r.board_item_id and i.board_id=r.board_id
  where r.id=p_request_id and r.board_id=p_board_id
   and i.id=p_item_id and i.archived_at is null
 ) then
  raise exception 'FuelTrack Board projection unavailable' using errcode='40001';
 end if;
 return true;
end; $$;

-- All-or-nothing idempotent submit: create the actual Board item before commit.
-- Reuse canonical wm_add_board_item to preserve established Board audit/grants.
create or replace function public.fueltrack_v3_submit(
 p_board_id uuid,p_client_key uuid,p_kind text,p_details jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_user uuid:=auth.uid(); r public.fueltrack_v3_requests%rowtype;
 v_inserted boolean:=false; v_group uuid; v_item uuid; v_title text;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,true);
 if p_client_key is null or not public.fueltrack_v3_valid_details(p_kind,p_details) then
  raise exception 'Invalid fuel request details' using errcode='22023';
 end if;
 -- This lock also protects idempotent retries and ensures no duplicate projection.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'fueltrack.v3.submit:'||v_ws::text||':'||v_user::text||':'||p_client_key::text,0));
 insert into public.fueltrack_v3_requests(workspace_id,board_id,requested_by,client_key,kind,details)
 values(v_ws,p_board_id,v_user,p_client_key,p_kind,p_details)
 on conflict(workspace_id,requested_by,client_key) do nothing
 returning * into r;
 v_inserted:=found;
 if not v_inserted then
  select * into r from public.fueltrack_v3_requests
   where workspace_id=v_ws and requested_by=v_user and client_key=p_client_key;
  if r.id is null or r.board_id<>p_board_id or r.kind<>p_kind or r.details<>p_details then
   raise exception 'Idempotency key belongs to different request' using errcode='23505';
  end if;
  perform public.fueltrack_v3_assert_link(p_board_id,r.id,r.board_item_id);
 else
  select g.id into v_group from public.work_board_groups g
   where g.board_id=p_board_id order by g.position,g.id limit 1;
  if v_group is null then
   raise exception 'FuelTrack Board has no writable group' using errcode='23503';
  end if;
  v_title:='Fuel request · '||left(p_kind||' · '||
   case when p_kind='vehicle' then p_details->>'plate'
        else (p_details->>'containerCount')||' containers' end,180);
  v_item:=public.wm_add_board_item(p_board_id,v_group,v_title);
  update public.fueltrack_v3_requests
   set board_item_id=v_item where id=r.id
   returning * into r;
  update public.work_board_items
   set notes='FuelTrack v3 request: '||r.id::text||E'\nState: submitted',
       updated_by=v_user,updated_at=now()
   where id=v_item and board_id=p_board_id;
  insert into public.fueltrack_v3_audit_events
   (workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state)
   values(v_ws,p_board_id,r.id,r.revision,v_user,'submit',null,'submitted');
  perform public.append_module_activity('fueltrack-plus',
   'ft3-'||r.id::text||'-submit','submit','Fuel request submitted','New fuel request',r.id::text,
   jsonb_build_object('kind',r.kind,'revision',r.revision,'boardItemId',v_item));
 end if;
 return jsonb_build_object('id',r.id,'boardItemId',r.board_item_id,
  'state',r.state,'revision',r.revision,'idempotent',not v_inserted);
end; $$;

-- The same Board identity must remain linked before any subsequent transition.
-- Preserve the original mutation contracts and CAS; add a link invariant with a
-- before-update trigger that only fires for application state changes.
create or replace function public.fueltrack_v3_guard_link_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if old.state is distinct from new.state then
  perform public.fueltrack_v3_assert_link(old.board_id,old.id,old.board_item_id);
  update public.work_board_items
   set notes='FuelTrack v3 request: '||old.id::text||E'\nState: '||new.state,
       updated_by=auth.uid(),updated_at=now()
   where id=old.board_item_id and board_id=old.board_id
     and notes='FuelTrack v3 request: '||old.id::text||E'\nState: '||old.state;
  if not found then
   raise exception 'FuelTrack Board status projection diverged' using errcode='40001';
  end if;
  if new.board_item_id is distinct from old.board_item_id or
     new.workspace_id is distinct from old.workspace_id or
     new.board_id is distinct from old.board_id then
   raise exception 'FuelTrack Board identity cannot change' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists fueltrack_v3_guard_link_transition on public.fueltrack_v3_requests;
create trigger fueltrack_v3_guard_link_transition
 before update of state on public.fueltrack_v3_requests
 for each row execute function public.fueltrack_v3_guard_link_transition();

-- One private, registered receipt image per request. The already deployed
-- work-board-files RLS controls Storage read and write by Board/item identity.
-- This table only stores authoritative links to the registered item file.
create table if not exists public.fueltrack_v3_receipts(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 request_id uuid not null unique references public.fueltrack_v3_requests(id) on delete restrict,
 board_id uuid not null,
 board_item_id uuid not null references public.work_board_items(id) on delete restrict,
 file_id uuid not null unique references public.work_board_item_files(id) on delete restrict,
 storage_path text not null unique,
 uploader_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.fueltrack_v3_receipts enable row level security;
revoke all on public.fueltrack_v3_receipts from public,anon,authenticated;

-- Prepare a receipt upload only for a signed Admin and an actual
-- linked item. Return no signed URL; Storage RLS remains authoritative.
create or replace function public.fueltrack_v3_receipt_prepare(
 p_board_id uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_item uuid; v_state text; v_prior uuid;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 select r.board_item_id,r.state into v_item,v_state
 from public.fueltrack_v3_requests r
 where r.id=p_request_id and r.workspace_id=v_ws and r.board_id=p_board_id;
 if not found or v_state not in ('refueling_done','completed') then
  raise exception 'Receipt upload unavailable' using errcode='42501';
 end if;
 perform public.fueltrack_v3_assert_link(p_board_id,p_request_id,v_item);
 select file_id into v_prior from public.fueltrack_v3_receipts where request_id=p_request_id;
 if v_prior is not null then
  raise exception 'Receipt already registered' using errcode='23505';
 end if;
 return jsonb_build_object('status','VERIFIED_RECEIPT_PREPARE',
   'requestId',p_request_id,'boardId',p_board_id,
   'boardItemId',v_item,'workspaceId',v_ws,'bucket','work-board-files');
end; $$;

create or replace function public.fueltrack_v3_attach_receipt(
 p_board_id uuid,p_request_id uuid,p_storage_path text,
 p_file_name text,p_mime_type text,p_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_item uuid; v_file uuid; v_prior public.fueltrack_v3_receipts%rowtype;
 v_type text; v_object storage.objects%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 if p_mime_type not in ('image/jpeg','image/png','image/webp') or
    p_size_bytes is null or p_size_bytes<1 or p_size_bytes>5242880 or
    nullif(pg_catalog.btrim(coalesce(p_file_name,'')),'') is null or
    pg_catalog.char_length(p_file_name)>180 or
    p_file_name !~* '^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.(jpg|jpeg|png|webp)$' then
  raise exception 'Invalid receipt image' using errcode='22023';
 end if;
 v_type:=case when p_file_name ~* '\.(jpg|jpeg)$' then 'image/jpeg'
              when p_file_name ~* '\.png$' then 'image/png'
              else 'image/webp' end;
 if v_type<>p_mime_type then
  raise exception 'Receipt MIME/extension mismatch' using errcode='22023';
 end if;
 select r.board_item_id into v_item from public.fueltrack_v3_requests r
  where r.id=p_request_id and r.workspace_id=v_ws and r.board_id=p_board_id
   and r.state in ('refueling_done','completed')
  for update;
 if v_item is null then
  raise exception 'Receipt request unavailable' using errcode='42501';
 end if;
 perform public.fueltrack_v3_assert_link(p_board_id,p_request_id,v_item);
 if p_storage_path is null or
    p_storage_path !~ ('^'||p_board_id::text||'/'||v_item::text||
      '/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$') then
  raise exception 'Invalid receipt Storage location' using errcode='22023';
 end if;
 if (p_mime_type='image/jpeg' and p_storage_path !~* '\.(jpg|jpeg)$') or
    (p_mime_type='image/png' and p_storage_path !~* '\.png$') or
    (p_mime_type='image/webp' and p_storage_path !~* '\.webp$') then
  raise exception 'Receipt path extension does not match MIME type' using errcode='22023';
 end if;
 select * into v_prior from public.fueltrack_v3_receipts
  where request_id=p_request_id;
 if v_prior.id is not null then
  if v_prior.storage_path=p_storage_path and
     v_prior.uploader_id=auth.uid() then
   return jsonb_build_object('status','VERIFIED_RECEIPT','requestId',p_request_id,
    'boardItemId',v_item,'fileId',v_prior.file_id,'storagePath',v_prior.storage_path,
    'idempotent',true);
  end if;
  raise exception 'Receipt already registered' using errcode='23505';
 end if;
 select * into v_object from storage.objects o
  where o.bucket_id='work-board-files' and o.name=p_storage_path
   and o.owner_id=auth.uid()::text;
 if not found or coalesce(v_object.metadata->>'mimetype','')<>p_mime_type
   or coalesce(v_object.metadata->>'size','') !~ '^[0-9]{1,12}$'
   or (v_object.metadata->>'size')::bigint<>p_size_bytes then
  raise exception 'Receipt Storage object missing or mismatched' using errcode='42501';
 end if;
 v_file:=public.wm_register_board_item_file(v_item,p_storage_path,p_file_name,p_mime_type,p_size_bytes);
 insert into public.fueltrack_v3_receipts(request_id,board_id,board_item_id,file_id,storage_path,uploader_id)
 values(p_request_id,p_board_id,v_item,v_file,p_storage_path,auth.uid());
 return jsonb_build_object('status','VERIFIED_RECEIPT','requestId',p_request_id,
   'boardItemId',v_item,'fileId',v_file,'storagePath',p_storage_path,'idempotent',false);
end; $$;

-- Read attachment metadata (never a public URL) with the same per-request guard.
create or replace function public.fueltrack_v3_receipt_read(
 p_board_id uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid; v_user uuid:=auth.uid(); v_admin boolean; v_item uuid; v_row jsonb;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,false);
 v_admin:=public.module_role_for('fueltrack-plus',v_user)='Admin';
 select board_item_id into v_item from public.fueltrack_v3_requests
  where id=p_request_id and board_id=p_board_id and workspace_id=v_ws
   and (v_admin or requested_by=v_user);
 if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
 select jsonb_build_object('status','VERIFIED_RECEIPT','requestId',r.request_id,
   'boardItemId',r.board_item_id,'fileId',r.file_id,
   'storagePath',r.storage_path,'createdAt',r.created_at) into v_row
 from public.fueltrack_v3_receipts r
 where r.request_id=p_request_id and r.board_id=p_board_id and r.board_item_id=v_item;
 return coalesce(v_row,jsonb_build_object('status','NO_RECEIPT','requestId',p_request_id));
end; $$;

revoke all on function public.fueltrack_v3_assert_link(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_guard_link_transition() from public,anon,authenticated;
revoke all on function public.fueltrack_v3_receipt_prepare(uuid,uuid) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_attach_receipt(uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.fueltrack_v3_receipt_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fueltrack_v3_attach_receipt(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.fueltrack_v3_receipt_read(uuid,uuid) to authenticated;

grant execute on function public.fueltrack_v3_receipt_prepare(uuid,uuid) to authenticated;
