-- CP-BOARD-COL-RECOVERABLE-ACTIVATION: approval-only destructive production gate.
-- DO NOT EXECUTE on production without separate explicit approval and
-- rehearsed backup/restore. No privilege expansion beyond the existing
-- authenticated signed manage RPC contracts. Run only AFTER scope candidate,
-- in the SAME reviewed transaction, with external BEGIN/COMMIT controls.
DO $activate$
DECLARE affected integer;
BEGIN
 IF to_regclass('private.wm_recoverable_column_activation') IS NULL
 OR (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 OR (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)<>0
 OR md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))<>'d57812443c72fb768803a207e0e1a6e5'
 OR md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))<>'95f5587cf632de697f5122fba156395f'
 OR md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))<>'5bb9cc7f720724470fda43f0760592d1'
 THEN RAISE EXCEPTION 'OPERATIONAL_ACTIVATION_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
 UPDATE private.wm_recoverable_column_activation
 SET delete_enabled=true,restore_enabled=true,updated_at=clock_timestamp()
 WHERE id=true AND delete_enabled=false AND restore_enabled=false;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'OPERATIONAL_ACTIVATION_STATE_DRIFT' USING ERRCODE='42501'; END IF;
END $activate$;
DO $confirm$
BEGIN
 IF (SELECT count(*) FROM private.wm_recoverable_column_activation
     WHERE id=true AND delete_enabled=true AND restore_enabled=true)<>1
 OR has_function_privilege('anon','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_table_privilege('authenticated','private.wm_recoverable_deleted_cells','SELECT')
 THEN RAISE EXCEPTION 'OPERATIONAL_ACTIVATION_CONFIRM_FAILED' USING ERRCODE='42501'; END IF;
END $confirm$;
