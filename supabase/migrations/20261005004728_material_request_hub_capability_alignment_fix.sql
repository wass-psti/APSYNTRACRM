create or replace function private.material_request_hub_can_create(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(private.material_request_hub_current_role(p_workspace_id) in ('ADMIN','REQUESTOR'),false);
$$;

create or replace function public.material_request_hub_create_request(p_workspace_id uuid,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare caller uuid:=auth.uid(); r public.material_request_hub_requests%rowtype; nm text; t text; s text; inv text;
begin
  if not private.material_request_hub_can_create(p_workspace_id) then raise exception 'create denied' using errcode='42501'; end if;
  nm:=left(trim(coalesce(p_fields->>'name','New Request')),240); if nm='' then nm:='New Request'; end if;
  t:=nullif(p_fields->>'typeOfRequest',''); s:=nullif(p_fields->>'sourceInventory',''); inv:=nullif(p_fields->>'typeOfInvoice','');
  if t is not null and t not in ('Client PO','Project BOM') then raise exception 'invalid request type' using errcode='22023'; end if;
  if s is not null and s not in ('WASS Inventory','PSTI Inventory','WAO Inventory','IFAB') then raise exception 'invalid inventory source' using errcode='22023'; end if;
  if inv is not null and inv not in ('Service Invoice','Sales Invoice','No Invoice') then raise exception 'invalid invoice type' using errcode='22023'; end if;
  insert into public.material_request_hub_requests(workspace_id,requestor_user_id,name,type_of_request,source_inventory,type_of_invoice,requested_qty,remarks)
  values(p_workspace_id,caller,nm,t,s,inv,nullif(p_fields->>'requestedQty','')::numeric,left(coalesce(p_fields->>'remarks',''),4000)) returning * into r;
  insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,r.id,caller,'created','{}');
  return private.material_request_hub_request_json(r);
end $$;
revoke all on function public.material_request_hub_create_request(uuid,jsonb) from public,anon;
grant execute on function public.material_request_hub_create_request(uuid,jsonb) to authenticated;

create or replace function public.material_request_hub_register_attachment(p_workspace_id uuid,p_request_id text,p_update_id uuid,p_storage_path text,p_name text,p_mime_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare caller uuid:=auth.uid(); a public.material_request_hub_attachments%rowtype; ext text:=lower(regexp_replace(p_name,'.*\.','','g'));
begin
  if not private.material_request_hub_can_write(p_workspace_id) then raise exception 'attachment denied' using errcode='42501'; end if;
  if p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'attachment size must be between 1 byte and 10 MB' using errcode='22023'; end if;
  if ext not in ('pdf','png','jpg','jpeg','webp','gif','doc','docx','xls','xlsx','csv','txt') then raise exception 'attachment extension is not allowed' using errcode='22023'; end if;
  if p_storage_path not like p_workspace_id::text||'/'||p_request_id||'/%' then raise exception 'invalid attachment path' using errcode='22023'; end if;
  if not exists(select 1 from public.material_request_hub_requests where workspace_id=p_workspace_id and id=p_request_id) then raise exception 'request not found' using errcode='P0002'; end if;
  if p_update_id is not null and not exists(select 1 from public.material_request_hub_updates where id=p_update_id and workspace_id=p_workspace_id and request_id=p_request_id) then raise exception 'attachment update/request mismatch' using errcode='22023'; end if;
  insert into public.material_request_hub_attachments(workspace_id,request_id,update_id,storage_path,name,mime_type,size_bytes,creator_user_id)
  values(p_workspace_id,p_request_id,p_update_id,p_storage_path,left(p_name,500),left(coalesce(p_mime_type,'application/octet-stream'),200),p_size_bytes,caller) returning * into a;
  insert into public.material_request_hub_activity(workspace_id,request_id,actor_user_id,event_type,detail) values(p_workspace_id,p_request_id,caller,'attachment_added',jsonb_build_object('attachmentId',a.id,'name',a.name));
  return jsonb_build_object('id',a.id::text,'name',a.name,'file_extension',ext,'file_size',a.size_bytes,'mime_type',a.mime_type,'storagePath',a.storage_path,'createdAt',a.created_at);
end $$;
revoke all on function public.material_request_hub_register_attachment(uuid,text,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.material_request_hub_register_attachment(uuid,text,uuid,text,text,text,bigint) to authenticated;;
