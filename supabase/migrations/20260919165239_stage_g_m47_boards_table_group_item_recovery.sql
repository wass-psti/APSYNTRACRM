-- Stage G M47 — Boards Table / Group / Item Recovery
-- Forward-only semantic recovery for the existing M46 Board RPC surface.
-- Public RPC signatures remain unchanged.

-- Normalize pre-existing ordering drift before enforcing corrected mutation semantics.
with ranked_groups as (
  select id,row_number() over(partition by board_id order by position,id)-1 as next_position
  from public.work_board_groups
)
update public.work_board_groups g
set position=r.next_position,updated_at=case when g.position<>r.next_position then now() else g.updated_at end
from ranked_groups r
where g.id=r.id and g.position<>r.next_position;
with ranked_items as (
  select id,row_number() over(partition by group_id order by position,created_at,id)-1 as next_position
  from public.work_board_items
  where archived_at is null
)
update public.work_board_items i
set position=r.next_position,updated_at=case when i.position<>r.next_position then now() else i.updated_at end
from ranked_items r
where i.id=r.id and i.position<>r.next_position;
create or replace function public.wm_add_board_group(p_board_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid; pos integer; color text;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'Group title is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text,0));
  if not exists(select 1 from public.work_boards where id=p_board_id) or not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select count(*) into pos from public.work_board_groups where board_id=p_board_id;
  color:=(array['#5b7cfa','#7c5ce7','#e06083','#dc7a34','#2f9e73','#2186a8','#8b6b45','#65758b'])[(pos % 8)+1];
  insert into public.work_board_groups(board_id,title,accent_color,position)
  values(p_board_id,btrim(p_title),color,pos) returning id into gid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'group.created','Group added','group',gid::text,jsonb_build_object('title',btrim(p_title),'accent_color',color,'position',pos));
  return gid;
end $$;
create or replace function public.wm_move_board_group(p_group_id uuid,p_position integer) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; g public.work_board_groups%rowtype; target integer; old integer; cnt integer;
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into g from public.work_board_groups where id=p_group_id and board_id=bid for update;
  if g.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select count(*) into cnt from public.work_board_groups where board_id=bid;
  target:=greatest(0,least(coalesce(p_position,0),greatest(cnt-1,0)));
  old:=g.position;
  if target=old then return; end if;
  if target<old then
    update public.work_board_groups set position=position+1,updated_at=now() where board_id=bid and id<>g.id and position>=target and position<old;
  else
    update public.work_board_groups set position=position-1,updated_at=now() where board_id=bid and id<>g.id and position>old and position<=target;
  end if;
  update public.work_board_groups set position=target,updated_at=now() where id=g.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.moved','Group reordered','group',g.id::text,jsonb_build_object('position',target));
end $$;
create or replace function public.wm_delete_board_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; g public.work_board_groups%rowtype; cnt integer;
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into g from public.work_board_groups where id=p_group_id and board_id=bid for update;
  if g.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select count(*) into cnt from public.work_board_groups where board_id=bid;
  if cnt<=1 then raise exception 'A board must keep at least one group'; end if;
  if exists(
    select 1
    from public.work_board_items i
    join public.work_board_item_files f on f.item_id=i.id
    where i.group_id=g.id
  ) then
    raise exception 'Remove item files before deleting this group';
  end if;
  delete from public.work_board_groups where id=g.id;
  update public.work_board_groups set position=position-1,updated_at=now() where board_id=bid and position>g.position;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.deleted','Group deleted','group',g.id::text,jsonb_build_object('title',g.title,'position',g.position));
