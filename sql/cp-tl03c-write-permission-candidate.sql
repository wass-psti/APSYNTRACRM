-- CP-TL-03C Stage B: CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION WITHOUT
-- SEPARATE, EXPLICIT PRODUCTION PERMISSION-CHANGE APPROVAL.
-- Initial CP-TL-03 Stage A creates the schema/read RPCs with write EXECUTE denied.
-- This change only grants access to the narrow authenticated General Manager
-- draft RPC guarded by the signed-session + board manage + module/platform ceiling.
BEGIN;
DO $write_activation_preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regprocedure('private.tl03_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.work_boards b
    WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
      AND b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
      AND b.name='TradeLink' AND b.status='active' AND b.archived_at IS NULL
      AND b.trashed_at IS NULL
      AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%')
  OR (SELECT count(*) FROM public.tradelink_documents)<>0
  OR (SELECT count(*) FROM public.work_board_items
      WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)<>0
  OR has_function_privilege('authenticated',
      'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
      'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL-03C Stage B prereqs, drift, or unexpected prior write activation'
   USING ERRCODE='42501';
 END IF;
END $write_activation_preflight$;

GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
COMMIT;
