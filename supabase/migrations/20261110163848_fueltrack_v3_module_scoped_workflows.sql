-- FuelTrack+ v3 module-scoped workflow permissions.
-- A FuelTrack module role may use FuelTrack domain RPCs while holding Board VIEW
-- access; it does not gain generic Board EDIT, column, group, or item permissions.
-- Admin-only approval/refueling/receipt operations remain enforced server-side.
-- The shared work-board-files bucket remains private; this adds a narrowly scoped
-- Admin receipt upload/cleanup policy for eligible FuelTrack requests only.

create or replace function public.fueltrack_v3_guard(
 p_board_id uuid,p_admin boolean default false,p_write boolean default false
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 v_user uuid:=auth.uid();
 v_ws uuid;
 v_role text;
begin
 if v_user is null then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 v_ws:=public.current_workspace_id(v_user);
 if v_ws is null or public.has_module_access('fueltrack-plus',v_user) is distinct from true then
  raise exception 'FuelTrack module access denied' using errcode='42501';
 end if;
 v_role:=public.module_role_for('fueltrack-plus',v_user);
 if v_role not in ('Admin','User') or (p_admin and v_role<>'Admin') then
  raise exception 'FuelTrack role denied' using errcode='42501';
 end if;
 if not exists(
  select 1 from public.work_boards b
  where b.id=p_board_id and b.workspace_id=v_ws
   and b.name='FuelTrack+ v3'
   and b.description like '[APSYNTRA:MODULE:fueltrack:v1]%'
   and b.status='active'
 ) then
  raise exception 'FuelTrack board not available' using errcode='42501';
 end if;
 -- Module-scoped workflow authorization: Board membership is still required,
 -- but generic Board EDIT is not. p_write remains in the signature for RPC
 -- compatibility; module role and operation-specific checks govern writes.
 if public.work_board_access(p_board_id,'view') is distinct from true then
  raise exception 'FuelTrack Board view access denied' using errcode='42501';
 end if;
 return v_ws;
end;
$$;

-- Internal Board projection creator. Mirrors wm_add_board_item's status,
-- position, workspace audit and Board event semantics, but is callable only
-- from the signed FuelTrack submit transaction.
create or replace function public.fueltrack_v3_add_board_item(
 p_board_id uuid,p_group_id uuid,p_title text
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 v_ws uuid;
 v_item uuid;
 v_position integer;
 v_status_col public.work_board_columns%rowtype;
 v_initial_status text;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,true);
 if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title,''))) not between 1 and 240 then
  raise exception 'Item title is required' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_board_id::text,0));
 if not exists(select 1 from public.work_board_groups
   where id=p_group_id and board_id=p_board_id) then
  raise exception 'Group does not belong to FuelTrack Board' using errcode='23503';
 end if;
 select * into v_status_col
 from public.work_board_columns
 where board_id=p_board_id and system_key='status' and data_type='status'
 order by position,id limit 1;
 if v_status_col.id is null then
  v_initial_status:='not_started';
 else
  v_initial_status:=nullif(v_status_col.config->>'default_label_id','');
  if v_initial_status is null or not exists(
   select 1 from pg_catalog.jsonb_array_elements(
    coalesce(v_status_col.config->'labels','[]'::jsonb)) e
   where e->>'id'=v_initial_status and coalesce((e->>'active')::boolean,true)
  ) then
   select e->>'id' into v_initial_status
   from pg_catalog.jsonb_array_elements(
    coalesce(v_status_col.config->'labels','[]'::jsonb)) e
   where coalesce((e->>'active')::boolean,true)
   order by coalesce((e->>'position')::integer,0),e->>'id'
   limit 1;
  end if;
 end if;
 select count(*) into v_position
 from public.work_board_items where group_id=p_group_id and archived_at is null;
 insert into public.work_board_items(
  board_id,group_id,title,status,position,created_by,updated_by
 ) values(
  p_board_id,p_group_id,pg_catalog.btrim(p_title),v_initial_status,
  v_position,auth.uid(),auth.uid()
 ) returning id into v_item;
 update public.work_boards set updated_at=pg_catalog.now(),updated_by=auth.uid()
 where id=p_board_id and workspace_id=v_ws;
 perform public.work_board_log(
  p_board_id,'item.created','Item added','item',v_item::text,
  pg_catalog.jsonb_build_object('title',pg_catalog.btrim(p_title),
   'status',v_initial_status,'position',v_position,'source','fueltrack-v3')
 );
 return v_item;
