-- TradeLink production activation inventory: strictly read-only SELECT.
-- Run only in existing WatchdogWorkspace. No role, session, or data changes.
WITH current_status AS (
 SELECT
  clock_timestamp() AS at_utc,
  EXISTS(SELECT 1 FROM public.work_boards b
   WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
    AND b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
   AS board_found,
  (SELECT count(*) FROM public.tradelink_documents d
   WHERE d.board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)
   AS documents,
  (SELECT count(*) FROM public.tradelink_documents d
   WHERE d.board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
    AND (d.workspace_id IS DISTINCT FROM
     '00000000-0000-4000-8000-000000000001'::uuid
     OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
       WHERE i.id=d.board_item_id AND i.board_id=d.board_id
         AND i.title=d.document_number)))
   AS invalid_board_projections,
  (SELECT count(*) FROM public.tradelink_document_events e
   JOIN public.tradelink_documents d ON d.id=e.document_id
   WHERE d.board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)
   AS audit_events,
  EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='public.tradelink_document_events'::regclass
   AND t.tgname='tl03_events_append_only' AND NOT t.tgisinternal)
   AS immutable_audit,
  to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)')
   IS NOT NULL AS commit_rpc,
  to_regprocedure('public.tl03_document_read(uuid,uuid)')
   IS NOT NULL AS read_rpc,
  to_regprocedure('public.tl03_documents_list(uuid,integer)')
   IS NOT NULL AS list_rpc,
  to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)')
   IS NOT NULL AS search_rpc,
  to_regprocedure('public.tl03_document_submit(uuid,uuid,bigint)')
   IS NOT NULL AS submit_rpc,
  to_regprocedure('public.tl03_document_review(uuid,uuid,bigint,text,text)')
   IS NOT NULL AS review_rpc,
  to_regprocedure('public.tl03_document_history(uuid,uuid,integer)')
   IS NOT NULL AS history_rpc,
  to_regprocedure('public.tl03_document_decide(uuid,uuid,bigint,text,text)')
   IS NOT NULL AS decide_rpc,
  to_regprocedure('public.tl03_document_operate(uuid,uuid,bigint,text,text)')
   IS NOT NULL AS operate_rpc,
  to_regprocedure('public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)')
   IS NOT NULL AS prepare_rpc,
  to_regprocedure('public.tl03_attachment_finish(uuid,uuid,bigint,text)')
   IS NOT NULL AS finish_rpc,
  to_regprocedure('public.tl03_attachment_list(uuid,integer)')
   IS NOT NULL AS attachment_list_rpc,
  to_regprocedure('public.tl03_attachment_remove(uuid,uuid,bigint,text)')
   IS NOT NULL AS remove_rpc,
  to_regclass('private.tl03_attachments') IS NOT NULL AS attachment_table,
  EXISTS(SELECT 1 FROM storage.buckets b
   WHERE b.id='tradelink-attachments' AND b.public=false
    AND b.file_size_limit=20971520) AS bucket_private,
  (SELECT count(*) FROM pg_catalog.pg_policies p
   WHERE p.schemaname='storage' AND p.tablename='objects'
     AND p.policyname LIKE 'tl03 attachment %') AS storage_policies,
  EXISTS(SELECT 1 FROM pg_catalog.pg_policies p
   WHERE p.schemaname='storage' AND p.tablename='objects'
     AND p.policyname='tl03 attachment signed read' AND p.cmd='SELECT'
     AND p.qual LIKE '%allow_any_operation%'
     AND p.qual LIKE '%get_authenticated%') AS operation_guard
)
SELECT jsonb_build_object(
 'checkedAtUtc',at_utc,'canonicalBoard',board_found,
 'existingDocuments',documents,'immutableEvents',audit_events,
 'invalidBoardProjections',invalid_board_projections,
 'auditTrigger',immutable_audit,
 'baseDraftReady',commit_rpc AND read_rpc AND list_rpc,
 'searchReady',search_rpc,'submitReady',submit_rpc,
 'reviewReady',review_rpc AND history_rpc,
 'decisionReady',decide_rpc,'operationalReady',operate_rpc,
 'privateAttachmentsReady',
  prepare_rpc AND finish_rpc AND attachment_list_rpc AND remove_rpc
  AND attachment_table AND bucket_private AND storage_policies=2
  AND operation_guard,
 'backendComplete', search_rpc AND submit_rpc AND review_rpc AND
  history_rpc AND decide_rpc AND operate_rpc AND prepare_rpc AND
  finish_rpc AND attachment_list_rpc AND remove_rpc
) AS tradelink_readonly_activation_inventory FROM current_status;
