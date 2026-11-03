-- CP-BOARD-CONFIG01 v2 COMPENSATING ROLLBACK — STAGED, NOT FOR PRODUCTION.
-- Fail closed and preserve all data. This intentionally does NOT restore weaker
-- editor-executable legacy column-writer permissions or discard persisted settings.
-- It disables only the new schema/settings mutation RPCs, keeps signed read
-- access for compatibility, and retains the hardened indirect writers.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.wm_board_ui_settings') IS NULL OR
  to_regprocedure('public.wm_board_ui_read(uuid)') IS NULL OR
  to_regprocedure('public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)') IS NULL OR
  to_regprocedure('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NULL OR
  to_regprocedure('private.wm_board_config_session_active()') IS NULL THEN
  RAISE EXCEPTION 'Expected board configuration v2 objects absent; rollback aborted';
 END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_board_schema_mutate(
 uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
-- Explicitly keep the legacy column writers closed after recovery.
REVOKE ALL ON FUNCTION public.wm_add_board_column(uuid,text,text,jsonb),
 public.wm_add_board_column_at(uuid,text,text,jsonb,integer),
 public.wm_change_board_column_type(uuid,text,jsonb,boolean),
 public.wm_delete_board_column(uuid),public.wm_duplicate_board_column(uuid,boolean),
 public.wm_move_board_column(uuid,integer),
 public.wm_update_board_column(uuid,text,jsonb,boolean)
 FROM PUBLIC,anon,authenticated;
DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
  'public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)','EXECUTE') OR
  has_function_privilege('authenticated',
  'public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)','EXECUTE') OR
  has_function_privilege('authenticated','public.wm_delete_board_column(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Fail-closed recovery did not retire all new writers'; END IF;
 IF NOT has_function_privilege('authenticated','public.wm_board_ui_read(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Settings-read compatibility unexpectedly revoked'; END IF;
END $verify$;
COMMIT;