end;
$$;
revoke all on function public.fueltrack_v3_add_board_item(uuid,uuid,text)
 from public,anon,authenticated;

-- Internal receipt registration. This intentionally bypasses only the generic
-- Board EDIT check; it still requires the FuelTrack Admin role, Board view,
-- a linked eligible request, an uploader-owned object and exact file metadata.
create or replace function public.fueltrack_v3_register_board_item_file(
 p_board_id uuid,p_item_id uuid,p_storage_path text,p_file_name text,
 p_mime_type text,p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 v_ws uuid;
 v_file uuid;
 v_existing public.work_board_item_files%rowtype;
 v_object storage.objects%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 if p_mime_type not in ('image/jpeg','image/png','image/webp')
  or p_size_bytes is null or p_size_bytes not between 1 and 5242880
  or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_file_name,''))) not between 1 and 180
  or p_file_name !~* '^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.(jpg|jpeg|png|webp)$'
  or p_storage_path is null
  or p_storage_path !~* ('^'||p_board_id::text||'/'||p_item_id::text||
    '/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$')
 then
  raise exception 'Invalid FuelTrack receipt attachment' using errcode='22023';
 end if;
 if not exists(
  select 1 from public.fueltrack_v3_requests r
  where r.workspace_id=v_ws and r.board_id=p_board_id
   and r.board_item_id=p_item_id and r.state in ('refueling_done','completed')
 ) then
  raise exception 'Receipt request unavailable' using errcode='42501';
 end if;
 select * into v_object from storage.objects o
 where o.bucket_id='work-board-files' and o.name=p_storage_path
  and o.owner_id=auth.uid()::text;
 if not found or coalesce(v_object.metadata->>'mimetype','')<>p_mime_type
  or coalesce(v_object.metadata->>'size','') !~ '^[0-9]{1,12}$'
  or (v_object.metadata->>'size')::bigint<>p_size_bytes then
  raise exception 'Uploaded receipt object missing or mismatched' using errcode='42501';
 end if;
 select * into v_existing from public.work_board_item_files
 where storage_path=p_storage_path;
 if v_existing.id is not null then
  if v_existing.board_id=p_board_id and v_existing.item_id=p_item_id
   and v_existing.created_by=auth.uid() then
   return v_existing.id;
  end if;
  raise exception 'Storage object is already registered to another attachment'
   using errcode='23505';
 end if;
 insert into public.work_board_item_files(
  board_id,item_id,storage_path,file_name,mime_type,size_bytes,created_by
 ) values(
  p_board_id,p_item_id,p_storage_path,pg_catalog.btrim(p_file_name),
  p_mime_type,p_size_bytes,auth.uid()
 ) returning id into v_file;
 update public.work_boards set updated_at=pg_catalog.now(),updated_by=auth.uid()
 where id=p_board_id and workspace_id=v_ws;
 perform public.work_board_log(
  p_board_id,'item.file_added','File attached','item',p_item_id::text,
  pg_catalog.jsonb_build_object('file_id',v_file,'file_name',pg_catalog.btrim(p_file_name),
   'source','fueltrack-v3')
 );
 return v_file;
end;
$$;
revoke all on function public.fueltrack_v3_register_board_item_file(
 uuid,uuid,text,text,text,bigint) from public,anon,authenticated;

