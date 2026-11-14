-- CP-DB-CPU-04: stale board lifecycle revisions are expected conflicts, not
-- database failures. Return an HTTP 409 without aborting the PostgREST tx.
-- This preserves the API status/message while avoiding rollback + error-log
-- work for repeated stale requests. No authorization or row-lock checks move.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $migration$
DECLARE
  target oid := pg_catalog.to_regprocedure(
    'public.wm_board_card_mutate(uuid,timestamp with time zone,text,text,text,text)'
  );
  definition text;
  needle constant text :=
    E'RAISE EXCEPTION ''Board changed; refresh before editing''\n      USING ERRCODE = ''40001'';';
  replacement constant text :=
    E'PERFORM pg_catalog.set_config(''response.status'', ''409'', true);\n'
    || E'    RETURN pg_catalog.jsonb_build_object(\n'
    || E'      ''code'', ''BOARD_REVISION_STALE'',\n'
    || E'      ''message'', ''Board changed; refresh before editing'',\n'
    || E'      ''boardId'', p_board_id::text,\n'
    || E'      ''action'', v_action\n'
    || E'    );';
  occurrences integer;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Expected signed board lifecycle RPC is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  occurrences := (
    pg_catalog.length(definition)
    - pg_catalog.length(pg_catalog.replace(definition, needle, ''))
  ) / pg_catalog.length(needle);

  IF occurrences <> 2 THEN
    RAISE EXCEPTION
      'Expected two stale-revision branches in board lifecycle RPC; found %',
      occurrences;
  END IF;

  EXECUTE pg_catalog.replace(definition, needle, replacement);
END
$migration$;
