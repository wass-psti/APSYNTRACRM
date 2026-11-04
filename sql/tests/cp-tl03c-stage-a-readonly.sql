-- CP-TL-03C Stage A verification: READ-ONLY. Valid on disposable or
-- on production only after the separately approved schema activation.
\set ON_ERROR_STOP on
DO $read_only_accept$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'CP-TL-03C read-only schema missing'; END IF;
 IF NOT has_table_privilege('authenticated','public.tradelink_documents','SELECT')
  OR NOT has_table_privilege('authenticated','public.tradelink_document_events','SELECT')
  OR NOT has_function_privilege('authenticated',
     'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
     'public.tl03_documents_list(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL-03C read-only RPC grants missing'; END IF;
 IF has_function_privilege('authenticated',
     'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
     'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
     'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_table_privilege('authenticated','public.tradelink_documents','INSERT')
  OR has_table_privilege('authenticated','public.tradelink_documents','UPDATE')
  OR has_table_privilege('authenticated','public.tradelink_document_events','INSERT')
 THEN RAISE EXCEPTION 'CP-TL-03C Stage A unexpectedly enabled writes' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
     WHERE n.nspname='public' AND c.relname IN
       ('tradelink_documents','tradelink_document_events') AND c.relrowsecurity)=2
 THEN NULL;
 ELSE RAISE EXCEPTION 'CP-TL-03C Stage A RLS missing'; END IF;
 RAISE NOTICE 'CP-TL-03C Stage A tables and read RPCs present; all document writes denied PASS';
END $read_only_accept$;
