-- Remove the temporary hashed stale-revision diagnostic after attribution.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $migration$
DECLARE
  target oid := pg_catalog.to_regprocedure(
    'public.wm_board_card_mutate(uuid,timestamp with time zone,text,text,text,text)'
  );
  definition text;
  needle constant text :=
    'RAISE LOG ''CP_DB_CPU_04_STALE_LIFECYCLE actor_hash=% session_hash=% board_hash=% action=%'', pg_catalog.md5(auth.uid()::text), pg_catalog.md5(coalesce(auth.jwt()->>''session_id'','''')), pg_catalog.md5(p_board_id::text), v_action;';
  occurrences integer;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Expected board lifecycle RPC is missing';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  occurrences := (
    pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, ''))
  ) / pg_catalog.length(needle);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected one temporary attribution statement; found %', occurrences;
  END IF;
  EXECUTE pg_catalog.replace(definition, needle, '');
END
$migration$;
