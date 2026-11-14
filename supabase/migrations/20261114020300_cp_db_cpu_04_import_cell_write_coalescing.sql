-- CP-DB-CPU-04: avoid touching the parent board once per imported cell.
-- The outer signed import RPC validates board/session authorization, serializes
-- the import, and updates the parent board once after all cells are committed.
-- Keep per-cell validation and audit events; omit only the redundant parent touch.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION private.wm_import_set_board_cell(
  p_board_id uuid,
  p_item_id uuid,
  p_column_id uuid,
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  i public.work_board_items%ROWTYPE;
  c public.work_board_columns%ROWTYPE;
  v jsonb;
  t text;
  u uuid;
  d date;
BEGIN
  -- This helper is internal to the signed SECURITY DEFINER import RPC.
  -- The parent has already verified the active signed session and board edit
  -- permission and holds the import's board/item/value locks.
  SELECT *
    INTO i
    FROM public.work_board_items
   WHERE id = p_item_id
     AND board_id = p_board_id;

  IF i.id IS NULL THEN
    RAISE EXCEPTION 'Board edit access denied' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO c
    FROM public.work_board_columns
   WHERE id = p_column_id
     AND board_id = p_board_id;

  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Column does not belong to this board';
  END IF;

  v := public.work_board_validate_column_value(p_board_id, c.id, p_value);

  IF c.system_key IS NOT NULL THEN
    t := CASE WHEN v IS NULL THEN NULL ELSE v #>> '{}' END;
    CASE c.system_key
      WHEN 'title' THEN
        IF t IS NULL OR pg_catalog.char_length(t) NOT BETWEEN 1 AND 240 THEN
          RAISE EXCEPTION 'Item name must contain 1-240 characters';
        END IF;
        UPDATE public.work_board_items
           SET title = t, updated_by = auth.uid(), updated_at = now()
         WHERE id = i.id;
      WHEN 'status' THEN
        UPDATE public.work_board_items
           SET status = t, updated_by = auth.uid(), updated_at = now()
         WHERE id = i.id;
      WHEN 'assignee' THEN
        u := CASE WHEN t IS NULL THEN NULL ELSE t::uuid END;
        UPDATE public.work_board_items
           SET assignee_id = u, updated_by = auth.uid(), updated_at = now()
         WHERE id = i.id;
      WHEN 'due_date' THEN
        d := CASE WHEN t IS NULL THEN NULL ELSE t::date END;
        UPDATE public.work_board_items
           SET due_date = d, updated_by = auth.uid(), updated_at = now()
         WHERE id = i.id;
      WHEN 'notes' THEN
        UPDATE public.work_board_items
           SET notes = coalesce(t, ''), updated_by = auth.uid(), updated_at = now()
         WHERE id = i.id;
    END CASE;
  ELSE
    IF v IS NULL THEN
      DELETE FROM public.work_board_item_values
       WHERE item_id = i.id
         AND column_id = c.id;
    ELSE
      INSERT INTO public.work_board_item_values(
        item_id, column_id, value, updated_by, updated_at
      )
      VALUES (i.id, c.id, v, auth.uid(), now())
      ON CONFLICT (item_id, column_id)
      DO UPDATE SET
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
    END IF;
  END IF;

  -- Preserve the original per-cell activity/audit event.
  -- The import RPC performs one authoritative parent-board timestamp update
  -- and one import-summary event after the batch has completed.
  PERFORM public.work_board_log(
    i.board_id,
    'item.cell_updated',
    'Item column updated',
    'item',
    i.id::text,
    pg_catalog.jsonb_build_object(
      'column_id', c.id,
      'column_name', c.name,
      'column_key', c.column_key
    )
  );
END
$function$;

-- Prevent direct client invocation of the internal helper. The existing
-- import function runs as postgres and retains its existing authenticated ACL.
REVOKE ALL ON FUNCTION private.wm_import_set_board_cell(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  target oid := pg_catalog.to_regprocedure(
    'public.wm_import_board_wizard_extended_atomic(uuid,timestamp with time zone,jsonb)'
  );
  definition text;
  needle constant text :=
    'perform public.wm_set_board_cell(v_import_item_id,source_column_id,mapped_value);';
  replacement constant text :=
    'perform private.wm_import_set_board_cell(p_board_id,v_import_item_id,source_column_id,mapped_value);';
  occurrences integer;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Expected extended board import RPC is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  occurrences := (
    pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, ''))
  ) / pg_catalog.length(needle);

  IF occurrences <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one cell-writer call in extended import RPC; found %',
      occurrences;
  END IF;

  EXECUTE pg_catalog.replace(definition, needle, replacement);
END
$migration$;
