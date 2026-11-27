-- Read-only catalog snapshot, 2026-11-27. Function definitions only; no operational data.
-- Disposable test dependency bodies, not migrations. Synthetic identity helpers are in the fixture.
CREATE OR REPLACE FUNCTION public.work_board_access(p_board_id uuid, p_required text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE caller uuid:=auth.uid(); member_role text; ws uuid; board_ws uuid; cap text;
BEGIN
 IF caller IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p
               WHERE p.id=caller AND p.status='active') THEN RETURN false; END IF;
 SELECT workspace_id INTO board_ws FROM public.work_boards WHERE id=p_board_id;
 IF board_ws IS NULL THEN RETURN false; END IF;
 ws:=public.current_workspace_id(caller);
 IF ws IS NULL OR ws<>board_ws THEN RETURN false; END IF;
 IF p_required IS NULL OR p_required NOT IN ('view','edit','manage') THEN RETURN false; END IF;
 cap:=public.apsyntra_crm_explicit_role(caller,ws);
 IF cap='viewer' AND p_required IN ('edit','manage') THEN RETURN false; END IF;
 IF cap IN ('employee','supervisor') AND p_required='manage' THEN RETURN false; END IF;
 IF public.is_platform_admin(caller) THEN RETURN true; END IF;
 SELECT role INTO member_role FROM public.work_board_members
  WHERE board_id=p_board_id AND user_id=caller;
 IF p_required='manage' THEN RETURN coalesce(member_role='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(member_role IN ('owner','editor'),false); END IF;
 RETURN coalesce(member_role IN ('owner','editor','viewer'),false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.work_board_validate_column_value(p_board_id uuid, p_column_id uuid, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.work_board_columns%rowtype; t text; u uuid; d date; start_d date; end_d date; is_empty boolean:=false;
begin
  select * into c from public.work_board_columns where id=p_column_id and board_id=p_board_id;
  if c.id is null then raise exception 'Column does not belong to board'; end if;
  if p_value is null or p_value='null'::jsonb then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t=''); if is_empty then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  end if;
  case c.data_type
    when 'text' then if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if; return to_jsonb(t);
    when 'long_text' then if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if; return to_jsonb(t);
    when 'number' then if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if; return p_value;
    when 'checkbox' then if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if; return p_value;
    when 'status' then
      if not exists(select 1 from jsonb_array_elements(c.config->'labels') e where e->>'id'=t) then raise exception 'Select a valid status for %',c.name; end if;
      return to_jsonb(t);
    when 'dropdown' then if not exists(select 1 from jsonb_array_elements_text(c.config->'options') o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if; return to_jsonb(t);
    when 'date' then begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end; return to_jsonb(d::text);
    when 'people' then begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end; if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if; return to_jsonb(u::text);
    when 'url' then if t !~* '^https?://[^[:space:]]+$' or char_length(t)>2000 then raise exception '% requires a valid http(s) URL',c.name; end if; return to_jsonb(t);
    when 'email' then if t !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(t)>320 then raise exception '% requires a valid email address',c.name; end if; return to_jsonb(lower(t));
    when 'timeline' then
      if jsonb_typeof(p_value)<>'object' then raise exception '% requires a start/end date range',c.name; end if;
      if coalesce(p_value->>'start','')='' and coalesce(p_value->>'end','')='' then if c.required then raise exception '% is required',c.name; end if; return null; end if;
      begin start_d:=(p_value->>'start')::date; end_d:=(p_value->>'end')::date; exception when others then raise exception '% requires valid start and end dates',c.name; end;
      if end_d<start_d then raise exception '% end date cannot be before its start date',c.name; end if;
      return jsonb_build_object('start',start_d::text,'end',end_d::text);
    else raise exception 'Unsupported column type';
  end case;
end $function$;

CREATE OR REPLACE FUNCTION public.work_board_log(p_board_id uuid, p_type text, p_message text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id,payload)
  values(p_board_id,auth.uid(),p_type,left(coalesce(p_message,''),500),p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.wm_set_board_cell(p_item_id uuid, p_column_id uuid, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.work_board_items%rowtype; c public.work_board_columns%rowtype; v jsonb; t text; u uuid; d date;
begin
  select * into i from public.work_board_items where id=p_item_id;
  if i.id is null or not public.work_board_access(i.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select * into c from public.work_board_columns where id=p_column_id and board_id=i.board_id;
  if c.id is null then raise exception 'Column does not belong to this board'; end if;
  v:=public.work_board_validate_column_value(i.board_id,c.id,p_value);

  if c.system_key is not null then
    t:=case when v is null then null else v#>>'{}' end;
    case c.system_key
      when 'title' then
        if t is null or char_length(t) not between 1 and 240 then raise exception 'Item name must contain 1-240 characters'; end if;
        update public.work_board_items set title=t,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'status' then
        update public.work_board_items set status=t,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'assignee' then
        u:=case when t is null then null else t::uuid end;
        update public.work_board_items set assignee_id=u,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'due_date' then
        d:=case when t is null then null else t::date end;
        update public.work_board_items set due_date=d,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'notes' then
        update public.work_board_items set notes=coalesce(t,''),updated_by=auth.uid(),updated_at=now() where id=i.id;
    end case;
  else
    if v is null then
      delete from public.work_board_item_values where item_id=i.id and column_id=c.id;
    else
      insert into public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
      values(i.id,c.id,v,auth.uid(),now())
      on conflict(item_id,column_id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
    end if;
  end if;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=i.board_id;
  perform public.work_board_log(i.board_id,'item.cell_updated','Item column updated','item',i.id::text,jsonb_build_object('column_id',c.id,'column_name',c.name,'column_key',c.column_key));
end $function$;

CREATE OR REPLACE FUNCTION public.wm_set_board_cell_if_current(p_item_id uuid, p_column_id uuid, p_value jsonb, p_expected_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.work_board_items%rowtype;
  c public.work_board_columns%rowtype;
  current_value jsonb;
  next_title text;
begin
  -- Lock the item to serialize compare-and-set decisions for both system and
  -- custom cells belonging to this item.
  select * into i from public.work_board_items where id=p_item_id for update;
  if i.id is null or not public.work_board_access(i.board_id,'edit') then
    raise exception 'Board edit access denied' using errcode='42501';
  end if;

  -- A NULL column id represents the intrinsic item title. Modern Boards may
  -- intentionally have an empty/custom-only schema, so title concurrency cannot
  -- depend on the presence of a legacy system title column.
  if p_column_id is null then
    current_value:=to_jsonb(i.title);
  else
    select * into c from public.work_board_columns where id=p_column_id and board_id=i.board_id;
    if c.id is null then raise exception 'Column does not belong to this board'; end if;

    if c.system_key='title' then current_value:=to_jsonb(i.title);
    elsif c.system_key='status' then current_value:=coalesce(to_jsonb(i.status),'null'::jsonb);
    elsif c.system_key='assignee' then current_value:=coalesce(to_jsonb(i.assignee_id::text),'null'::jsonb);
    elsif c.system_key='due_date' then current_value:=coalesce(to_jsonb(i.due_date::text),'null'::jsonb);
    elsif c.system_key='notes' then current_value:=to_jsonb(coalesce(i.notes,''));
    else
      select value into current_value from public.work_board_item_values where item_id=i.id and column_id=c.id;
      current_value:=coalesce(current_value,'null'::jsonb);
    end if;
  end if;

  if current_value is distinct from coalesce(p_expected_value,'null'::jsonb) then
    raise exception 'This Board value changed in another session. Reload the latest value before saving.' using errcode='PT409';
  end if;

  if p_column_id is null then
    if p_value is null or jsonb_typeof(p_value)<>'string' then
      raise exception 'Item name must contain 1-240 characters';
    end if;
    next_title:=btrim(p_value#>>'{}');
    if char_length(next_title) not between 1 and 240 then
      raise exception 'Item name must contain 1-240 characters';
    end if;
    update public.work_board_items set title=next_title,updated_by=auth.uid(),updated_at=now() where id=i.id;
    update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=i.board_id;
    perform public.work_board_log(i.board_id,'item.cell_updated','Item name updated','item',i.id::text,jsonb_build_object('column_id',null,'column_name','Item','column_key','title'));
  else
    perform public.wm_set_board_cell(p_item_id,p_column_id,p_value);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION private.mrh_sourcing_scope(p_board_id uuid, p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace uuid;
begin
 if auth.uid() is null or p_board_id is distinct from
  '617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid or
  p_item_id is null then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 select b.workspace_id into v_workspace
 from public.work_boards b
 join public.work_board_items i on i.board_id=b.id
 where b.id=p_board_id and i.id=p_item_id and b.status='active';
 if v_workspace is null
    or not public.work_board_access(p_board_id,'view')
    or private.material_request_hub_current_role(v_workspace)
       is distinct from 'ADMIN' then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 return v_workspace;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mrh_sourcing_sensitive_write(p_board_id uuid, p_item_id uuid, p_field_name text, p_value jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace uuid; v_revision bigint;
begin
 v_workspace:=private.mrh_sourcing_scope(p_board_id,p_item_id);
 if not public.work_board_access(p_board_id,'edit') then
  raise exception 'Material sourcing edit denied' using errcode='42501';
 end if;
 if p_field_name not in (
   'Selling Price (VAT-EX)','Requestor','Accounts','Supplier PO No.',
   'Buying Price','Currency','Ex. Rate USD','Ex. Rate EUR',
   'Shipping Cost','Shipping Cost Currency','Vendor Details'
 ) or p_value is null or p_value='null'::jsonb then
  raise exception 'Invalid restricted field update' using errcode='22023';
 end if;
 if p_field_name in ('Selling Price (VAT-EX)','Buying Price','Ex. Rate USD',
                     'Ex. Rate EUR','Shipping Cost') then
  if jsonb_typeof(p_value)<>'number' or
     (p_value#>>'{}')::numeric < 0 then
   raise exception 'Numeric sourcing value must be nonnegative' using errcode='22023';
  end if;
 elsif p_field_name in ('Currency','Shipping Cost Currency') then
  if jsonb_typeof(p_value)<>'string' or
     (p_value#>>'{}') not in ('PHP','USD','EUR') then
   raise exception 'Invalid sourcing currency' using errcode='22023';
  end if;
 elsif p_field_name='Requestor' then
  if jsonb_typeof(p_value)<>'string' or
   not exists(select 1 from public.workspace_members m
      where m.workspace_id=v_workspace
        and m.user_id=(p_value#>>'{}')::uuid and m.active=true) then
   raise exception 'Requestor must be an active workspace member'
    using errcode='22023';
  end if;
 else
  if jsonb_typeof(p_value)<>'string' or
    char_length(p_value#>>'{}')>2000 then
   raise exception 'Invalid sourcing text' using errcode='22023';
  end if;
 end if;

 if p_expected_revision is null then
  insert into private.mrh_sourcing_sensitive_cells
   (board_id,workspace_id,item_id,field_name,value,updated_by)
  values (p_board_id,v_workspace,p_item_id,p_field_name,p_value,auth.uid())
  on conflict do nothing returning revision into v_revision;
 else
  update private.mrh_sourcing_sensitive_cells
  set value=p_value, revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid()
  where board_id=p_board_id and workspace_id=v_workspace
    and item_id=p_item_id and field_name=p_field_name
    and revision=p_expected_revision
  returning revision into v_revision;
 end if;
 if v_revision is null then
  raise exception 'Sourcing field changed; refresh and retry after review'
   using errcode='PT409';
 end if;
 perform public.work_board_log(
  p_board_id,'sourcing.restricted_field_updated',
  'Authorized restricted sourcing field updated','item',p_item_id::text,
  jsonb_build_object('field_name',p_field_name,'revision',v_revision)
 );
 return jsonb_build_object('field_name',p_field_name,'revision',v_revision);
end;
$function$;

CREATE OR REPLACE FUNCTION public.wm_set_board_item_archived(p_item_id uuid, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare bid uuid; i public.work_board_items%rowtype; target integer;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into i from public.work_board_items where id=p_item_id and board_id=bid for update;
  if i.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;

  if p_archived and i.archived_at is not null then return; end if;
  if not p_archived and i.archived_at is null then return; end if;

  if p_archived then
    update public.work_board_items set archived_at=now(),updated_by=auth.uid(),updated_at=now() where id=i.id;
    update public.work_board_items set position=position-1,updated_at=now()
      where board_id=bid and group_id=i.group_id and archived_at is null and id<>i.id and position>i.position;
    target:=i.position;
  else
    select count(*) into target from public.work_board_items where board_id=bid and group_id=i.group_id and archived_at is null and id<>i.id;
    update public.work_board_items set archived_at=null,position=target,updated_by=auth.uid(),updated_at=now() where id=i.id;
  end if;

  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,case when p_archived then 'item.archived' else 'item.restored' end,case when p_archived then 'Item archived' else 'Item restored' end,'item',i.id::text,jsonb_build_object('group_id',i.group_id,'position',target));
end $function$;

CREATE OR REPLACE FUNCTION public.wm_add_board_item(p_board_id uuid, p_group_id uuid, p_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare iid uuid; pos integer; status_col public.work_board_columns%rowtype; initial_status text;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 240 then raise exception 'Item title is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text,0));
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=p_board_id) then raise exception 'Group does not belong to board'; end if;

  select * into status_col
  from public.work_board_columns
  where board_id=p_board_id and system_key='status' and data_type='status'
  order by position,id
  limit 1;
  if status_col.id is null then
    initial_status:='not_started';
  else
    initial_status:=nullif(status_col.config->>'default_label_id','');
    if initial_status is null or not exists(
      select 1 from jsonb_array_elements(coalesce(status_col.config->'labels','[]'::jsonb)) e
      where e->>'id'=initial_status and coalesce((e->>'active')::boolean,true)
    ) then
      select e->>'id' into initial_status
      from jsonb_array_elements(coalesce(status_col.config->'labels','[]'::jsonb)) e
      where coalesce((e->>'active')::boolean,true)
      order by coalesce((e->>'position')::integer,0),e->>'id'
      limit 1;
    end if;
  end if;

  select count(*) into pos from public.work_board_items where group_id=p_group_id and archived_at is null;
  insert into public.work_board_items(board_id,group_id,title,status,position,created_by,updated_by)
  values(p_board_id,p_group_id,btrim(p_title),initial_status,pos,auth.uid(),auth.uid()) returning id into iid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'item.created','Item added','item',iid::text,jsonb_build_object('title',btrim(p_title),'status',initial_status,'position',pos));
  return iid;
end $function$;
