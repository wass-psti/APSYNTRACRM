-- Read-only inspector. Run only on an explicitly authorized target.
-- This script makes no schema, data, role, RLS, grant, or flag changes.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SELECT pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
 'candidate_pdf_stage_rpc_installed',
  to_regprocedure('public.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)') IS NOT NULL,
 'candidate_stage_read_rpc_installed',
  to_regprocedure('public.tl03_pdf_approval_stages(uuid,uuid)') IS NOT NULL,
 'candidate_approver_guard_installed',
  to_regprocedure('private.tl03_can_pdf_approve(uuid)') IS NOT NULL,
 'signed_session_guard_installed',
  to_regprocedure('private.wm_board_config_session_active()') IS NOT NULL,
 'document_table_present',to_regclass('public.tradelink_documents') IS NOT NULL,
 'board_table_present',to_regclass('public.work_board_items') IS NOT NULL,
 'pdf_approval_events_table_present',
  to_regclass('private.tradelink_pdf_approval_events') IS NOT NULL,
 'private_approval_dml_granted_to_authenticated',
  CASE WHEN to_regclass('private.tradelink_pdf_approval_events') IS NULL THEN NULL
    ELSE has_table_privilege('authenticated','private.tradelink_pdf_approval_events',
      'INSERT,UPDATE,DELETE') END
)) AS pdf04_readonly_inventory;
ROLLBACK;