-- Recreate the submit RPC with the domain-scoped Board item helper. Idempotency,
-- validation, request ownership, audit and activity remain one transaction.
create or replace function public.fueltrack_v3_submit(
 p_board_id uuid,p_client_key uuid,p_kind text,p_details jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_ws uuid;
 v_user uuid:=auth.uid();
 r public.fueltrack_v3_requests%rowtype;
 v_inserted boolean:=false;
 v_group uuid;
 v_item uuid;
 v_title text;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,false,true);
 if p_client_key is null or not public.fueltrack_v3_valid_details(p_kind,p_details) then
  raise exception 'Invalid fuel request details' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'fueltrack.v3.submit:'||v_ws::text||':'||v_user::text||':'||p_client_key::text,0));
 insert into public.fueltrack_v3_requests(
  workspace_id,board_id,requested_by,client_key,kind,details
 ) values(v_ws,p_board_id,v_user,p_client_key,p_kind,p_details)
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
  v_title:='Fuel request · '||pg_catalog.left(p_kind||' · '||
   case when p_kind='vehicle' then p_details->>'plate'
    else (p_details->>'containerCount')||' containers' end,180);
  v_item:=public.fueltrack_v3_add_board_item(p_board_id,v_group,v_title);
  update public.fueltrack_v3_requests set board_item_id=v_item
  where id=r.id returning * into r;
  update public.work_board_items
  set notes='FuelTrack v3 request: '||r.id::text||E'\nState: submitted',
   updated_by=v_user,updated_at=pg_catalog.now()
  where id=v_item and board_id=p_board_id;
  insert into public.fueltrack_v3_audit_events(
   workspace_id,board_id,request_id,revision,actor_id,operation,from_state,to_state
  ) values(v_ws,p_board_id,r.id,r.revision,v_user,'submit',null,'submitted');
  perform public.append_module_activity(
   'fueltrack-plus','ft3-'||r.id::text||'-submit','submit',
   'Fuel request submitted','New fuel request',r.id::text,
   pg_catalog.jsonb_build_object('kind',r.kind,'revision',r.revision,'boardItemId',v_item)
  );
 end if;
 return pg_catalog.jsonb_build_object('id',r.id,'boardItemId',r.board_item_id,
  'state',r.state,'revision',r.revision,'idempotent',not v_inserted);
end;
$$;

