-- CP-TL-03A post-activation READ-ONLY assertions.
-- Run only after independently approved migration. It never creates documents.
\set ON_ERROR_STOP on
DO $verify$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL OR
    to_regclass('public.tradelink_document_events') IS NULL OR
    to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL OR
    to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL OR
    to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL THEN
  RAISE EXCEPTION 'CP-TL-03A migration not present'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
   WHERE n.nspname='public' AND c.relname IN('tradelink_documents','tradelink_document_events')
     AND c.relrowsecurity IS NOT TRUE) THEN
  RAISE EXCEPTION 'TradeLink domain table without RLS'; END IF;
 IF has_table_privilege('anon','public.tradelink_documents','SELECT')
   OR has_table_privilege('anon','public.tradelink_document_events','SELECT')
   OR has_table_privilege('authenticated','public.tradelink_documents','INSERT')
   OR has_table_privilege('authenticated','public.tradelink_documents','UPDATE')
   OR has_table_privilege('authenticated','public.tradelink_documents','DELETE')
   OR has_table_privilege('authenticated','public.tradelink_document_events','INSERT')
   OR has_table_privilege('authenticated','public.tradelink_document_events','UPDATE')
   OR has_table_privilege('authenticated','public.tradelink_document_events','DELETE')
   OR has_function_privilege('anon',
      'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'TradeLink direct table or anonymous RPC grant too broad'; END IF;
 IF NOT has_function_privilege('authenticated',
     'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
   OR NOT has_function_privilege('authenticated',
     'public.tl03_document_read(uuid,uuid)','EXECUTE')
   OR NOT has_function_privilege('authenticated',
     'public.tl03_documents_list(uuid,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Signed TradeLink RPC grants missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.tradelink_document_events'::regclass
     AND tgname='tl03_events_append_only' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Immutable audit trigger missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.tradelink_documents d
    WHERE d.board_id<>board OR d.workspace_id<>(SELECT workspace_id FROM public.work_boards WHERE id=board)
      OR d.workflow_state<>'draft' OR
      NOT EXISTS(SELECT 1 FROM public.work_board_items i
       WHERE i.id=d.board_item_id AND i.board_id=board AND i.title=d.document_number)) THEN
  RAISE EXCEPTION 'Document/board projection does not reconcile'; END IF;
 RAISE NOTICE 'CP-TL-03A RLS/grant/board/audit structural checks PASS; signed mutation checks still required';
END $verify$;
