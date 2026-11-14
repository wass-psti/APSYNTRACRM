-- CP-DB-CPU-05: reuse importer-validated item/column metadata for each cell.
-- The signed parent import RPC already locks the board's rows and resolves
-- every destination column. Re-reading item + column rows for every mapped
-- cell is redundant; keep the authoritative value validator and all writes.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION private.wm_import_set_board_cell_cached(
  p_board_id uuid,
  p_item_id uuid,
  p_column_id uuid,
  p_value jsonb,
  p_system_key text,
  p_column_name text,
  p_column_key text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v jsonb;
  t text;
  u uuid;
  d date;
BEGIN
  -- This helper is callable only by the signed SECURITY DEFINER importer.
  -- The parent has already resolved the item and column from this board and
  -- holds the relevant locks. The public validator still verifies the column
  -- belongs to this board and applies the complete authoritative type rules.
  IF p_board_id IS NULL OR p_item_id IS NULL OR p_column_id IS NULL
     OR p_column_name IS NULL THEN
    RAISE EXCEPTION 'Import cell metadata is incomplete' USING ERRCODE = '22023';
  END IF;

  v := public.work_board_validate_column_value(p_board_id, p_column_id, p_value);

  IF p_system_key IS NOT NULL THEN
    t := CASE WHEN v IS NULL THEN NULL ELSE v #>> '{}' END;
    CASE p_system_key
      WHEN 'title' THEN
        IF t IS NULL OR pg_catalog.char_length(t) NOT BETWEEN 1 AND 240 THEN
          RAISE EXCEPTION 'Item name must contain 1-240 characters';
        END IF;
        UPDATE public.work_board_items
           SET title = t, updated_by = auth.uid(), updated_at = pg_catalog.now()
         WHERE id = p_item_id AND board_id = p_board_id;
      WHEN 'status' THEN
        UPDATE public.work_board_items
           SET status = t, updated_by = auth.uid(), updated_at = pg_catalog.now()
         WHERE id = p_item_id AND board_id = p_board_id;
      WHEN 'assignee' THEN
        u := CASE WHEN t IS NULL THEN NULL ELSE t::uuid END;
        UPDATE public.work_board_items
           SET assignee_id = u, updated_by = auth.uid(), updated_at = pg_catalog.now()
         WHERE id = p_item_id AND board_id = p_board_id;
      WHEN 'due_date' THEN
        d := CASE WHEN t IS NULL THEN NULL ELSE t::date END;
        UPDATE public.work_board_items
           SET due_date = d, updated_by = auth.uid(), updated_at = pg_catalog.now()
         WHERE id = p_item_id AND board_id = p_board_id;
      WHEN 'notes' THEN
        UPDATE public.work_board_items
           SET notes = coalesce(t, ''), updated_by = auth.uid(), updated_at = pg_catalog.now()
         WHERE id = p_item_id AND board_id = p_board_id;
      ELSE
        RAISE EXCEPTION 'Unsupported system column for import';
    END CASE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Imported Item no longer belongs to this Board' USING ERRCODE = '23503';
    END IF;
  ELSE
    IF v IS NULL THEN
      DELETE FROM public.work_board_item_values
       WHERE item_id = p_item_id AND column_id = p_column_id;
    ELSE
      INSERT INTO public.work_board_item_values(
        item_id, column_id, value, updated_by, updated_at
      )
      VALUES (p_item_id, p_column_id, v, auth.uid(), pg_catalog.now())
      ON CONFLICT (item_id, column_id)
      DO UPDATE SET
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = pg_catalog.now();
    END IF;
  END IF;

  -- Keep the original per-cell audit event; only redundant reads are removed.
  PERFORM public.work_board_log(
    p_board_id,
    'item.cell_updated',
    'Item column updated',
    'item',
    p_item_id::text,
    pg_catalog.jsonb_build_object(
      'column_id', p_column_id,
      'column_name', p_column_name,
      'column_key', p_column_key
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION private.wm_import_set_board_cell_cached(
  uuid, uuid, uuid, jsonb, text, text, text
) FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  target oid := pg_catalog.to_regprocedure(
    'public.wm_import_board_wizard_extended_atomic(uuid,timestamp with time zone,jsonb)'
  );
  definition text;
  needle text;
  replacement text;
  occurrences integer;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Expected signed extended board import RPC is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;

  needle := '  columns_by_source jsonb := ''{}''::jsonb;';
  replacement := needle || E'\n'
    || '  column_meta_by_source jsonb := ''{}''::jsonb;' || E'\n'
    || '  column_meta jsonb;' || E'\n'
    || '  source_column_system_key text;' || E'\n'
    || '  source_column_key text;';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import column metadata declaration anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := E'    created_column := public.wm_add_board_column(p_board_id,new_name,new_type,''{}''::jsonb);\n'
    || '    columns_by_source := columns_by_source || jsonb_build_object(source_name,created_column::text);';
  replacement := E'    created_column := public.wm_add_board_column(p_board_id,new_name,new_type,''{}''::jsonb);\n'
    || E'    select c.name, c.data_type, c.system_key, c.column_key\n'
    || E'      into col_name, source_column_type, source_column_system_key, source_column_key\n'
    || E'      from public.work_board_columns c\n'
    || E'     where c.id=created_column and c.board_id=p_board_id;\n'
    || E'    if col_name is null then\n'
    || E'      raise exception ''Created import column could not be re-read'' using errcode = ''23503'';\n'
    || E'    end if;\n'
    || E'    columns_by_source := columns_by_source || jsonb_build_object(source_name,created_column::text);\n'
    || E'    column_meta_by_source := column_meta_by_source || jsonb_build_object(source_name,\n'
    || E'      jsonb_build_object(''id'',created_column,''name'',col_name,''data_type'',source_column_type,\n'
    || E'        ''system_key'',source_column_system_key,''column_key'',source_column_key));';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import new-column metadata anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := E'      select name, data_type into col_name, source_column_type\n'
    || E'        from public.work_board_columns where id=source_column_id and board_id=p_board_id and system_key is distinct from ''title'';';
  replacement := E'      select c.name, c.data_type, c.system_key, c.column_key\n'
    || E'        into col_name, source_column_type, source_column_system_key, source_column_key\n'
    || E'        from public.work_board_columns c\n'
    || E'       where c.id=source_column_id and c.board_id=p_board_id and c.system_key is distinct from ''title'';';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import existing-column lookup anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := '      columns_by_source := columns_by_source || jsonb_build_object(source_name,source_column_id::text);';
  replacement := needle || E'\n'
    || '      column_meta_by_source := column_meta_by_source || jsonb_build_object(source_name,' || E'\n'
    || '        jsonb_build_object(''id'',source_column_id,''name'',col_name,''data_type'',source_column_type,' || E'\n'
    || '          ''system_key'',source_column_system_key,''column_key'',source_column_key));';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import existing-column metadata anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := '      source_column_id := (columns_by_source->>source_name)::uuid;';
  replacement := needle || E'\n'
    || '      column_meta := column_meta_by_source->source_name;' || E'\n'
    || '      if coalesce(jsonb_typeof(column_meta),'''') <> ''object''' || E'\n'
    || '         or column_meta->>''id'' is distinct from source_column_id::text' || E'\n'
    || '         or column_meta->>''name'' is null' || E'\n'
    || '         or column_meta->>''data_type'' is null then' || E'\n'
    || '        raise exception ''Import destination column metadata is unavailable'' using errcode = ''23503'';' || E'\n'
    || '      end if;';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import per-cell metadata anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := E'        select c.data_type into extended_type from public.work_board_columns c\n'
    || E'          where c.id=source_column_id and c.board_id=p_board_id\n'
    || E'            and c.system_key is null;';
  replacement := E'        if column_meta->>''system_key'' is not null then\n'
    || E'          raise exception ''Extended references require a custom column'' using errcode = ''22023'';\n'
    || E'        end if;\n'
    || E'        extended_type := column_meta->>''data_type'';';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one extended-reference column lookup anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  needle := 'perform private.wm_import_set_board_cell(p_board_id,v_import_item_id,source_column_id,mapped_value);';
  replacement :=
    'perform private.wm_import_set_board_cell_cached(p_board_id,v_import_item_id,source_column_id,mapped_value,'
    || 'column_meta->>''system_key'',column_meta->>''name'',column_meta->>''column_key'');';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one import cell-writer call anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);

  EXECUTE definition;
END
$migration$;
