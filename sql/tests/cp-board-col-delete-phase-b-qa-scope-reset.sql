-- CP-BOARD-COL-DELETE / B1 disposable PostgreSQL only. Not a
-- production rollback: never erase QA approval/audit records from live DB.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'postgres'
 OR to_regclass('private.wm_recoverable_column_qa_scope') IS NULL
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_column_qa_scope)
 OR (SELECT delete_enabled OR restore_enabled FROM private.wm_recoverable_column_activation WHERE id)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_columns)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_cells)
 THEN RAISE EXCEPTION 'Phase B reset requires unactivated empty disposable fixture'
   USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
DO $reset$
DECLARE
 v_signature text;
 v_scope text;
 v_patched text;
BEGIN
 
 v_signature:='public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)';
 v_scope:=$restore_phase_b_delete$
 -- Second independent authorization ceiling: time-limited one-board, one-actor QA.
 PERFORM 1 FROM private.wm_recoverable_column_qa_scope q
 JOIN public.work_boards b ON b.id=q.board_id
 WHERE q.id IS TRUE AND q.board_id=p_board_id
  AND q.actor_id=auth.uid()
  AND q.expires_at>pg_catalog.now()
  AND b.status='active'
  AND b.name LIKE 'CP-BOARD-COL-DELETE QA %'
 FOR SHARE OF q;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'COL_QA_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;$restore_phase_b_delete$;
 v_patched:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_scope,'')))
   <>pg_catalog.length(v_scope) THEN
  RAISE EXCEPTION 'PHASE_B_RESET_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'d57812443c72fb768803a207e0e1a6e5' THEN
  RAISE EXCEPTION 'PHASE_B_RESET_ORIGINAL_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
 END IF;

 v_signature:='public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)';
 v_scope:=$restore_phase_b_restore$
 PERFORM 1 FROM private.wm_recoverable_column_qa_scope q
 JOIN public.work_boards b ON b.id=q.board_id
 WHERE q.id IS TRUE AND q.board_id=p_board_id
  AND q.actor_id=auth.uid()
  AND q.expires_at>pg_catalog.now()
  AND b.status='active'
  AND b.name LIKE 'CP-BOARD-COL-DELETE QA %'
 FOR SHARE OF q;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'COL_QA_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;$restore_phase_b_restore$;
 v_patched:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_scope,'')))
   <>pg_catalog.length(v_scope) THEN
  RAISE EXCEPTION 'PHASE_B_RESET_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'95f5587cf632de697f5122fba156395f' THEN
  RAISE EXCEPTION 'PHASE_B_RESET_ORIGINAL_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
 END IF;

 v_signature:='public.wm_list_recoverable_board_columns(uuid)';
 v_scope:=$restore_phase_b_list$
 IF NOT EXISTS (
  SELECT 1 FROM private.wm_recoverable_column_qa_scope q
  JOIN public.work_boards b ON b.id=q.board_id
  WHERE q.id IS TRUE AND q.board_id=p_board_id
   AND q.actor_id=auth.uid()
   AND q.expires_at>pg_catalog.now()
   AND b.status='active'
   AND b.name LIKE 'CP-BOARD-COL-DELETE QA %'
 ) THEN
  RAISE EXCEPTION 'COL_QA_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;$restore_phase_b_list$;
 v_patched:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_scope,'')))
   <>pg_catalog.length(v_scope) THEN
  RAISE EXCEPTION 'PHASE_B_RESET_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'5bb9cc7f720724470fda43f0760592d1' THEN
  RAISE EXCEPTION 'PHASE_B_RESET_ORIGINAL_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
 END IF;

END $reset$;
DROP TABLE private.wm_recoverable_column_qa_scope;
COMMIT;
DO $post$
BEGIN
 IF to_regclass('private.wm_recoverable_column_qa_scope') IS NOT NULL THEN
  RAISE EXCEPTION 'PHASE_B_RESET_LEFT_SCOPE_TABLE'; END IF;
 RAISE NOTICE 'PHASE_B_DISPOSABLE_FUNCTIONS_AND_SCOPE_RESET_PASS';
END $post$;