-- Replace only the Board-file registration step in the existing receipt RPC.
create or replace function public.fueltrack_v3_attach_receipt(
 p_board_id uuid,p_request_id uuid,p_storage_path text,
 p_file_name text,p_mime_type text,p_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_ws uuid;
 v_item uuid;
 v_file uuid;
 v_prior public.fueltrack_v3_receipts%rowtype;
 v_type text;
 v_object storage.objects%rowtype;
begin
 v_ws:=public.fueltrack_v3_guard(p_board_id,true,true);
 if p_mime_type not in ('image/jpeg','image/png','image/webp')
  or p_size_bytes is null or p_size_bytes<1 or p_size_bytes>5242880
  or nullif(pg_catalog.btrim(coalesce(p_file_name,'')),'') is null
  or pg_catalog.char_length(p_file_name)>180
  or p_file_name !~* '^[a-zA-Z0-9][a-zA-Z0-9._ -]*\.(jpg|jpeg|png|webp)$' then
  raise exception 'Invalid receipt image' using errcode='22023';
 end if;
 v_type:=case when p_file_name ~* '\.(jpg|jpeg)$' then 'image/jpeg'
  when p_file_name ~* '\.png$' then 'image/png' else 'image/webp' end;
 if v_type<>p_mime_type then
  raise exception 'Receipt MIME/extension mismatch' using errcode='22023';
 end if;
 select r.board_item_id into v_item from public.fueltrack_v3_requests r
 where r.id=p_request_id and r.workspace_id=v_ws and r.board_id=p_board_id
  and r.state in ('refueling_done','completed') for update;
 if v_item is null then
  raise exception 'Receipt request unavailable' using errcode='42501';
 end if;
 perform public.fueltrack_v3_assert_link(p_board_id,p_request_id,v_item);
 if p_storage_path is null or p_storage_path !~* (
  '^'||p_board_id::text||'/'||v_item::text||
  '/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$'
 ) then
  raise exception 'Invalid receipt Storage location' using errcode='22023';
 end if;
 if (p_mime_type='image/jpeg' and p_storage_path !~* '\.(jpg|jpeg)$')
  or (p_mime_type='image/png' and p_storage_path !~* '\.png$')
  or (p_mime_type='image/webp' and p_storage_path !~* '\.webp$') then
  raise exception 'Receipt path extension does not match MIME type' using errcode='22023';
 end if;
 select * into v_prior from public.fueltrack_v3_receipts where request_id=p_request_id;
 if v_prior.id is not null then
  if v_prior.storage_path=p_storage_path and v_prior.uploader_id=auth.uid() then
   return pg_catalog.jsonb_build_object('status','VERIFIED_RECEIPT',
    'requestId',p_request_id,'boardItemId',v_item,'fileId',v_prior.file_id,
    'storagePath',v_prior.storage_path,'idempotent',true);
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
 v_file:=public.fueltrack_v3_register_board_item_file(
  p_board_id,v_item,p_storage_path,p_file_name,p_mime_type,p_size_bytes
 );
 insert into public.fueltrack_v3_receipts(
  request_id,board_id,board_item_id,file_id,storage_path,uploader_id
 ) values(p_request_id,p_board_id,v_item,v_file,p_storage_path,auth.uid());
 return pg_catalog.jsonb_build_object('status','VERIFIED_RECEIPT',
  'requestId',p_request_id,'boardItemId',v_item,'fileId',v_file,
  'storagePath',p_storage_path,'idempotent',false);
end;
$$;

-- Narrow Storage predicate used only for FuelTrack receipt objects. It does not
-- grant generic Board attachment uploads or make the shared bucket public.
create or replace function public.fueltrack_v3_receipt_storage_upload_allowed(
 p_name text,p_metadata jsonb
) returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
 v_user uuid:=auth.uid();
 v_workspace uuid;
 v_item uuid;
 v_mime text;
 v_size_text text;
 v_size bigint;
begin
 if v_user is null or p_name is null or p_metadata is null
  or pg_catalog.jsonb_typeof(p_metadata)<>'object'
  or p_name !~* ('^7af78b3f-67bf-4600-9aa1-9006d19d486e/'||
   '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/'||
   '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$')
 then return false; end if;
 if public.has_module_access('fueltrack-plus',v_user) is distinct from true
  or public.module_role_for('fueltrack-plus',v_user) is distinct from 'Admin' then
  return false;
 end if;
 v_workspace:=public.current_workspace_id(v_user);
 if v_workspace is null or
  public.work_board_access('7af78b3f-67bf-4600-9aa1-9006d19d486e','view') is distinct from true then
  return false;
 end if;
 v_item:=pg_catalog.split_part(p_name,'/',2)::uuid;
 v_mime:=p_metadata->>'mimetype';
 v_size_text:=p_metadata->>'size';
 if v_mime not in ('image/jpeg','image/png','image/webp')
  or v_size_text !~ '^[0-9]{1,12}$' then return false; end if;
 v_size:=v_size_text::bigint;
 if v_size not between 1 and 5242880 then return false; end if;
 if (v_mime='image/jpeg' and p_name !~* '\.(jpg|jpeg)$')
  or (v_mime='image/png' and p_name !~* '\.png$')
  or (v_mime='image/webp' and p_name !~* '\.webp$') then return false; end if;
 return exists(
  select 1 from public.fueltrack_v3_requests r
  join public.work_board_items i on i.id=r.board_item_id and i.board_id=r.board_id
   and i.archived_at is null
  join public.work_boards b on b.id=r.board_id and b.workspace_id=r.workspace_id
   and b.name='FuelTrack+ v3'
   and b.description like '[APSYNTRA:MODULE:fueltrack:v1]%'
   and b.status='active'
  where r.workspace_id=v_workspace
   and r.board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e'
   and r.board_item_id=v_item and r.state in ('refueling_done','completed')
   and not exists(select 1 from public.fueltrack_v3_receipts x
    where x.request_id=r.id and x.board_id=r.board_id)
 );
exception when others then return false;
end;
$$;
revoke all on function public.fueltrack_v3_receipt_storage_upload_allowed(text,jsonb)
 from public,anon;
grant execute on function public.fueltrack_v3_receipt_storage_upload_allowed(text,jsonb)
 to authenticated;

drop policy if exists fueltrack_v3_receipt_upload on storage.objects;
create policy fueltrack_v3_receipt_upload on storage.objects
 for insert to authenticated
 with check (
  bucket_id='work-board-files' and owner_id=auth.uid()::text
  and public.fueltrack_v3_receipt_storage_upload_allowed(name,metadata)
 );
drop policy if exists fueltrack_v3_receipt_orphan_cleanup on storage.objects;
create policy fueltrack_v3_receipt_orphan_cleanup on storage.objects
 for delete to authenticated
 using (
  bucket_id='work-board-files' and owner_id=auth.uid()::text
  and public.fueltrack_v3_receipt_storage_upload_allowed(name,metadata)
 );