end $$;
create or replace function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
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
end $$;
create or replace function public.wm_move_board_item(p_item_id uuid,p_group_id uuid,p_position integer,p_status text default null) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; i public.work_board_items%rowtype; target_group public.work_board_groups%rowtype; status_col public.work_board_columns%rowtype; target integer; target_count integer; next_status text;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into i from public.work_board_items where id=p_item_id and board_id=bid for update;
  if i.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if i.archived_at is not null then raise exception 'Restore the item before moving it'; end if;
  select * into target_group from public.work_board_groups where id=p_group_id and board_id=bid;
  if target_group.id is null then raise exception 'Target group does not belong to board'; end if;

  next_status:=case when p_status is null then i.status when p_status='' then null else p_status end;
  if next_status is not null then
    select * into status_col from public.work_board_columns where board_id=bid and system_key='status' and data_type='status' order by position,id limit 1;
    if status_col.id is not null then
      if not exists(select 1 from jsonb_array_elements(coalesce(status_col.config->'labels','[]'::jsonb)) e where e->>'id'=next_status) then raise exception 'Unsupported item status'; end if;
    elsif next_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  end if;

  update public.work_board_items
     set position=position-1,updated_at=now()
   where board_id=bid and group_id=i.group_id and id<>i.id and archived_at is null and position>i.position;

  select count(*) into target_count
  from public.work_board_items
  where board_id=bid and group_id=p_group_id and id<>i.id and archived_at is null;
  target:=greatest(0,least(coalesce(p_position,target_count),target_count));

  update public.work_board_items
     set position=position+1,updated_at=now()
   where board_id=bid and group_id=p_group_id and id<>i.id and archived_at is null and position>=target;

  update public.work_board_items
     set group_id=p_group_id,position=target,status=next_status,updated_by=auth.uid(),updated_at=now()
   where id=i.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.moved','Item moved','item',i.id::text,jsonb_build_object('group_id',p_group_id,'position',target,'status',next_status));
