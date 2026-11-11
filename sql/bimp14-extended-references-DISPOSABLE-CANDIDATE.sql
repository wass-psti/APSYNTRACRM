-- CP-BIMP-14: DISPOSABLE CANDIDATE, NOT DEPLOYED TO PRODUCTION.
-- Retains the existing m143-v1 RPC unchanged and stages an opt-in m143-v2
-- atomic writer for references too long for typed-cell single-value fields.
-- Each extended reference stays inside the same PostgreSQL transaction as
-- the imported item. Direct table access is denied; signed board-scoped read
-- uses the pre-existing session and work_board_access(view) checks.
CREATE TABLE IF NOT EXISTS public.work_board_import_extended_refs (
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.work_board_items(id) ON DELETE CASCADE,
 column_id uuid NOT NULL REFERENCES public.work_board_columns(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 65536),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(item_id,column_id)
);
ALTER TABLE public.work_board_import_extended_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_import_extended_refs FROM PUBLIC,anon,authenticated;
-- Ordinary board edits supersede an imported extended reference. A future
-- normal cell edit cannot leave an old reference shadowing the edited value.
CREATE OR REPLACE FUNCTION public.wm_import_extended_refs_clear_on_cell_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' AS $function$
BEGIN
 DELETE FROM public.work_board_import_extended_refs r
   WHERE r.item_id=NEW.item_id AND r.column_id=NEW.column_id;
 RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS wm_import_extended_refs_cell_override
  ON public.work_board_item_values;
CREATE TRIGGER wm_import_extended_refs_cell_override
AFTER INSERT OR UPDATE OF value ON public.work_board_item_values
FOR EACH ROW EXECUTE FUNCTION public.wm_import_extended_refs_clear_on_cell_write();
REVOKE ALL ON FUNCTION public.wm_import_extended_refs_clear_on_cell_write()
 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.wm_import_extended_refs_read(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
   RAISE EXCEPTION 'Board view access required' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',r.item_id,
  'column_id',r.column_id,'value',to_jsonb(r.content)))
  FROM public.work_board_import_extended_refs r
  JOIN public.work_board_items i ON i.id=r.item_id AND i.board_id=p_board_id
  JOIN public.work_board_columns c ON c.id=r.column_id AND c.board_id=p_board_id
  WHERE r.board_id=p_board_id AND i.archived_at IS NULL), '[]'::jsonb);
END $function$;
CREATE OR REPLACE FUNCTION public.wm_import_board_wizard_extended_atomic(p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb)
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
  extended_text text;
  extended_type text;
  extended_limit integer;
begin
  if actor is null or not private.wm_board_config_session_active() then
    raise exception 'Active signed board session required' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' or p_payload->>'contract' is distinct from 'm143-v2' then
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
  if jsonb_array_length(p_payload->'newColumns')>0 then
    if not private.wm_board_config_session_active()
       or not public.work_board_access(p_board_id,'manage') then
      raise exception 'Board manage permission required for wizard-created columns'
        using errcode='42501';
    end if;
  end if;

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
      if jsonb_typeof(mapped_value)='object' and mapped_value ? '__aps_extended_ref_v1' then
        extended_text := mapped_value->>'__aps_extended_ref_v1';
        select c.data_type into extended_type from public.work_board_columns c
          where c.id=source_column_id and c.board_id=p_board_id
            and c.system_key is null;
        if extended_type not in ('text','long_text','url') or
           jsonb_typeof(mapped_value->'__aps_extended_ref_v1')<>'string' or
           char_length(extended_text)>65536 or char_length(extended_text)<1 then
          raise exception 'Invalid extended reference value or destination type'
            using errcode='22023';
        end if;
        extended_limit:=case extended_type when 'text' then 1000
          when 'url' then 2000 else 5000 end;
        if char_length(extended_text)<=extended_limit then
          raise exception 'Extended reference marker is unnecessary for this value'
            using errcode='22023';
        end if;
        if extended_type='url' and extended_text !~* '^https?://[^[:space:]]+$' then
          raise exception 'Extended URL requires a valid HTTP(S) reference'
            using errcode='22023';
        end if;
        delete from public.work_board_item_values v
          where v.item_id=item_id and v.column_id=source_column_id;
        insert into public.work_board_import_extended_refs(
          board_id,item_id,column_id,content,updated_by)
        values (p_board_id,item_id,source_column_id,extended_text,actor)
        on conflict(item_id,column_id) do update set
          content=excluded.content,updated_by=excluded.updated_by,
          updated_at=clock_timestamp();
      else
        delete from public.work_board_import_extended_refs r
          where r.item_id=item_id and r.column_id=source_column_id;
        perform public.wm_set_board_cell(item_id,source_column_id,mapped_value);
      end if;
    end loop;
  end loop;

  update public.work_boards set updated_at=clock_timestamp(),updated_by=actor where id=p_board_id;
  perform public.work_board_log(p_board_id,'items.imported.wizard','Wizard import committed','board',p_board_id::text,
    jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'columns_created',created_columns,'groups_created',created_groups));
  return jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'rejected',0,
    'affected',created_items+updated_items,'columnsCreated',created_columns,'groupsCreated',created_groups);
end $function$;

REVOKE ALL ON FUNCTION public.wm_import_extended_refs_read(uuid),
 public.wm_import_board_wizard_extended_atomic(uuid,timestamptz,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_import_extended_refs_read(uuid),
 public.wm_import_board_wizard_extended_atomic(uuid,timestamptz,jsonb)
 TO authenticated;
