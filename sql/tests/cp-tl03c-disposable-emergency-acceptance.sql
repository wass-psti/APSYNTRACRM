-- Disposable-only CP-TL-03C emergency-disable acceptance after signed CRUD.
-- This fixture expects exactly one disposable document and four revisions.
\set ON_ERROR_STOP on
DO $rollback_accept$
BEGIN
 IF has_function_privilege('authenticated',
     'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
     'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
     'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated',
     'public.tl03_documents_list(uuid,integer)','EXECUTE')
  OR has_table_privilege('authenticated','public.tradelink_documents','SELECT')
  OR has_table_privilege('authenticated','public.tradelink_document_events','SELECT')
  OR has_function_privilege('anon',
     'public.tl03_document_read(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Emergency disable left TradeLink RPC access enabled' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM public.tradelink_documents)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events)<>4
  OR (SELECT count(*) FROM public.work_board_items
      WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)<>1
 THEN RAISE EXCEPTION 'Emergency disable modified disposable domain or board records'; END IF;
 RAISE NOTICE 'CP-TL-03C disposable emergency disable PASS: access revoked, audit and board retained';
END $rollback_accept$;
