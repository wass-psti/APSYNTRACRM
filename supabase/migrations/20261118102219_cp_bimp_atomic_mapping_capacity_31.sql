-- CP-BIMP-SOURCE-CELL-CHAR-LIMIT-02: the Item title is stored on
-- work_board_items and is not one of the 30 physical work_board_columns.
-- Permit 1 title mapping + 30 destination-column mappings in both atomic
-- writer contracts. Keep the separate physical-column cap at 30.
-- Replace only the guarded mapping-count predicate/message in the two live
-- atomic functions; preserve their transaction bodies, signatures, grants,
-- CAS checks, row/cell validation, duplicate behavior and persistence logic.
DO $migration$
DECLARE
  target_oid oid;
  definition text;
  old_guard constant text :=
    'if jsonb_array_length(p_payload->''mappings'') not between 1 and 30 then';
  new_guard constant text :=
    'if jsonb_array_length(p_payload->''mappings'') not between 1 and 31 then';
  old_message constant text := 'Wizard mapping count must be 1-30';
  new_message constant text := 'Wizard mapping count must be 1-31';
  guard_position integer;
BEGIN
  FOR target_oid IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'wm_import_board_wizard_atomic',
        'wm_import_board_wizard_extended_atomic'
      )
      AND pg_catalog.pg_get_function_identity_arguments(p.oid)=
        'p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb'
    ORDER BY p.proname
  LOOP
    definition := pg_catalog.pg_get_functiondef(target_oid);
    guard_position := pg_catalog.strpos(definition,old_guard);
    IF guard_position=0 OR pg_catalog.strpos(
      pg_catalog.substr(definition,guard_position+pg_catalog.length(old_guard)),old_guard
    )>0 THEN
      RAISE EXCEPTION 'Expected exactly one 1-30 mapping guard in %',target_oid::regprocedure;
    END IF;
    IF pg_catalog.strpos(definition,old_message)=0 OR
       pg_catalog.strpos(pg_catalog.substr(definition,
         pg_catalog.strpos(definition,old_message)+pg_catalog.length(old_message)),
         old_message)>0 THEN
      RAISE EXCEPTION 'Expected exactly one 1-30 mapping error message in %',target_oid::regprocedure;
    END IF;
    definition := pg_catalog.replace(definition,old_guard,new_guard);
    definition := pg_catalog.replace(definition,old_message,new_message);
    EXECUTE definition;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'wm_import_board_wizard_atomic',
        'wm_import_board_wizard_extended_atomic'
      ) AND pg_catalog.pg_get_function_identity_arguments(p.oid)=
        'p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb')<>2 THEN
    RAISE EXCEPTION 'Both ordinary and extended atomic import functions must exist';
  END IF;
END
$migration$;

