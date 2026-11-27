-- CP-TL-OPT-01 acceptance suite. Disposable PostgreSQL 17 only.
-- Every inserted document and Board event is rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $create$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc_id uuid;
 payload jsonb;
 receipt jsonb;
 i integer;
 suffix text;
BEGIN
 FOR i IN 1..60 LOOP
  suffix:=pg_catalog.lpad(i::text,3,'0');
  doc_id:=('00000000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid;
  payload:=pg_catalog.jsonb_build_object(
   'documentType','quotation',
   'documentNumber','Q-OPT-'||suffix,
   'customerName','Repository Client '||suffix,
   'referenceNumber','REF-OPT-'||suffix,
   'poNumber','PO-OPT-'||suffix,
   'date','2026-11-27',
   'currency','PHP','vatType','12',
   'verifiedBy','QA Reviewer One',
   'verifiedByEmail','qa-reviewer-one@example.test',
   'approvedBy','QA Reviewer Two',
   'approvedByEmail','qa-reviewer-two@example.test',
   'remarks','CP-TL-OPT-01 synthetic repository fixture',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','line-one','kind','item','description','Repository test line',
    'quantity',1,'unitPrice',10))
  );
  receipt:=public.tl03_document_save(
   board,doc_id,0,'create',payload,'for-approval');
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'revision'<>'1'
   OR receipt->>'state'<>'for-approval'
   OR receipt->>'idempotent'<>'false' THEN
   RAISE EXCEPTION 'CP-TL-OPT-01 fixture create receipt mismatch: %',receipt;
  END IF;
 END LOOP;
END $create$;
RESET ROLE;

-- Give every row the same creation timestamp to exercise the immutable-ID
-- tie-breaker. Updated timestamps span three UTC dates for inclusive filtering.
WITH numbered AS (
 SELECT id,pg_catalog.substr(document_number,7)::integer AS n
 FROM public.tradelink_documents
 WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND document_number LIKE 'Q-OPT-%'
)
UPDATE public.tradelink_documents d
SET created_at=timestamptz '2026-11-01 00:00:00+00',
    updated_at=CASE
     WHEN numbered.n<=20 THEN timestamptz '2026-11-01 00:00:00+00'
     WHEN numbered.n<=40 THEN timestamptz '2026-11-02 12:00:00+00'
     ELSE timestamptz '2026-11-03 00:00:00+00'
    END
FROM numbered WHERE d.id=numbered.id;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $repository_search$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 result jsonb;
 needle text;
BEGIN
 FOREACH needle IN ARRAY ARRAY[
  'Q-OPT-017','Repository Client 017','REF-OPT-017','PO-OPT-017'
 ] LOOP
  result:=public.tl03_documents_query(
   board,needle,'all','all','active','visible',
   NULL,NULL,'documentNumber','asc',NULL,50);
  IF result->>'totalCount'<>'1'
   OR pg_catalog.jsonb_array_length(result->'rows')<>1
   OR result->'rows'->0->>'documentNumber'<>'Q-OPT-017' THEN
   RAISE EXCEPTION 'Global search failed for %, response %',needle,result;
  END IF;
 END LOOP;
 RAISE NOTICE 'CP-TL-OPT-01 global search PASS: document number, client, reference and PO number';
END $repository_search$;

DO $date_range$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 result jsonb;
BEGIN
 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',
  DATE '2026-11-02',DATE '2026-11-02','updatedAt','asc',NULL,5);
 IF result->>'totalCount'<>'20'
  OR pg_catalog.jsonb_array_length(result->'rows')<>5
  OR result->>'hasMore'<>'true'
  OR result->'rows'->0->>'documentNumber'<>'Q-OPT-021'
  OR (result->'rows'->4->>'updatedAt')::timestamptz<>
     timestamptz '2026-11-02 12:00:00+00' THEN
  RAISE EXCEPTION 'Single-day inclusive UTC date filter failed: %',result;
 END IF;

 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',
  DATE '2026-11-02',NULL,'updatedAt','asc',NULL,50);
 IF result->>'totalCount'<>'40'
  OR pg_catalog.jsonb_array_length(result->'rows')<>40
  OR result->>'hasMore'<>'false'
  OR result->'rows'->0->>'documentNumber'<>'Q-OPT-021'
  OR result->'rows'->39->>'documentNumber'<>'Q-OPT-060' THEN
  RAISE EXCEPTION 'Inclusive UTC lower-bound filter failed: %',result;
 END IF;

 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',
  NULL,DATE '2026-11-02','updatedAt','asc',NULL,50);
 IF result->>'totalCount'<>'40'
  OR pg_catalog.jsonb_array_length(result->'rows')<>40
  OR result->>'hasMore'<>'false'
  OR result->'rows'->0->>'documentNumber'<>'Q-OPT-001'
  OR result->'rows'->39->>'documentNumber'<>'Q-OPT-040' THEN
  RAISE EXCEPTION 'Inclusive UTC upper-bound filter failed: %',result;
 END IF;
 RAISE NOTICE 'CP-TL-OPT-01 UTC date range PASS: inclusive start/end, single day and open-ended ranges';
