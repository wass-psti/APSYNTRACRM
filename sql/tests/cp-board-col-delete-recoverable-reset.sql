-- Disposable reset of staged recovery functions before legacy config rollback.
-- NEVER run against production; verifies no new grants or archives survive.
\set ON_ERROR_STOP on
DO $pre$ BEGIN
 IF current_database()<>'postgres'
 THEN RAISE EXCEPTION 'Reset only in disposable postgres' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>0
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>0
 THEN RAISE EXCEPTION 'Unrecovered deletion snapshot would be destroyed' USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
DROP FUNCTION public.wm_list_recoverable_board_columns(uuid);
DROP FUNCTION public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz);
DROP FUNCTION public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text);
DROP TABLE private.wm_recoverable_deleted_cells;
DROP TABLE private.wm_recoverable_deleted_columns;
COMMIT;
DO $post$ BEGIN
 IF to_regprocedure('public.wm_list_recoverable_board_columns(uuid)') IS NOT NULL
 OR to_regprocedure('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)') IS NOT NULL
 OR to_regclass('private.wm_recoverable_deleted_columns') IS NOT NULL
 THEN RAISE EXCEPTION 'Recovery stage did not cleanly reset'; END IF;
 RAISE NOTICE 'CP-BOARD-COL-DELETE disposable stage reset PASS';
END $post$;