end $$;
create or replace function public.wm_duplicate_board_item(p_item_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare bid uuid; src public.work_board_items%rowtype; new_id uuid; pos integer; nm text;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into src from public.work_board_items where id=p_item_id and board_id=bid for update;
  if src.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;

  if src.archived_at is null then
    pos:=src.position+1;
    update public.work_board_items set position=position+1,updated_at=now()
      where board_id=bid and group_id=src.group_id and id<>src.id and archived_at is null and position>=pos;
  else
    select count(*) into pos from public.work_board_items where board_id=bid and group_id=src.group_id and archived_at is null;
  end if;

  nm:=left(src.title||' copy',240);
  insert into public.work_board_items(board_id,group_id,title,status,assignee_id,due_date,notes,position,created_by,updated_by,archived_at)
  values(bid,src.group_id,nm,src.status,src.assignee_id,src.due_date,src.notes,pos,auth.uid(),auth.uid(),null)
  returning id into new_id;
  insert into public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
    select new_id,column_id,value,auth.uid(),now() from public.work_board_item_values where item_id=src.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.duplicated','Item duplicated','item',new_id::text,jsonb_build_object('source_item_id',src.id,'title',nm,'position',pos));
  return new_id;
end $$;
create or replace function public.wm_delete_board_item(p_item_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; src public.work_board_items%rowtype;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
  select * into src from public.work_board_items where id=p_item_id and board_id=bid for update;
  if src.id is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if exists(select 1 from public.work_board_item_files where item_id=src.id) then raise exception 'Remove item files before permanently deleting the item'; end if;
  perform public.work_board_log(bid,'item.deleted','Item permanently deleted','item',src.id::text,jsonb_build_object('title',src.title,'group_id',src.group_id,'position',src.position,'archived',src.archived_at is not null));
  delete from public.work_board_items where id=src.id;
  if src.archived_at is null then
    update public.work_board_items set position=position-1,updated_at=now()
      where board_id=bid and group_id=src.group_id and archived_at is null and position>src.position;
  end if;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
end $$;
create or replace function public.wm_set_board_item_archived(p_item_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path=public as $$
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
end $$;
-- M47 extends the existing anonymous-safe M46 contract attestation without changing its signature.
-- This keeps the governed 40-RPC contract stable while exposing post-migration semantic invariants.
create or replace function public.wm_board_contract_attestation() returns jsonb
language plpgsql stable security definer set search_path='' as $m46$
declare
  expected jsonb := $contract${"version":"1.43.2-m46-v1","rpcs":[{"name":"wm_board_backend_capabilities","argNames":[],"argTypes":[],"defaultCount":0,"returnType":"jsonb","outputFields":[]},{"name":"wm_list_boards","argNames":["p_status"],"argTypes":["text"],"defaultCount":1,"returnType":"record","outputFields":["id:uuid","name:text","description:text","status:text","member_role:text","item_count:bigint","updated_at:timestamp with time zone","created_at:timestamp with time zone"]},{"name":"wm_get_board","argNames":["p_board_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"jsonb","outputFields":[]},{"name":"wm_create_board","argNames":["p_name","p_description"],"argTypes":["text","text"],"defaultCount":1,"returnType":"uuid","outputFields":[]},{"name":"wm_create_board_configured","argNames":["p_name","p_description","p_columns"],"argTypes":["text","text","jsonb"],"defaultCount":2,"returnType":"uuid","outputFields":[]},{"name":"wm_add_board_column","argNames":["p_board_id","p_name","p_data_type","p_config"],"argTypes":["uuid","text","text","jsonb"],"defaultCount":1,"returnType":"uuid","outputFields":[]},{"name":"wm_add_board_column_at","argNames":["p_board_id","p_name","p_data_type","p_config","p_position"],"argTypes":["uuid","text","text","jsonb","integer"],"defaultCount":2,"returnType":"uuid","outputFields":[]},{"name":"wm_duplicate_board","argNames":["p_board_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"uuid","outputFields":[]},{"name":"wm_update_board","argNames":["p_board_id","p_name","p_description"],"argTypes":["uuid","text","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_delete_board_permanently","argNames":["p_board_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_get_board_preferences","argNames":["p_board_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"jsonb","outputFields":[]},{"name":"wm_set_board_preferences","argNames":["p_board_id","p_preferences"],"argTypes":["uuid","jsonb"],"defaultCount":0,"returnType":"jsonb","outputFields":[]},{"name":"wm_add_board_group","argNames":["p_board_id","p_title"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"uuid","outputFields":[]},{"name":"wm_update_board_group","argNames":["p_group_id","p_title"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_move_board_group","argNames":["p_group_id","p_position"],"argTypes":["uuid","integer"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_delete_board_group","argNames":["p_group_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_set_board_group_accent","argNames":["p_group_id","p_accent_color"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_update_board_column","argNames":["p_column_id","p_name","p_config","p_visible"],"argTypes":["uuid","text","jsonb","boolean"],"defaultCount":1,"returnType":"void","outputFields":[]},{"name":"wm_change_board_column_type","argNames":["p_column_id","p_data_type","p_config","p_clear_values"],"argTypes":["uuid","text","jsonb","boolean"],"defaultCount":2,"returnType":"void","outputFields":[]},{"name":"wm_move_board_column","argNames":["p_column_id","p_position"],"argTypes":["uuid","integer"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_duplicate_board_column","argNames":["p_column_id","p_with_values"],"argTypes":["uuid","boolean"],"defaultCount":1,"returnType":"uuid","outputFields":[]},{"name":"wm_delete_board_column","argNames":["p_column_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_add_board_item","argNames":["p_board_id","p_group_id","p_title"],"argTypes":["uuid","uuid","text"],"defaultCount":0,"returnType":"uuid","outputFields":[]},{"name":"wm_update_board_item","argNames":["p_item_id","p_title","p_status","p_assignee_id","p_due_date","p_notes"],"argTypes":["uuid","text","text","uuid","date","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_move_board_item","argNames":["p_item_id","p_group_id","p_position","p_status"],"argTypes":["uuid","uuid","integer","text"],"defaultCount":1,"returnType":"void","outputFields":[]},{"name":"wm_duplicate_board_item","argNames":["p_item_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"uuid","outputFields":[]},{"name":"wm_delete_board_item","argNames":["p_item_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_set_board_item_archived","argNames":["p_item_id","p_archived"],"argTypes":["uuid","boolean"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_set_board_cell","argNames":["p_item_id","p_column_id","p_value"],"argTypes":["uuid","uuid","jsonb"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_set_board_status","argNames":["p_board_id","p_status"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_set_board_status_labels","argNames":["p_column_id","p_labels","p_default_label_id"],"argTypes":["uuid","jsonb","text"],"defaultCount":1,"returnType":"jsonb","outputFields":[]},{"name":"wm_set_board_view","argNames":["p_board_id","p_view"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_add_board_member","argNames":["p_board_id","p_email","p_role"],"argTypes":["uuid","text","text"],"defaultCount":1,"returnType":"void","outputFields":[]},{"name":"wm_remove_board_member","argNames":["p_board_id","p_user_id"],"argTypes":["uuid","uuid"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_get_board_item_workspace","argNames":["p_item_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"jsonb","outputFields":[]},{"name":"wm_add_board_item_update","argNames":["p_item_id","p_body"],"argTypes":["uuid","text"],"defaultCount":0,"returnType":"bigint","outputFields":[]},{"name":"wm_delete_board_item_update","argNames":["p_update_id"],"argTypes":["bigint"],"defaultCount":0,"returnType":"void","outputFields":[]},{"name":"wm_register_board_item_file","argNames":["p_item_id","p_storage_path","p_file_name","p_mime_type","p_size_bytes"],"argTypes":["uuid","text","text","text","bigint"],"defaultCount":0,"returnType":"uuid","outputFields":[]},{"name":"wm_delete_board_item_file","argNames":["p_file_id"],"argTypes":["uuid"],"defaultCount":0,"returnType":"text","outputFields":[]},{"name":"wm_list_board_events","argNames":["p_board_id","p_limit"],"argTypes":["uuid","integer"],"defaultCount":1,"returnType":"record","outputFields":["id:bigint","event_type:text","message:text","entity_type:text","entity_id:text","payload:jsonb","created_at:timestamp with time zone","actor_id:uuid","actor_name:text","actor_email:text"]}],"tables":[{"name":"work_boards","columns":[{"name":"id","udt":"uuid","nullable":"NO"},{"name":"workspace_id","udt":"uuid","nullable":"NO"},{"name":"name","udt":"text","nullable":"NO"},{"name":"description","udt":"text","nullable":"NO"},{"name":"status","udt":"text","nullable":"NO"},{"name":"created_by","udt":"uuid","nullable":"NO"},{"name":"updated_by","udt":"uuid","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"},{"name":"archived_at","udt":"timestamptz","nullable":"YES"},{"name":"trashed_at","udt":"timestamptz","nullable":"YES"}],"policies":[]},{"name":"work_board_members","columns":[{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"user_id","udt":"uuid","nullable":"NO"},{"name":"role","udt":"text","nullable":"NO"},{"name":"view_mode","udt":"text","nullable":"NO"},{"name":"added_by","udt":"uuid","nullable":"YES"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"},{"name":"preferences","udt":"jsonb","nullable":"NO"}],"policies":[]},{"name":"work_board_groups","columns":[{"name":"id","udt":"uuid","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"title","udt":"text","nullable":"NO"},{"name":"accent_color","udt":"text","nullable":"NO"},{"name":"position","udt":"int4","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_columns","columns":[{"name":"id","udt":"uuid","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"column_key","udt":"text","nullable":"NO"},{"name":"name","udt":"text","nullable":"NO"},{"name":"data_type","udt":"text","nullable":"NO"},{"name":"system_key","udt":"text","nullable":"YES"},{"name":"position","udt":"int4","nullable":"NO"},{"name":"visible","udt":"bool","nullable":"NO"},{"name":"required","udt":"bool","nullable":"NO"},{"name":"config","udt":"jsonb","nullable":"NO"},{"name":"created_by","udt":"uuid","nullable":"NO"},{"name":"updated_by","udt":"uuid","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_items","columns":[{"name":"id","udt":"uuid","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"group_id","udt":"uuid","nullable":"NO"},{"name":"title","udt":"text","nullable":"NO"},{"name":"status","udt":"text","nullable":"YES"},{"name":"assignee_id","udt":"uuid","nullable":"YES"},{"name":"due_date","udt":"date","nullable":"YES"},{"name":"notes","udt":"text","nullable":"NO"},{"name":"position","udt":"int4","nullable":"NO"},{"name":"archived_at","udt":"timestamptz","nullable":"YES"},{"name":"created_by","udt":"uuid","nullable":"NO"},{"name":"updated_by","udt":"uuid","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_item_values","columns":[{"name":"item_id","udt":"uuid","nullable":"NO"},{"name":"column_id","udt":"uuid","nullable":"NO"},{"name":"value","udt":"jsonb","nullable":"YES"},{"name":"updated_by","udt":"uuid","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_item_updates","columns":[{"name":"id","udt":"int8","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"item_id","udt":"uuid","nullable":"NO"},{"name":"body","udt":"text","nullable":"NO"},{"name":"created_by","udt":"uuid","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"},{"name":"updated_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_item_files","columns":[{"name":"id","udt":"uuid","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"item_id","udt":"uuid","nullable":"NO"},{"name":"storage_path","udt":"text","nullable":"NO"},{"name":"file_name","udt":"text","nullable":"NO"},{"name":"mime_type","udt":"text","nullable":"NO"},{"name":"size_bytes","udt":"int8","nullable":"NO"},{"name":"created_by","udt":"uuid","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"}],"policies":[]},{"name":"work_board_events","columns":[{"name":"id","udt":"int8","nullable":"NO"},{"name":"board_id","udt":"uuid","nullable":"NO"},{"name":"actor_id","udt":"uuid","nullable":"NO"},{"name":"event_type","udt":"text","nullable":"NO"},{"name":"message","udt":"text","nullable":"NO"},{"name":"entity_type","udt":"text","nullable":"YES"},{"name":"entity_id","udt":"text","nullable":"YES"},{"name":"payload","udt":"jsonb","nullable":"NO"},{"name":"created_at","udt":"timestamptz","nullable":"NO"}],"policies":[]}],"storage":{"bucket":"work-board-files","public":false,"fileSizeLimit":20971520,"policies":[{"name":"wm board files read","command":"SELECT","roles":["authenticated"],"expression":"USING","requiredFragments":["work-board-files","work_board_access","view"],"forbiddenFragments":["owner_id"]},{"name":"wm board files insert","command":"INSERT","roles":["authenticated"],"expression":"WITH CHECK","requiredFragments":["work-board-files","owner_id","auth.uid","work_board_access","view"],"forbiddenFragments":[]},{"name":"wm board files delete","command":"DELETE","roles":["authenticated"],"expression":"USING","requiredFragments":["work-board-files","owner_id","auth.uid","work_board_access","manage"],"forbiddenFragments":[]}],"allowedMimeTypes":null},"realtime":{"functions":[{"name":"work_board_realtime_topic_access","argTypes":["text"],"returnType":"boolean","securityDefiner":true,"searchPath":"","authenticatedExecute":true,"anonExecute":false},{"name":"work_board_realtime_broadcast_change","argTypes":[],"returnType":"trigger","securityDefiner":true,"searchPath":"","authenticatedExecute":false,"anonExecute":false}],"policies":[{"name":"wm_board_realtime_receive","command":"SELECT","roles":["authenticated"],"expression":"USING","requiredFragments":["broadcast","presence","work_board_realtime_topic_access","realtime.topic"],"forbiddenFragments":[]},{"name":"wm_board_realtime_presence_track","command":"INSERT","roles":["authenticated"],"expression":"WITH CHECK","requiredFragments":["presence","work_board_realtime_topic_access","realtime.topic"],"forbiddenFragments":["broadcast"]}],"triggers":[{"name":"work_boards_realtime_change","table":"work_boards","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_members_realtime_change","table":"work_board_members","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_groups_realtime_change","table":"work_board_groups","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_items_realtime_change","table":"work_board_items","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_columns_realtime_change","table":"work_board_columns","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_item_values_realtime_change","table":"work_board_item_values","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_item_updates_realtime_change","table":"work_board_item_updates","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]},{"name":"work_board_item_files_realtime_change","table":"work_board_item_files","function":"work_board_realtime_broadcast_change","events":["INSERT","UPDATE","DELETE"]}]},"dto":{"workspaceIdentityKeys":["author_id","actor_id"],"compatibilityAliases":["created_by"]},"capabilities":{"canonical_workspace_identity":true,"scoped_query_cache":true,"authoritative_file_delete":true,"live_contract_attestation":true,"private_board_realtime":true}}$contract$::jsonb;
  rpc jsonb;
  tbl jsonb;
  fn jsonb;
  pol jsonb;
  trg jsonb;
  fragment text;
  p record;
  fp record;
  policy_row record;
  actual_outputs jsonb;
  policy_expression text;
  rpc_ok_count integer := 0;
  table_ok_count integer := 0;
  rls_ok_count integer := 0;
  board_table_policy_count integer := 0;
  board_table_policy_ok_count integer := 0;
  privilege_violations integer := 0;
  storage_ok boolean := false;
  storage_policy_count integer := 0;
  realtime_function_count integer := 0;
  realtime_policy_count integer := 0;
  realtime_trigger_count integer := 0;
  actual_column_count integer := 0;
  actual_policy_count integer := 0;
  policy_ok boolean := false;
  function_ok boolean := false;
  capabilities jsonb := '{}'::jsonb;
  capabilities_ok boolean := false;
  expected_rpc_count integer := jsonb_array_length(expected->'rpcs');
  expected_table_count integer := jsonb_array_length(expected->'tables');
  compatible boolean := false;
  m47_group_order_ok boolean := false;
  m47_active_item_order_ok boolean := false;
  m47_mutation_security_ok boolean := false;
  m47_order_indexes_ok boolean := false;
begin
  for rpc in select value from jsonb_array_elements(expected->'rpcs') loop
    select p0.* into p
      from pg_catalog.pg_proc p0
      join pg_catalog.pg_namespace n on n.oid=p0.pronamespace
     where n.nspname='public'
       and p0.proname=rpc->>'name'
       and p0.prokind='f'
       and pg_catalog.oidvectortypes(p0.proargtypes)=array_to_string(array(select jsonb_array_elements_text(rpc->'argTypes')),', ')
     order by p0.oid
     limit 1;

    if p.oid is not null then
      select coalesce(jsonb_agg((p.proargnames[s.i]||':'||pg_catalog.format_type(p.proallargtypes[s.i],null)) order by s.i),'[]'::jsonb)
        into actual_outputs
        from generate_subscripts(coalesce(p.proallargtypes,'{}'::oid[]),1) as s(i)
       where p.proargmodes[s.i] in ('o','b','t');

      if coalesce(to_jsonb(p.proargnames[1:p.pronargs]),'[]'::jsonb)=rpc->'argNames'
         and p.pronargdefaults=(rpc->>'defaultCount')::integer
         and pg_catalog.format_type(p.prorettype,null)=rpc->>'returnType'
         and actual_outputs=rpc->'outputFields'
         and p.prosecdef
         and coalesce('search_path=public'=any(p.proconfig),false)
         and has_function_privilege('authenticated',p.oid,'EXECUTE')
         and not has_function_privilege('anon',p.oid,'EXECUTE')
         and 1=(select count(*) from pg_catalog.pg_proc px join pg_catalog.pg_namespace nx on nx.oid=px.pronamespace
                  where nx.nspname='public' and px.proname=rpc->>'name' and px.prokind='f'
                    and has_function_privilege('authenticated',px.oid,'EXECUTE'))
      then
        rpc_ok_count := rpc_ok_count+1;
      end if;
    end if;
  end loop;

  for tbl in select value from jsonb_array_elements(expected->'tables') loop
    select count(*) into actual_column_count
      from information_schema.columns c
     where c.table_schema='public' and c.table_name=tbl->>'name';

    if actual_column_count=jsonb_array_length(tbl->'columns')
       and not exists(
         select 1
           from jsonb_array_elements(tbl->'columns') as req(column_contract)
          where not exists(
            select 1 from information_schema.columns c
             where c.table_schema='public'
               and c.table_name=tbl->>'name'
               and c.column_name=req.column_contract->>'name'
               and c.udt_name=req.column_contract->>'udt'
               and c.is_nullable=req.column_contract->>'nullable'
          )
       )
    then table_ok_count:=table_ok_count+1; end if;

    if exists(
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=tbl->>'name' and c.relkind='r' and c.relrowsecurity
    ) then rls_ok_count:=rls_ok_count+1; end if;

    select count(*) into actual_policy_count
      from pg_catalog.pg_policies pp
     where pp.schemaname='public' and pp.tablename=tbl->>'name';
    board_table_policy_count:=board_table_policy_count+actual_policy_count;
    if actual_policy_count=jsonb_array_length(tbl->'policies') then
      board_table_policy_ok_count:=board_table_policy_ok_count+1;
    end if;

    if exists(
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=tbl->>'name'
         and (
           has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT')
           or has_table_privilege('anon',c.oid,'UPDATE') or has_table_privilege('anon',c.oid,'DELETE')
           or has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
           or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE')
         )
    ) then privilege_violations:=privilege_violations+1; end if;
  end loop;

  select exists(
    select 1 from storage.buckets b
     where b.id=expected->'storage'->>'bucket'
       and b.public=(expected->'storage'->>'public')::boolean
       and b.file_size_limit=(expected->'storage'->>'fileSizeLimit')::bigint
       and ((expected->'storage'->'allowedMimeTypes')='null'::jsonb and b.allowed_mime_types is null)
  ) into storage_ok;

  for pol in select value from jsonb_array_elements(expected->'storage'->'policies') loop
    select pp.* into policy_row from pg_catalog.pg_policies pp
     where pp.schemaname='storage' and pp.tablename='objects' and pp.policyname=pol->>'name' limit 1;
    policy_ok:=policy_row.policyname is not null
      and policy_row.cmd=pol->>'command'
      and policy_row.roles::text[]=array(select jsonb_array_elements_text(pol->'roles'));
    policy_expression:=case pol->>'expression' when 'USING' then policy_row.qual when 'WITH CHECK' then policy_row.with_check else null end;
    for fragment in select jsonb_array_elements_text(pol->'requiredFragments') loop
      if position(fragment in coalesce(policy_expression,''))=0 then policy_ok:=false; end if;
    end loop;
    for fragment in select jsonb_array_elements_text(pol->'forbiddenFragments') loop
      if position(fragment in coalesce(policy_expression,''))>0 then policy_ok:=false; end if;
    end loop;
    if policy_ok then storage_policy_count:=storage_policy_count+1; end if;
  end loop;

  for fn in select value from jsonb_array_elements(expected->'realtime'->'functions') loop
    select p0.* into fp
      from pg_catalog.pg_proc p0 join pg_catalog.pg_namespace n on n.oid=p0.pronamespace
     where n.nspname='public' and p0.proname=fn->>'name' and p0.prokind='f'
       and pg_catalog.oidvectortypes(p0.proargtypes)=array_to_string(array(select jsonb_array_elements_text(fn->'argTypes')),', ')
     order by p0.oid limit 1;
    function_ok:=fp.oid is not null
      and pg_catalog.format_type(fp.prorettype,null)=fn->>'returnType'
      and fp.prosecdef=(fn->>'securityDefiner')::boolean
      and coalesce((case when fn->>'searchPath'='' then 'search_path=""' else 'search_path='||(fn->>'searchPath') end)=any(fp.proconfig),false)
      and has_function_privilege('authenticated',fp.oid,'EXECUTE')=(fn->>'authenticatedExecute')::boolean
      and has_function_privilege('anon',fp.oid,'EXECUTE')=(fn->>'anonExecute')::boolean;
    if function_ok then realtime_function_count:=realtime_function_count+1; end if;
  end loop;

  for pol in select value from jsonb_array_elements(expected->'realtime'->'policies') loop
    select pp.* into policy_row from pg_catalog.pg_policies pp
     where pp.schemaname='realtime' and pp.tablename='messages' and pp.policyname=pol->>'name' limit 1;
    policy_ok:=policy_row.policyname is not null
      and policy_row.cmd=pol->>'command'
      and policy_row.roles::text[]=array(select jsonb_array_elements_text(pol->'roles'));
    policy_expression:=case pol->>'expression' when 'USING' then policy_row.qual when 'WITH CHECK' then policy_row.with_check else null end;
    for fragment in select jsonb_array_elements_text(pol->'requiredFragments') loop
      if position(fragment in coalesce(policy_expression,''))=0 then policy_ok:=false; end if;
    end loop;
    for fragment in select jsonb_array_elements_text(pol->'forbiddenFragments') loop
      if position(fragment in coalesce(policy_expression,''))>0 then policy_ok:=false; end if;
    end loop;
    if policy_ok then realtime_policy_count:=realtime_policy_count+1; end if;
  end loop;

  for trg in select value from jsonb_array_elements(expected->'realtime'->'triggers') loop
    if exists(
      select 1
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid=t.tgrelid
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        join pg_catalog.pg_proc f on f.oid=t.tgfoid
        join pg_catalog.pg_namespace fn on fn.oid=f.pronamespace
       where n.nspname='public' and c.relname=trg->>'table'
         and t.tgname=trg->>'name' and not t.tgisinternal and t.tgenabled='O'
         and t.tgtype=29
         and fn.nspname='public' and f.proname=trg->>'function'
    ) then realtime_trigger_count:=realtime_trigger_count+1; end if;
  end loop;

  begin
    capabilities:=public.wm_board_backend_capabilities();
    capabilities_ok:=capabilities->>'schema_version'=expected->>'version'
      and capabilities->>'contract_digest'='2e5db3073f702cad96be3eb1d4a18b33ea039252ad4d0532dc9b6e1b3ca0da1c'
      and not exists(
        select 1 from jsonb_each(expected->'capabilities') as req(key,value)
         where coalesce((capabilities->>req.key)::boolean,false)<>(req.value::text)::boolean
      );
  exception when others then
    capabilities_ok:=false;
  end;

  compatible := rpc_ok_count=expected_rpc_count
    and table_ok_count=expected_table_count
    and rls_ok_count=expected_table_count
    and board_table_policy_ok_count=expected_table_count
    and board_table_policy_count=(select coalesce(sum(jsonb_array_length(value->'policies')),0)::integer from jsonb_array_elements(expected->'tables'))
    and privilege_violations=0
    and storage_ok
    and storage_policy_count=jsonb_array_length(expected->'storage'->'policies')
    and realtime_function_count=jsonb_array_length(expected->'realtime'->'functions')
    and realtime_policy_count=jsonb_array_length(expected->'realtime'->'policies')
    and realtime_trigger_count=jsonb_array_length(expected->'realtime'->'triggers')
    and capabilities_ok;

  select not exists(
    select 1 from (
      select g.position, row_number() over(partition by g.board_id order by g.position,g.id)-1 as expected_position
      from public.work_board_groups g
    ) q where q.position<>q.expected_position
  ) into m47_group_order_ok;

  select not exists(
    select 1 from (
      select i.position, row_number() over(partition by i.group_id order by i.position,i.id)-1 as expected_position
      from public.work_board_items i
      where i.archived_at is null
    ) q where q.position<>q.expected_position
  ) into m47_active_item_order_ok;

  select count(*)=8 into m47_mutation_security_ok
  from pg_catalog.pg_proc m47_proc
  join pg_catalog.pg_namespace m47_ns on m47_ns.oid=m47_proc.pronamespace
  where m47_ns.nspname='public' and m47_proc.prokind='f'
    and m47_proc.proname=any(array[
      'wm_add_board_group','wm_move_board_group','wm_delete_board_group',
      'wm_add_board_item','wm_move_board_item','wm_duplicate_board_item',
      'wm_delete_board_item','wm_set_board_item_archived'
    ])
    and m47_proc.prosecdef
    and coalesce('search_path=public'=any(m47_proc.proconfig),false)
    and has_function_privilege('authenticated',m47_proc.oid,'EXECUTE')
    and not has_function_privilege('anon',m47_proc.oid,'EXECUTE');

  m47_order_indexes_ok :=
    to_regclass('public.work_board_groups_board_position_idx') is not null
    and to_regclass('public.work_board_items_group_position_idx') is not null
    and to_regclass('public.work_board_item_files_item_idx') is not null;

  return jsonb_build_object(
    'contract_version','1.43.2-m46-v1',
    'contract_digest','2e5db3073f702cad96be3eb1d4a18b33ea039252ad4d0532dc9b6e1b3ca0da1c',
    'schema_version',capabilities->>'schema_version',
    'compatible',compatible,
    'rpc_count',rpc_ok_count,'expected_rpc_count',expected_rpc_count,
    'table_count',table_ok_count,'expected_table_count',expected_table_count,
    'rls_table_count',rls_ok_count,
    'board_table_policy_count',board_table_policy_count,
    'board_table_policy_table_count',board_table_policy_ok_count,
    'direct_privilege_violations',privilege_violations,
    'storage_ok',storage_ok,'storage_policy_count',storage_policy_count,
    'realtime_function_count',realtime_function_count,
    'realtime_policy_count',realtime_policy_count,'realtime_trigger_count',realtime_trigger_count,
    'capabilities_ok',capabilities_ok,
    'm47_semantics_version','1.43.2-m47-v1',
    'm47_group_order_ok',m47_group_order_ok,
    'm47_active_item_order_ok',m47_active_item_order_ok,
    'm47_mutation_security_ok',m47_mutation_security_ok,
    'm47_order_indexes_ok',m47_order_indexes_ok,
    'm47_compatible',compatible and m47_group_order_ok and m47_active_item_order_ok and m47_mutation_security_ok and m47_order_indexes_ok
  );
end $m46$;
revoke all on function public.wm_board_contract_attestation() from public;
grant execute on function public.wm_board_contract_attestation() to anon, authenticated;
notify pgrst, 'reload schema';
