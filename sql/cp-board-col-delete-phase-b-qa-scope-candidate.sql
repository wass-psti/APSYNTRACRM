-- CP-BOARD-COL-DELETE / B1 — DORMANT, REQUIRES SEPARATE PRODUCTION
-- APPROVAL FOR ALTERING LIVE AUTHORIZATION CONTRACTS. NEVER AUTO-DEPLOY.
-- Exactly one approved existing ordinary QA board and one signed actor can
-- ever pass while the global Phase A activation is separately enabled.
-- No Contacts/production business board is eligible: QA name marker required.
-- Supplied as a PostgreSQL 17 disposable-test candidate and controlled
-- source-fingerprint-locked production migration, not an activation command.
BEGIN;
DO $phase_b_preflight$
BEGIN
 IF to_regclass('private.wm_recoverable_column_qa_scope') IS NOT NULL
 OR to_regclass('private.wm_recoverable_column_activation') IS NULL
 OR (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 OR (SELECT delete_enabled OR restore_enabled FROM private.wm_recoverable_column_activation WHERE id)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_columns)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_cells)
  OR to_regprocedure('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)') IS NULL
 OR md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))<>'d57812443c72fb768803a207e0e1a6e5'
 OR to_regprocedure('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)') IS NULL
 OR md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))<>'95f5587cf632de697f5122fba156395f'
 OR to_regprocedure('public.wm_list_recoverable_board_columns(uuid)') IS NULL
 OR md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))<>'5bb9cc7f720724470fda43f0760592d1'
 THEN RAISE EXCEPTION 'PHASE_B_SOURCE_OR_ACTIVATION_DRIFT' USING ERRCODE='42501';
 END IF;
END $phase_b_preflight$;

-- Empty and disabled on installation. Only database administrators can
-- create or change a scope. It is not exposed via any public RPC.
CREATE TABLE private.wm_recoverable_column_qa_scope(
 id boolean PRIMARY KEY DEFAULT true CHECK(id IS TRUE),
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 expires_at timestamptz NOT NULL,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '60 minutes')
);
ALTER TABLE private.wm_recoverable_column_qa_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wm_recoverable_column_qa_scope FROM PUBLIC,anon,authenticated;

-- Preserve the deployed complete function source, all existing grants and
-- business rules. Only insert one fail-closed scope guard after the existing
-- global activation guard; validate the inverse transformation.
DO $phase_b_patch$
DECLARE
 v_signature text;
 v_original text;
 v_updated text;
 v_anchor text;
 v_scope text;
BEGIN
 
 v_signature:='public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)';
 v_anchor:=$phase_b_anchor_delete$ IF NOT FOUND THEN
  RAISE EXCEPTION 'COL_DELETE_NOT_ACTIVATED' USING ERRCODE='42501';
 END IF;$phase_b_anchor_delete$;
 v_scope:=$phase_b_scope_delete$
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
 END IF;$phase_b_scope_delete$;
 v_original:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_original)-pg_catalog.length(pg_catalog.replace(v_original,v_anchor,'')))
     <>pg_catalog.length(v_anchor) THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_ANCHOR_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_original,v_anchor,v_anchor||v_scope);
 v_updated:=pg_get_functiondef(to_regprocedure(v_signature));
 IF pg_catalog.replace(v_updated,v_scope,'') IS DISTINCT FROM v_original THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_PRESERVATION_FAILED: %',v_signature USING ERRCODE='42501';
 END IF;

 v_signature:='public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)';
 v_anchor:=$phase_b_anchor_restore$ IF NOT FOUND THEN
  RAISE EXCEPTION 'COL_RESTORE_NOT_ACTIVATED' USING ERRCODE='42501';
 END IF;$phase_b_anchor_restore$;
 v_scope:=$phase_b_scope_restore$
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
 END IF;$phase_b_scope_restore$;
 v_original:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_original)-pg_catalog.length(pg_catalog.replace(v_original,v_anchor,'')))
     <>pg_catalog.length(v_anchor) THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_ANCHOR_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_original,v_anchor,v_anchor||v_scope);
 v_updated:=pg_get_functiondef(to_regprocedure(v_signature));
 IF pg_catalog.replace(v_updated,v_scope,'') IS DISTINCT FROM v_original THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_PRESERVATION_FAILED: %',v_signature USING ERRCODE='42501';
 END IF;

 v_signature:='public.wm_list_recoverable_board_columns(uuid)';
 v_anchor:=$phase_b_anchor_list$  RAISE EXCEPTION 'COL_RECOVERY_LIST_NOT_ACTIVATED' USING ERRCODE='42501';
 END IF;$phase_b_anchor_list$;
 v_scope:=$phase_b_scope_list$
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
 END IF;$phase_b_scope_list$;
 v_original:=pg_get_functiondef(to_regprocedure(v_signature));
 IF (pg_catalog.length(v_original)-pg_catalog.length(pg_catalog.replace(v_original,v_anchor,'')))
     <>pg_catalog.length(v_anchor) THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_ANCHOR_DRIFT: %',v_signature USING ERRCODE='42501';
 END IF;
 EXECUTE pg_catalog.replace(v_original,v_anchor,v_anchor||v_scope);
 v_updated:=pg_get_functiondef(to_regprocedure(v_signature));
 IF pg_catalog.replace(v_updated,v_scope,'') IS DISTINCT FROM v_original THEN
  RAISE EXCEPTION 'PHASE_B_SOURCE_PRESERVATION_FAILED: %',v_signature USING ERRCODE='42501';
 END IF;

END $phase_b_patch$;

DO $phase_b_check$
BEGIN
 IF EXISTS(SELECT 1 FROM private.wm_recoverable_column_qa_scope)
 OR (SELECT delete_enabled OR restore_enabled FROM private.wm_recoverable_column_activation WHERE id)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.wm_recoverable_column_qa_scope'::regclass)
 OR has_table_privilege('anon','private.wm_recoverable_column_qa_scope','SELECT')
 OR has_table_privilege('authenticated','private.wm_recoverable_column_qa_scope','SELECT')
 OR NOT has_function_privilege('authenticated','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_function_privilege('anon','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)','EXECUTE')
 OR has_function_privilege('anon','public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.wm_list_recoverable_board_columns(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_list_recoverable_board_columns(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'PHASE_B_DEFAULT_OFF_OR_ACL_INTEGRITY_FAILED' USING ERRCODE='42501';
 END IF;
END $phase_b_check$;
COMMIT;
