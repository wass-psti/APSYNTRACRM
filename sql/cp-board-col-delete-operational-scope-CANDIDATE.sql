-- CP-BOARD-COL-RECOVERABLE-ACTIVATION (CANDIDATE ONLY)
-- CRITICAL: Do not apply on production without separate explicit approval,
-- verified backup/rehearsal, and a controlled write window.
-- Execute inside an externally managed single transaction. This file has
-- no BEGIN or COMMIT so disposable CI can ROLLBACK all changes.
-- This phase removes the EXPIRED, QA-ONLY additional scope. The existing
-- signed-session, workspace, manage, CAS, protected-column, snapshot and
-- audit checks in the three original RPCs are preserved byte-for-byte.
-- The private QA scope table and ALL historical recovery snapshots remain intact.
DO $pre$
BEGIN
 IF to_regclass('private.wm_recoverable_column_qa_scope') IS NULL
 OR to_regclass('private.wm_recoverable_column_activation') IS NULL
 OR (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 OR (SELECT delete_enabled OR restore_enabled FROM private.wm_recoverable_column_activation WHERE id)
 OR (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)<>0
 OR md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))<>'c9306ac46991b67bbfc1817cf197b5b5'
 OR md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))<>'d569201323f80d9e5f8e08d7cdeffab5'
 OR md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))<>'51a6f2574597107396e298277111e1c6'
 OR has_table_privilege('authenticated','private.wm_recoverable_deleted_cells','SELECT')
 OR has_table_privilege('anon','private.wm_recoverable_column_activation','UPDATE')
 OR has_function_privilege('anon','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_function_privilege('anon','public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'OPERATIONAL_RECOVERY_PREFLIGHT_FAILED' USING ERRCODE='42501'; END IF;
END $pre$;
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
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'d57812443c72fb768803a207e0e1a6e5' THEN
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
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
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'95f5587cf632de697f5122fba156395f' THEN
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
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
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_patched,v_scope,'');
 IF md5(pg_get_functiondef(to_regprocedure(v_signature)))<>'5bb9cc7f720724470fda43f0760592d1' THEN
  RAISE EXCEPTION 'OPERATIONAL_SCOPE_SOURCE_MISMATCH: %',v_signature USING ERRCODE='42501';
 END IF;

END $reset$;
DO $post$
BEGIN
 IF (SELECT delete_enabled OR restore_enabled FROM private.wm_recoverable_column_activation WHERE id)
 OR (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)<>0
 OR md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))<>'d57812443c72fb768803a207e0e1a6e5'
 OR md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))<>'95f5587cf632de697f5122fba156395f'
 OR md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))<>'5bb9cc7f720724470fda43f0760592d1'
 OR has_function_privilege('anon','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_table_privilege('authenticated','private.wm_recoverable_deleted_cells','SELECT')
 THEN RAISE EXCEPTION 'OPERATIONAL_SCOPE_POSTCHECK_FAILED' USING ERRCODE='42501'; END IF;
 RAISE NOTICE 'OPERATIONAL_SCOPE_READY_DEFAULT_OFF (no cells, snapshots, or flags modified)';
END $post$;