END $date_range$;

DO $pagination$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 first_page jsonb;
 second_page jsonb;
 combined jsonb;
 row_count integer;
 unique_count integer;
BEGIN
 first_page:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'documentNumber','asc',NULL,50);
 IF first_page->>'totalCount'<>'60'
  OR pg_catalog.jsonb_array_length(first_page->'rows')<>50
  OR first_page->>'hasMore'<>'true'
  OR first_page->'rows'->0->>'documentNumber'<>'Q-OPT-001'
  OR first_page->'rows'->49->>'documentNumber'<>'Q-OPT-050'
  OR first_page->'nextCursor'->>'sortValue'<>'q-opt-050'
  OR first_page->'nextCursor'->>'documentId'<>
    first_page->'rows'->49->>'documentId' THEN
  RAISE EXCEPTION 'First global repository page or cursor failed: %',first_page;
 END IF;
 second_page:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'documentNumber','asc',first_page->'nextCursor',50);
 IF second_page->>'totalCount'<>'60'
  OR pg_catalog.jsonb_array_length(second_page->'rows')<>10
  OR second_page->>'hasMore'<>'false'
  OR second_page->'nextCursor' IS DISTINCT FROM 'null'::jsonb
  OR second_page->'rows'->0->>'documentNumber'<>'Q-OPT-051'
  OR second_page->'rows'->9->>'documentNumber'<>'Q-OPT-060' THEN
  RAISE EXCEPTION 'Second global repository page failed: %',second_page;
 END IF;
 combined:=(first_page->'rows')||(second_page->'rows');
 SELECT count(*),count(DISTINCT value->>'documentId')
 INTO row_count,unique_count
 FROM pg_catalog.jsonb_array_elements(combined) AS rows(value);
 IF row_count<>60 OR unique_count<>60 THEN
  RAISE EXCEPTION 'Repository pagination duplicated or skipped rows: %, %',row_count,unique_count;
 END IF;
 RAISE NOTICE 'CP-TL-OPT-01 keyset pagination PASS: 60 unique rows across 50+10 pages';
END $pagination$;

DO $tie_breaker$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 first_page jsonb;
 second_page jsonb;
BEGIN
 first_page:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'createdAt','desc',NULL,50);
 IF first_page->'rows'->0->>'documentNumber'<>'Q-OPT-060'
  OR first_page->'rows'->49->>'documentNumber'<>'Q-OPT-011'
  OR first_page->'nextCursor'->>'sortValue'<>'2026-11-01 00:00:00+00'
  OR first_page->'nextCursor'->>'documentId'<>
    first_page->'rows'->49->>'documentId' THEN
  RAISE EXCEPTION 'Creation-time tie-breaker first page failed: %',first_page;
 END IF;
 second_page:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'createdAt','desc',first_page->'nextCursor',50);
 IF pg_catalog.jsonb_array_length(second_page->'rows')<>10
  OR second_page->'rows'->0->>'documentNumber'<>'Q-OPT-010'
  OR second_page->'rows'->9->>'documentNumber'<>'Q-OPT-001'
  OR second_page->>'hasMore'<>'false' THEN
  RAISE EXCEPTION 'Creation-time tie-breaker second page failed: %',second_page;
 END IF;
 RAISE NOTICE 'CP-TL-OPT-01 duplicate-sort-value cursor PASS: 60 rows remain stable across page boundaries';
END $tie_breaker$;

DO $sort$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 result jsonb;
 sort_case record;
BEGIN
 FOR sort_case IN
  SELECT * FROM (VALUES
   ('createdAt','asc','Q-OPT-001'),
   ('createdAt','desc','Q-OPT-060'),
   ('updatedAt','asc','Q-OPT-001'),
   ('updatedAt','desc','Q-OPT-060'),
   ('documentNumber','asc','Q-OPT-001'),
   ('documentNumber','desc','Q-OPT-060'),
   ('documentType','asc','Q-OPT-001'),
   ('documentType','desc','Q-OPT-060'),
   ('revision','asc','Q-OPT-001'),
   ('revision','desc','Q-OPT-060')
  ) AS cases(sort_by,sort_direction,expected_document)
 LOOP
  result:=public.tl03_documents_query(
   board,'','all','all','active','visible',NULL,NULL,
   sort_case.sort_by,sort_case.sort_direction,NULL,1);
  IF result->'rows'->0->>'documentNumber' IS DISTINCT FROM sort_case.expected_document THEN
   RAISE EXCEPTION 'Global sort failed for % %: %',
    sort_case.sort_by,sort_case.sort_direction,result;
  END IF;
 END LOOP;
 RAISE NOTICE 'CP-TL-OPT-01 global sorting PASS: all five sort fields in ascending and descending order';
END $sort$;

DO $cursor_validation$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 invalid_cursor jsonb;
 result jsonb;
