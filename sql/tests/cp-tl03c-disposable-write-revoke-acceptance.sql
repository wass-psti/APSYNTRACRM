-- CP-TL-03C Phase 2: disposable-only Stage B write-grant rollback acceptance.
-- Must run AFTER signed fixture transactions and narrow write-only revoke.
-- This test reads state; it cannot modify production permissions or data.
\set ON_ERROR_STOP on
DO $accept$
BEGIN
 IF NOT has_function_privilege('authenticated',
    'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_documents_list(uuid,integer)','EXECUTE')
  OR NOT has_table_privilege('authenticated',
    'public.tradelink_documents','SELECT')
  OR NOT has_table_privilege('authenticated',
    'public.tradelink_document_events','SELECT')
  OR has_function_privilege('authenticated',
    'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
    'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Write-only rollback did not restore Stage A grants'
  USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.tradelink_documents)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events)<>4
  OR (SELECT count(*) FROM public.work_board_items
    WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)<>1
 THEN RAISE EXCEPTION 'Write-only rollback altered document, audit or board fixture'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN
   ('tradelink_documents','tradelink_document_events') AND c.relrowsecurity)<>2
 THEN RAISE EXCEPTION 'Write-only rollback weakened RLS'; END IF;
 RAISE NOTICE 'CP-TL-03C narrow Stage B write revoke PASS: Stage A reads preserved, documents and audit intact';
END $accept$;
