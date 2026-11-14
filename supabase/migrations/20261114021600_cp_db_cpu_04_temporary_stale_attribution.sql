-- TEMPORARY CP-DB-CPU-04 diagnostic. Remove after one attribution sample.
-- Log only salted-by-rotation-free hashes; never emit user IDs, board IDs,
-- JWTs, emails, or request payloads. No table writes or persistent counters.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $migration$
DECLARE
  target oid := pg_catalog.to_regprocedure(
    'public.wm_board_card_mutate(uuid,timestamp with time zone,text,text,text,text)'
  );
  definition text;
  needle constant text :=
    'v_observed_updated_at IS DISTINCT FROM p_expected_updated_at THEN' || E'\n    RAISE EXCEPTION';
  replacement constant text :=
    'v_observed_updated_at IS DISTINCT FROM p_expected_updated_at THEN' || E'\n    RAISE LOG ''CP_DB_CPU_04_STALE_LIFECYCLE actor_hash=% session_hash=% board_hash=% action=%'', pg_catalog.md5(auth.uid()::text), pg_catalog.md5(coalesce(auth.jwt()->>''session_id'','''')), pg_catalog.md5(p_board_id::text), v_action;' || E'\n    RAISE EXCEPTION';
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
    RAISE EXCEPTION 'Expected one preflight stale-revision branch; found %', occurrences;
  END IF;
  EXECUTE pg_catalog.replace(definition, needle, replacement);
END
$migration$;
