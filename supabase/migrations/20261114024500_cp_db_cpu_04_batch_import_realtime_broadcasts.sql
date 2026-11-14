-- CP-DB-CPU-04: bulk imports must not emit one Realtime broadcast per row/cell.
-- Suppression is transaction-local and limited to the two signed import RPCs.
-- Each successful import emits one private board invalidation after its writes.
-- Data writes, per-cell audit events, RLS, roles and permissions are unchanged.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $migration$
DECLARE
  trigger_target oid := pg_catalog.to_regprocedure(
    'public.work_board_realtime_broadcast_change()'
  );
  extended_target oid := pg_catalog.to_regprocedure(
    'public.wm_import_board_wizard_extended_atomic(uuid,timestamp with time zone,jsonb)'
  );
  atomic_target oid := pg_catalog.to_regprocedure(
    'public.wm_import_board_wizard_atomic(uuid,timestamp with time zone,jsonb)'
  );
  definition text;
  needle text;
  replacement text;
  occurrences integer;
BEGIN
  IF trigger_target IS NULL OR extended_target IS NULL OR atomic_target IS NULL THEN
    RAISE EXCEPTION 'Expected board Realtime trigger or import RPC is missing';
  END IF;

  -- Avoid auth lookup and JSON serialization for rows in a suppressed import.
  SELECT pg_catalog.pg_get_functiondef(trigger_target) INTO definition;
  needle := 'actor_id uuid := auth.uid();';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one Realtime trigger actor initializer; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, 'actor_id uuid;');

  needle := E'begin\n  row_data := case when tg_op=''DELETE'' then to_jsonb(old) else to_jsonb(new) end;';
  replacement :=
    E'begin\n'
    || E'  if pg_catalog.current_setting(''apsyntra.realtime_suppress'', true) = ''on'' then\n'
    || E'    if tg_op = ''DELETE'' then return old; end if;\n'
    || E'    return new;\n'
    || E'  end if;\n'
    || E'  actor_id := auth.uid();\n'
    || E'  row_data := case when tg_op=''DELETE'' then to_jsonb(old) else to_jsonb(new) end;';
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one Realtime trigger row-serialization anchor; found %', occurrences;
  END IF;
  EXECUTE pg_catalog.replace(definition, needle, replacement);

  -- Insert transaction-local suppression only after session, board, revision,
  -- and row-lock checks have succeeded, but before group/column/item writes.
  needle := E'  perform 1 from public.work_board_members where board_id=p_board_id for share;\n\n  gp := p_payload->''group'';';
  replacement :=
    E'  perform 1 from public.work_board_members where board_id=p_board_id for share;\n\n'
    || E'  -- Import writes are coalesced into one board invalidation below.\n'
    || E'  perform pg_catalog.set_config(''apsyntra.realtime_suppress'', ''on'', true);\n\n'
    || E'  gp := p_payload->''group'';';

  SELECT pg_catalog.pg_get_functiondef(extended_target) INTO definition;
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one extended-import suppression anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);
  EXECUTE definition;

  SELECT pg_catalog.pg_get_functiondef(atomic_target) INTO definition;
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one atomic-import suppression anchor; found %', occurrences;
  END IF;
  definition := pg_catalog.replace(definition, needle, replacement);
  EXECUTE definition;

  -- A single invalidation is enough: PlatformSync validates the board topic,
  -- then re-reads all visible state through signed RPCs. No row data is sent.
  needle := '  return jsonb_build_object(''created'',created_items,''updated'',updated_items,''skipped'',skipped_items,''rejected'',0,';
  replacement :=
    E'  if created_items + updated_items + created_columns + created_groups > 0 then\n'
    || E'    perform realtime.send(\n'
    || E'      pg_catalog.jsonb_build_object(\n'
    || E'        ''board_id'', p_board_id,\n'
    || E'        ''entity'', ''board'',\n'
    || E'        ''entity_id'', p_board_id::text,\n'
    || E'        ''item_id'', null,\n'
    || E'        ''action'', ''BULK_IMPORT'',\n'
    || E'        ''actor_id'', actor,\n'
    || E'        ''occurred_at'', clock_timestamp(),\n'
    || E'        ''change_count'', created_items + updated_items + created_columns + created_groups\n'
    || E'      ),\n'
    || E'      ''board-change'',\n'
    || E'      ''board:'' || p_board_id::text,\n'
    || E'      true\n'
    || E'    );\n'
    || E'  end if;\n\n'
    || needle;

  SELECT pg_catalog.pg_get_functiondef(extended_target) INTO definition;
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one extended-import return anchor; found %', occurrences;
  END IF;
  EXECUTE pg_catalog.replace(definition, needle, replacement);

  SELECT pg_catalog.pg_get_functiondef(atomic_target) INTO definition;
  occurrences := (pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, '')))
    / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one atomic-import return anchor; found %', occurrences;
  END IF;
  EXECUTE pg_catalog.replace(definition, needle, replacement);
END
$migration$;