BEGIN
 FOR invalid_cursor IN
  SELECT value FROM pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('sortBy','documentNumber','sortValue','q-opt-050',
    'documentId','00000000-0000-4000-8000-000000000050','extra','not-allowed'),
   pg_catalog.jsonb_build_object('sortBy','documentNumber',
    'documentId','00000000-0000-4000-8000-000000000050'),
   pg_catalog.jsonb_build_object('sortBy','updatedAt','sortValue','2026-11-02 12:00:00+00',
    'documentId','00000000-0000-4000-8000-000000000050'),
   pg_catalog.jsonb_build_object('sortBy','documentNumber','sortValue',50,
    'documentId','00000000-0000-4000-8000-000000000050'),
   pg_catalog.jsonb_build_object('sortBy','documentNumber','sortValue','q-opt-050',
    'documentId','invalid-id'),
   pg_catalog.jsonb_build_object('sortBy','createdAt','sortValue','not-a-date',
    'documentId','00000000-0000-4000-8000-000000000050'),
   pg_catalog.jsonb_build_object('sortBy','revision','sortValue','1;drop',
    'documentId','00000000-0000-4000-8000-000000000050'),
   pg_catalog.jsonb_build_object('sortBy','documentNumber','sortValue',
    pg_catalog.repeat('x',2001),'documentId','00000000-0000-4000-8000-000000000050')
  )) AS invalid(value)
 LOOP
  BEGIN
   PERFORM public.tl03_documents_query(
    board,'','all','all','active','visible',NULL,NULL,
    'documentNumber','asc',invalid_cursor,5);
   RAISE EXCEPTION 'Invalid TradeLink repository cursor was accepted: %',invalid_cursor;
  EXCEPTION WHEN SQLSTATE '22023' THEN
   NULL;
  END;
 END LOOP;

 BEGIN
  PERFORM public.tl03_documents_query(
   board,'','all','all','active','visible',NULL,NULL,
   'createdAt','asc',
   pg_catalog.jsonb_build_object('sortBy','createdAt',
    'sortValue','not-a-date',
    'documentId','00000000-0000-4000-8000-000000000050'),5);
  RAISE EXCEPTION 'Malformed timestamp cursor was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  NULL;
 END;

 BEGIN
  PERFORM public.tl03_documents_query(
   board,'','all','all','active','visible',NULL,NULL,
   'revision','asc',
   pg_catalog.jsonb_build_object('sortBy','revision',
    'sortValue','1;drop',
    'documentId','00000000-0000-4000-8000-000000000050'),5);
  RAISE EXCEPTION 'Malformed revision cursor was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  NULL;
 END;

 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'updatedAt','asc',
  pg_catalog.jsonb_build_object('sortBy','updatedAt',
   'sortValue','2026-11-02 12:00:00+00',
   'documentId','00000000-0000-4000-8000-000000000040'),1);
 IF result->'rows'->0->>'documentNumber'<>'Q-OPT-041' THEN
  RAISE EXCEPTION 'Valid updated-time cursor failed: %',result;
 END IF;

 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'documentType','asc',
  pg_catalog.jsonb_build_object('sortBy','documentType',
   'sortValue','quotation',
   'documentId','00000000-0000-4000-8000-000000000050'),1);
 IF result->'rows'->0->>'documentNumber'<>'Q-OPT-051' THEN
  RAISE EXCEPTION 'Valid document-type cursor failed: %',result;
 END IF;

 result:=public.tl03_documents_query(
  board,'','all','all','active','visible',NULL,NULL,
  'revision','asc',
  pg_catalog.jsonb_build_object('sortBy','revision',
   'sortValue','1',
   'documentId','00000000-0000-4000-8000-000000000050'),1);
 IF result->'rows'->0->>'documentNumber'<>'Q-OPT-051' THEN
  RAISE EXCEPTION 'Valid revision cursor failed: %',result;
 END IF;
 RAISE NOTICE 'CP-TL-OPT-01 cursor validation PASS: exact keys, sort match, value type, UUID and sort-specific values';
END $cursor_validation$;

DO $compatibility$
BEGIN
 IF to_regprocedure(
  'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)'
 ) IS NULL
  OR to_regprocedure(
   'public.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)'
  ) IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR (SELECT count(*) FROM pg_catalog.pg_indexes
   WHERE schemaname='public' AND indexname=ANY(ARRAY[
    'tl03_document_sort_number','tl03_document_sort_type',
    'tl03_document_sort_revision','tl03_document_search_number_trgm',
    'tl03_document_search_client_trgm','tl03_document_search_reference_trgm',
    'tl03_document_search_po_reference_trgm'
   ]))<>7 THEN
  RAISE EXCEPTION 'CP-TL-OPT-01 compatibility, grant or index verification failed';
 END IF;
 RAISE NOTICE 'CP-TL-OPT-01 compatibility PASS: legacy page RPC retained; query indexes and grants present';
END $compatibility$;

RESET ROLE;
ROLLBACK;
