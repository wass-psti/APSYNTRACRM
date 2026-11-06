-- CP-BOARD-COL-DELETE / Phase A — read-only dark-launch verification.
-- Run immediately after separately authorized candidate installation.
-- This performs no mutations, mock login, backups or schema changes.
-- If any invariant fails, the DO block raises and psql CI fails.
DO $phase_a_postinstall$
DECLARE
  tbl text;
  fn text;
  act_count integer;
  flags_off boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'private.wm_recoverable_column_activation',
    'private.wm_recoverable_deleted_columns',
    'private.wm_recoverable_deleted_cells'
  ] LOOP
    IF to_regclass(tbl) IS NULL THEN
      RAISE EXCEPTION 'PHASE_A_POSTINSTALL_MISSING_TABLE: %',tbl;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass(tbl)) THEN
      RAISE EXCEPTION 'PHASE_A_POSTINSTALL_RLS_DISABLED: %',tbl;
    END IF;
    IF coalesce(has_table_privilege('anon',to_regclass(tbl),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false)
       OR coalesce(has_table_privilege('authenticated',to_regclass(tbl),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) THEN
      RAISE EXCEPTION 'PHASE_A_POSTINSTALL_PRIVATE_TABLE_EXPOSED: %',tbl;
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)',
    'public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)',
    'public.wm_list_recoverable_board_columns(uuid)'
  ] LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE EXCEPTION 'PHASE_A_POSTINSTALL_MISSING_RPC: %',fn;
    END IF;
    IF NOT has_function_privilege('authenticated',to_regprocedure(fn),'EXECUTE')
       OR coalesce(has_function_privilege('anon',to_regprocedure(fn),'EXECUTE'),false)
       OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=to_regprocedure(fn))
       OR NOT EXISTS(
         SELECT 1 FROM pg_proc p
         WHERE p.oid=to_regprocedure(fn)
           AND 'search_path=""'=ANY(p.proconfig)
       ) THEN
      RAISE EXCEPTION 'PHASE_A_POSTINSTALL_RPC_GRANT_OR_SECURITY_DRIFT: %',fn;
    END IF;
  END LOOP;

  SELECT count(*),coalesce(bool_and(
    id IS TRUE AND delete_enabled IS FALSE AND restore_enabled IS FALSE),false)
  INTO act_count,flags_off
  FROM private.wm_recoverable_column_activation;
  IF act_count<>1 OR NOT flags_off THEN
    RAISE EXCEPTION 'PHASE_A_POSTINSTALL_ACTIVATION_NOT_DEFAULT_OFF';
  END IF;
  IF EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_columns)
     OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_cells) THEN
    RAISE EXCEPTION 'PHASE_A_POSTINSTALL_ARCHIVE_TABLES_NOT_EMPTY';
  END IF;
  IF md5(pg_get_functiondef(
    'public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)'::regprocedure))
      <>'7e5ae389363acffa093ad3291314cf2a'
    OR md5(pg_get_functiondef(
      'private.wm_board_config_session_active()'::regprocedure))
      <>'a2284885128169732cb646fe03adcd83'
    OR md5(pg_get_functiondef(
      'private.wm_board_is_protected(uuid)'::regprocedure))
      <>'3e82cd9d78fa7699e5e65f985bd4afa9' THEN
    RAISE EXCEPTION 'PHASE_A_POSTINSTALL_ORIGINAL_GUARD_FINGERPRINT_DRIFT';
  END IF;
  RAISE NOTICE 'PHASE_A_POSTINSTALL_DEFAULT_OFF_RLS_GRANTS_AND_SOURCE_VERIFIED';
END $phase_a_postinstall$;

SELECT 'PHASE_A_POSTINSTALL_DEFAULT_OFF_RLS_GRANTS_AND_SOURCE_VERIFIED' AS status;
