-- CP-BIMP-SOURCE-CELL-CHAR-LIMIT-03
-- The original TradeLink export contains a genuine 69,668-character displayed
-- value in tradelink!B28. Raise the m143-v2 extended-text capacity to 131,072
-- characters (128 Ki characters) so the full value persists without truncation.
-- Existing rows are checked before replacing the constraint; the writer's
-- signature, transaction logic, grants and all other validation remain intact.
DO $migration$
DECLARE
  constraint_definition text;
  target_oid oid;
  definition text;
  old_guard constant text := 'char_length(extended_text)>65536';
  new_guard constant text := 'char_length(extended_text)>131072';
  guard_position integer;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid)
    INTO constraint_definition
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public'
    AND t.relname='work_board_import_extended_refs'
    AND c.conname='work_board_import_extended_refs_content_check';

  IF constraint_definition IS NULL
     OR pg_catalog.strpos(constraint_definition,'65536')=0
     OR pg_catalog.strpos(constraint_definition,'131072')>0 THEN
    RAISE EXCEPTION 'Expected the existing 1-65,536 extended-reference content constraint';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_board_import_extended_refs
    WHERE char_length(content)>131072
  ) THEN
    RAISE EXCEPTION 'Existing extended-reference content exceeds the new 131,072-character capacity';
  END IF;

  ALTER TABLE public.work_board_import_extended_refs
    DROP CONSTRAINT work_board_import_extended_refs_content_check;
  ALTER TABLE public.work_board_import_extended_refs
    ADD CONSTRAINT work_board_import_extended_refs_content_check
    CHECK (char_length(content) BETWEEN 1 AND 131072);

  SELECT p.oid INTO target_oid
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='wm_import_board_wizard_extended_atomic'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=
      'p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb';

  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'Expected the existing m143-v2 extended atomic import function';
  END IF;

  definition := pg_catalog.pg_get_functiondef(target_oid);
  guard_position := pg_catalog.strpos(definition,old_guard);
  IF guard_position=0 OR pg_catalog.strpos(
    pg_catalog.substr(definition,guard_position+pg_catalog.length(old_guard)),old_guard
  )>0 THEN
    RAISE EXCEPTION 'Expected exactly one 65,536-character extended-text guard';
  END IF;

  definition := pg_catalog.replace(definition,old_guard,new_guard);
  EXECUTE definition;

  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef(target_oid),new_guard)=0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(target_oid),old_guard)>0 THEN
    RAISE EXCEPTION 'The extended atomic writer did not retain the 131,072-character guard';
  END IF;
END
$migration$;
