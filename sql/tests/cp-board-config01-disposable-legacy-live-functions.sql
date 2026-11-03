-- Disposable PostgreSQL: exact production definitions, before v2 hardening.
CREATE OR REPLACE FUNCTION public.wm_import_board_wizard_atomic(p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  actor uuid := auth.uid();
  b public.work_boards%rowtype;
  target_group uuid;
  gp jsonb;
  match_policy jsonb;
  behavior text;
  match_column_id text;
  match_source text;
  match_target uuid;
  match_type text;
  match_system_key text;
  match_value text;
  current_key text;
  known_keys text[] := array[]::text[];
  mapping jsonb;
  definition jsonb;
  record_row jsonb;
  mappings jsonb;
  new_columns jsonb;
  row_values jsonb;
  map_by_source jsonb := '{}'::jsonb;
  columns_by_source jsonb := '{}'::jsonb;
  source_name text;
  source_column_id uuid;
  source_column_type text;
  new_name text;
  new_type text;
  created_column uuid;
  item_name text;
  item_id uuid;
  version_expected timestamptz;
  matches_found integer;
  position_new integer;
  item_mapping_count integer := 0;
  created_items integer := 0;
  updated_items integer := 0;
  skipped_items integer := 0;
  created_columns integer := 0;
  created_groups integer := 0;
  row_count integer;
  column_count integer;
  mapped_value jsonb;
  col_name text;
  column_options jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' or p_payload->>'contract' is distinct from 'm143-v1' then
    raise exception 'Unsupported wizard import contract' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'mappings'),'') <> 'array' or coalesce(jsonb_typeof(p_payload->'rows'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'newColumns'),'') <> 'array' or coalesce(jsonb_typeof(p_payload->'group'),'') <> 'object'
     or coalesce(jsonb_typeof(p_payload->'matches'),'') <> 'object' then
    raise exception 'Wizard import requires mappings, rows, group, columns and matching policy' using errcode = '22023';
  end if;
  row_count := jsonb_array_length(p_payload->'rows');
  if row_count not between 1 and 5000 then raise exception 'Wizard import must contain 1-5000 rows' using errcode = '54000'; end if;
  if jsonb_array_length(p_payload->'mappings') not between 1 and 30 then
    raise exception 'Wizard mapping count must be 1-30' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'newColumns') > 30 then raise exception 'Too many new columns' using errcode = '54000'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text, 0));
  select * into b from public.work_boards where id=p_board_id for update;
  if b.id is null or b.status <> 'active' or not public.work_board_access(p_board_id,'edit') then
    raise exception 'Active Board edit access is required' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'Board changed after preview; refresh and review before retry' using errcode = 'PT409';
  end if;
  perform 1 from public.work_board_groups where board_id=p_board_id for update;
  perform 1 from public.work_board_columns where board_id=p_board_id for update;
  perform 1 from public.work_board_items where board_id=p_board_id and archived_at is null for update;
  perform 1 from public.work_board_item_values v
    join public.work_board_items i on i.id=v.item_id
    where i.board_id=p_board_id and i.archived_at is null for update of v;
  perform 1 from public.work_board_members where board_id=p_board_id for share;

  gp := p_payload->'group';
  if gp->>'action' = 'existing' then
    begin target_group := (gp->>'groupId')::uuid;
    exception when others then raise exception 'Invalid destination Group ID' using errcode = '22023'; end;
    if not exists (select 1 from public.work_board_groups where id=target_group and board_id=p_board_id) then
      raise exception 'Destination Group no longer belongs to this Board' using errcode = '23503';
    end if;
  elsif gp->>'action' = 'create' then
    new_name := btrim(coalesce(gp->>'name',''));
    if char_length(new_name) not between 1 and 120 then raise exception 'New Group name length is invalid' using errcode = '22023'; end if;
    if exists (select 1 from public.work_board_groups where board_id=p_board_id and lower(btrim(title))=lower(new_name)) then
      raise exception 'Group name now collides with an existing Group' using errcode = 'PT409';
    end if;
    target_group := public.wm_add_board_group(p_board_id,new_name);
    created_groups := 1;
  else
    raise exception 'Unsupported Group action' using errcode = '22023';
  end if;

  select count(*) into column_count from public.work_board_columns where board_id=p_board_id;
  if column_count + jsonb_array_length(p_payload->'newColumns') > 30 then
    raise exception 'The Board supports at most 30 columns' using errcode = '54000';
  end if;
  -- Source headers and destination targets are unique in this transaction.
  mappings := p_payload->'mappings';
  for mapping in select value from jsonb_array_elements(mappings) loop
    if coalesce(jsonb_typeof(mapping),'') <> 'object' then raise exception 'Invalid mapping object' using errcode = '22023'; end if;
    source_name := btrim(coalesce(mapping->>'source',''));
    if source_name='' or char_length(source_name)>240 or map_by_source ? source_name then
      raise exception 'Missing or repeated source header' using errcode = '22023';
    end if;
    if coalesce(mapping->>'action','') not in ('item','skip','existing','create') then
      raise exception 'Unsupported mapping action' using errcode = '22023';
    end if;
    if mapping->>'action' = 'item' then item_mapping_count := item_mapping_count + 1; end if;
    map_by_source := map_by_source || jsonb_build_object(source_name,mapping);
  end loop;
  if item_mapping_count<>1 then raise exception 'Map exactly one primary Item column' using errcode = '22023'; end if;

  new_columns := p_payload->'newColumns';
  for definition in select value from jsonb_array_elements(new_columns) loop
    if coalesce(jsonb_typeof(definition),'')<>'object' then raise exception 'Invalid new column definition' using errcode = '22023'; end if;
    source_name := btrim(coalesce(definition->>'source',''));
    new_name := btrim(coalesce(definition->>'name',''));
    new_type := definition->>'type';
    if char_length(new_name) not between 1 and 80 or source_name='' or columns_by_source ? source_name
       or coalesce(map_by_source->source_name->>'action','') <> 'create'
       or coalesce(map_by_source->source_name->>'name','') <> new_name
       or coalesce(map_by_source->source_name->>'columnType','') <> new_type then
      raise exception 'New column definition is inconsistent with the reviewed mapping' using errcode = '22023';
    end if;
    if coalesce(new_type,'') not in ('text','long_text','number','date','people','checkbox','timeline','email','url') then
      raise exception 'New choice/status columns require explicit configured option approval' using errcode = '22023';
    end if;
    if exists(select 1 from public.work_board_columns where board_id=p_board_id and lower(name)=lower(new_name)) then
      raise exception 'A proposed column name now conflicts' using errcode = 'PT409';
    end if;
    if coalesce(definition->'config','{}'::jsonb)<>'{}'::jsonb then
      raise exception 'Custom column configuration is not supported by contract m143-v1' using errcode = '22023';
    end if;
    created_column := public.wm_add_board_column(p_board_id,new_name,new_type,'{}'::jsonb);
    columns_by_source := columns_by_source || jsonb_build_object(source_name,created_column::text);
    created_columns := created_columns + 1;
  end loop;

  for mapping in select value from jsonb_array_elements(mappings) loop
    source_name := mapping->>'source';
    if mapping->>'action'='create' and not (columns_by_source ? source_name) then
      raise exception 'New column mapping lacks a column definition' using errcode = '22023';
    end if;
    if mapping->>'action'='existing' then
      begin source_column_id := (mapping->>'columnId')::uuid;
      exception when others then raise exception 'Invalid existing column identifier' using errcode = '22023'; end;
      select name, data_type into col_name, source_column_type
        from public.work_board_columns where id=source_column_id and board_id=p_board_id and system_key is distinct from 'title';
      if col_name is null then raise exception 'Existing destination column is not available' using errcode = '23503'; end if;
      if exists(select 1 from jsonb_each_text(columns_by_source) x where x.value=source_column_id::text) then
        raise exception 'Two source headers target one destination column' using errcode = '22023';
      end if;
      columns_by_source := columns_by_source || jsonb_build_object(source_name,source_column_id::text);
    end if;
  end loop;

  match_policy := p_payload->'matches';
  behavior := match_policy->>'behavior';
  if coalesce(behavior,'') not in ('add-new','skip','update') then raise exception 'Unknown match policy' using errcode = '22023'; end if;
  match_column_id := match_policy->>'matchColumnId';
  if behavior <> 'add-new' then
    if coalesce(match_column_id,'')='' then raise exception 'Matching column is required' using errcode = '22023'; end if;
    if gp->>'action'='create' and behavior='update' then raise exception 'Cannot update against a newly created Group' using errcode = '22023'; end if;
    if match_column_id<>'item' then
      begin match_target:=match_column_id::uuid;
      exception when others then raise exception 'Invalid match column identifier' using errcode = '22023'; end;
      select data_type,system_key into match_type,match_system_key
        from public.work_board_columns where id=match_target and board_id=p_board_id;
      if match_type not in ('text','email','url','dropdown','status') then
        raise exception 'Matching currently supports Item, Text, Email, URL, Dropdown or Status only' using errcode = '22023';
      end if;
      select x.key into match_source from jsonb_each(columns_by_source) x where x.value#>>'{}'=match_target::text;
      if match_source is null then raise exception 'Match column must be included in the mapped import' using errcode = '22023'; end if;
    else
      select value->>'source' into match_source from jsonb_each(map_by_source) x(key,value) where value->>'action'='item';
    end if;
  end if;

  for record_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if coalesce(jsonb_typeof(record_row),'')<>'object' or coalesce(jsonb_typeof(record_row->'values'),'')<>'object' then
      raise exception 'Invalid import row payload' using errcode='22023';
    end if;
    item_name := btrim(coalesce(record_row->>'title',''));
    if char_length(item_name) not between 1 and 240 then raise exception 'Imported Item name is invalid' using errcode='22023'; end if;
    row_values := record_row->'values';
    for source_name in select jsonb_object_keys(row_values) loop
      if not (columns_by_source ? source_name) then
        raise exception 'Imported values contain an unmapped column' using errcode='22023';
      end if;
    end loop;
    item_id := null;
    if behavior <> 'add-new' then
      if match_column_id = 'item' then match_value := lower(btrim(item_name));
      else match_value := lower(btrim(coalesce(row_values->match_source #>> '{}',''))); end if;
      if match_value is null or match_value='' then raise exception 'Matching value must not be empty' using errcode='22023'; end if;
      if match_value = any(known_keys) then raise exception 'Ambiguous repeated source match value' using errcode='PT409'; end if;
      known_keys := array_append(known_keys,match_value);
      if match_column_id='item' then
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(i.title))=match_value;
      elsif match_system_key='status' then
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(coalesce(i.status,'')))=match_value;
      else
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i join public.work_board_item_values v on v.item_id=i.id and v.column_id=match_target
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(coalesce(v.value#>>'{}','')))=match_value;
      end if;
      if matches_found>1 then raise exception 'Match is ambiguous in target Group' using errcode='PT409'; end if;
      if (behavior='skip' and matches_found=1) or (behavior='update' and matches_found=0) then
        skipped_items := skipped_items+1;
        continue;
      end if;
    end if;

    if behavior='update' then
      if item_id is null then raise exception 'Expected a unique matching Item' using errcode='PT409'; end if;
      if nullif(record_row->>'expected_item_updated_at','') is null then
        raise exception 'Update requires the current Item version from reviewed preview' using errcode='PT409';
      end if;
      begin version_expected := (record_row->>'expected_item_updated_at')::timestamptz;
      exception when others then raise exception 'Invalid expected Item version' using errcode='22023'; end;
      if not exists(select 1 from public.work_board_items
         where id=item_id and board_id=p_board_id and updated_at=version_expected and archived_at is null) then
        raise exception 'An Item changed after preview; revalidate the import' using errcode='PT409';
      end if;
      if exists(select 1 from public.work_board_items
        where board_id=p_board_id and group_id=target_group and archived_at is null
        and id<>item_id and lower(btrim(title))=lower(btrim(item_name))) then
        raise exception 'Update would collide with an existing Item title' using errcode='PT409';
      end if;
      update public.work_board_items
         set title=item_name,updated_by=actor,updated_at=clock_timestamp()
       where id=item_id;
      updated_items := updated_items+1;
    else
      select coalesce(max(position),-1)+1 into position_new from public.work_board_items
        where board_id=p_board_id and group_id=target_group and archived_at is null;
      insert into public.work_board_items(board_id,group_id,title,position,created_by,updated_by)
      values(p_board_id,target_group,item_name,position_new,actor,actor)
      returning id into item_id;
      created_items := created_items+1;
    end if;
    -- Empty imported cells preserve existing values on update (non-destructive).
    for mapping in select value from jsonb_array_elements(mappings) loop
      source_name := mapping->>'source';
      if mapping->>'action' not in ('existing','create') then continue; end if;
      mapped_value := row_values->source_name;
      if mapped_value is null or mapped_value='null'::jsonb then continue; end if;
      source_column_id := (columns_by_source->>source_name)::uuid;
      perform public.wm_set_board_cell(item_id,source_column_id,mapped_value);
    end loop;
  end loop;

  update public.work_boards set updated_at=clock_timestamp(),updated_by=actor where id=p_board_id;
  perform public.work_board_log(p_board_id,'items.imported.wizard','Wizard import committed','board',p_board_id::text,
    jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'columns_created',created_columns,'groups_created',created_groups));
  return jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'rejected',0,
    'affected',created_items+updated_items,'columnsCreated',created_columns,'groupsCreated',created_groups);
end $function$;
CREATE OR REPLACE FUNCTION public.wm_set_board_status_labels(p_column_id uuid, p_labels jsonb, p_default_label_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.work_board_columns%rowtype; cfg jsonb; default_id text; cleared bigint:=0;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if c.data_type<>'status' then raise exception 'This column is not a Status column'; end if;
  cfg:=public.work_board_normalize_column_config('status',jsonb_build_object('labels',coalesce(p_labels,'[]'::jsonb),'default_label_id',p_default_label_id));
  default_id:=cfg->>'default_label_id';
  if c.system_key='status' then
    update public.work_board_items i set status=null,updated_by=auth.uid(),updated_at=now()
      where i.board_id=c.board_id and i.status is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=i.status);
    get diagnostics cleared = row_count;
  else
    delete from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=(v.value#>>'{}'));
    get diagnostics cleared = row_count;
  end if;
  update public.work_board_columns set config=cfg,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.status_labels_updated','Status labels updated','column',c.id::text,jsonb_build_object('label_count',jsonb_array_length(cfg->'labels'),'default_label_id',default_id,'cleared_values',cleared));
  return cfg;
end $function$;
