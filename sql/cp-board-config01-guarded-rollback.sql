-- CP-BOARD-CONFIG01 — STAGED GUARDED ROLLBACK, NOT AUTHORIZED FOR PRODUCTION.
-- Data-preserving guard refuses to drop stored settings. Custom column rows and
-- existing item values are never deleted by rollback. Older editor-accessible
-- mutations are restored: explicitly review this privilege regression.
-- SUPERSEDED, FAIL CLOSED. Use the independently reviewed v2 successor only after separate production approval.
DO $superseded$ BEGIN RAISE EXCEPTION 'CP-BOARD-CONFIG01 v1 rollback retired: do not execute; review v2 artifacts' USING ERRCODE='42501'; END $superseded$;
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NULL OR
    to_regprocedure('public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)') IS NULL OR
    to_regclass('public.wm_board_ui_settings') IS NULL THEN
  RAISE EXCEPTION 'Expected board-config candidate absent; rollback stopped';
 END IF;
 IF EXISTS(SELECT 1 FROM public.wm_board_ui_settings) THEN
  RAISE EXCEPTION 'Saved board settings exist; export and independently approve data-preserving rollback first';
 END IF;
END $guard$;
DROP FUNCTION public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean);
DROP FUNCTION public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb);
DROP FUNCTION public.wm_board_ui_read(uuid);
DROP TABLE public.wm_board_ui_settings;
GRANT EXECUTE ON FUNCTION public.wm_add_board_column(uuid,text,text,jsonb),
 public.wm_add_board_column_at(uuid,text,text,jsonb,integer),
 public.wm_change_board_column_type(uuid,text,jsonb,boolean),
 public.wm_delete_board_column(uuid),
 public.wm_duplicate_board_column(uuid,boolean),
 public.wm_move_board_column(uuid,integer),
 public.wm_update_board_column(uuid,text,jsonb,boolean) TO authenticated;
DO $verify$
BEGIN
 IF to_regclass('public.wm_board_ui_settings') IS NOT NULL OR
    to_regprocedure('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NOT NULL THEN
  RAISE EXCEPTION 'Rollback incomplete';
 END IF;
 IF NOT has_function_privilege('authenticated','public.wm_delete_board_column(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.wm_delete_board_column(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Legacy grants mismatch';
 END IF;
END $verify$;
COMMIT;
