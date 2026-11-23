-- Runs ONLY against synthetic PostgreSQL 17. Never run against production.
\set ON_ERROR_STOP on
BEGIN;

-- Create 54 records using the existing signed save RPC. Reviewer identities are
-- synthetic users from cp-tl03-disposable-setup.sql.
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
BEGIN
 FOR i IN 1..54 LOOP
  doc_id:=('00000000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid;
  payload:=pg_catalog.jsonb_build_object(
   'documentType','quotation',
   'documentNumber','Q-PAGE-'||pg_catalog.lpad(i::text,3,'0'),
   'customerName','Pagination Client '||pg_catalog.lpad(i::text,3,'0'),
   'date','2026-11-23',
   'currency','PHP','vatType','12',
   'verifiedBy','QA Reviewer One',
   'verifiedByEmail','qa-reviewer-one@example.test',
   'approvedBy','QA Reviewer Two',
   'approvedByEmail','qa-reviewer-two@example.test',
   'remarks','CP-TL-01B disposable pagination fixture',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','line-one','kind','item','description','Disposable pagination line',
    'quantity',1,'unitPrice',10))
  );
  receipt:=public.tl03_document_save(
   board,doc_id,0,'create',payload,'for-approval');
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'revision'<>'1'
   OR receipt->>'state'<>'for-approval'
   OR receipt->>'idempotent'<>'false' THEN
   RAISE EXCEPTION 'Disposable TradeLink create receipt mismatch: %',receipt;
  END IF;
 END LOOP;
END $create$;
RESET ROLE;

-- A shared creation timestamp forces the UUID tie-breaker to decide ordering.
-- Two fixture rows are creator-only; one of the assigned rows is also creator-owned.
UPDATE public.tradelink_documents
SET created_at='2026-11-01 00:00:00+00'::timestamptz,
    created_by=CASE
     WHEN id='00000000-0000-4000-8000-000000000052'::uuid
       THEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
     WHEN id='00000000-0000-4000-8000-000000000053'::uuid
       THEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
     ELSE created_by END,
    content=CASE
     WHEN id IN ('00000000-0000-4000-8000-000000000053'::uuid,
                 '00000000-0000-4000-8000-000000000054'::uuid)
      THEN content-'verifiedByEmail'-'approvedByEmail'
     ELSE content END
WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid;
UPDATE public.work_board_items i
SET created_by='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    updated_by='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
FROM public.tradelink_documents d
WHERE d.board_item_id=i.id
 AND d.id IN ('00000000-0000-4000-8000-000000000052'::uuid,
              '00000000-0000-4000-8000-000000000053'::uuid);

-- Reviewer: 52 assigned records + one creator-only record; the overlap appears once.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $reviewer_pages$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 overlap_id uuid:='00000000-0000-4000-8000-000000000052';
 creator_only_id uuid:='00000000-0000-4000-8000-000000000053';
 manager_only_id uuid:='00000000-0000-4000-8000-000000000054';
 fixed_created timestamptz:='2026-11-01 00:00:00+00';
 first_page jsonb; second_page jsonb; all_rows jsonb; row_value jsonb;
 row_count integer; unique_count integer; assigned_count integer;
 overlap_count integer; creator_only_count integer; manager_only_count integer;
 previous_id uuid; current_id uuid;
BEGIN
 IF private.tl03_can_manage(board) IS DISTINCT FROM FALSE
  OR private.tl03_can_create_draft(board) IS DISTINCT FROM TRUE
  OR private.tl03_can_review(board) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Disposable identity is not a non-manager reviewer/creator';
 END IF;
 first_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',NULL,NULL,50);
 IF jsonb_array_length(first_page->'rows')<>50
  OR first_page->>'hasMore'<>'true'
  OR NOT (first_page->'nextCursor' ? 'createdAt')
  OR first_page->'nextCursor' ? 'updatedAt'
  OR (first_page->'nextCursor'->>'createdAt')::timestamptz<>fixed_created
  OR first_page->'nextCursor'->>'documentId'<>
    first_page->'rows'->49->>'documentId' THEN
  RAISE EXCEPTION 'Reviewer first page or authoritative created_at cursor mismatch: %',first_page;
 END IF;
 second_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',
  (first_page->'nextCursor'->>'createdAt')::timestamptz,
  (first_page->'nextCursor'->>'documentId')::uuid,50);
 IF second_page IS NULL OR jsonb_array_length(second_page->'rows') IS DISTINCT FROM 3
  OR second_page->>'hasMore' IS DISTINCT FROM 'false'
  OR second_page->'nextCursor' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION 'Reviewer second page did not return the remaining three rows: %',second_page;
 END IF;
 all_rows:=coalesce(first_page->'rows','[]'::jsonb)||coalesce(second_page->'rows','[]'::jsonb);
 SELECT count(*),count(DISTINCT value->>'documentId'),
  count(*) FILTER(WHERE value->>'assignedStage'='primary'),
  count(*) FILTER(WHERE value->>'documentId'=overlap_id::text),
  count(*) FILTER(WHERE value->>'documentId'=creator_only_id::text),
  count(*) FILTER(WHERE value->>'documentId'=manager_only_id::text)
 INTO row_count,unique_count,assigned_count,overlap_count,creator_only_count,manager_only_count
 FROM jsonb_array_elements(all_rows) AS rows(value);
 IF row_count<>53 OR unique_count<>53 OR assigned_count<>52
  OR overlap_count<>1 OR creator_only_count<>1 OR manager_only_count<>0 THEN
  RAISE EXCEPTION 'Creator/reviewer merge duplicated or leaked records: total %, unique %, assigned %, overlap %, creator-only %, manager-only %',
   row_count,unique_count,assigned_count,overlap_count,creator_only_count,manager_only_count;
 END IF;
 previous_id:=NULL;
 FOR row_value IN
  SELECT value FROM jsonb_array_elements(all_rows) WITH ORDINALITY AS page(value,ordinality)
  ORDER BY ordinality
 LOOP
  current_id:=(row_value->>'documentId')::uuid;
  IF previous_id IS NOT NULL AND previous_id<=current_id THEN
   RAISE EXCEPTION 'Reviewer page ordering did not preserve created_at DESC, id DESC';
  END IF;
  IF (row_value->>'createdAt')::timestamptz<>fixed_created
   OR nullif(btrim(row_value->>'clientName'),'') IS NULL THEN
   RAISE EXCEPTION 'Reviewer row omitted authoritative creation time or client identity: %',row_value;
  END IF;
  previous_id:=current_id;
 END LOOP;
 IF (SELECT value->>'createdByActor' FROM jsonb_array_elements(all_rows) AS rows(value)
     WHERE value->>'documentId'=creator_only_id::text) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Creator-only record was not marked as created by reviewer'; END IF;
 RAISE NOTICE 'CP-TL-01B reviewer pagination PASS: 53 unique rows, 52 assigned, 1 creator-only, 1 overlap, 0 unrelated';
END $reviewer_pages$;

-- Reviewer-only session: no Create New and no Board manage; only assigned rows appear.
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',true);
DO $reviewer_only_pages$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 fixed_created timestamptz:='2026-11-01 00:00:00+00';
 first_page jsonb; second_page jsonb; all_rows jsonb; row_value jsonb;
 row_count integer; unique_count integer; secondary_count integer;
 creator_only_count integer; manager_only_count integer;
 previous_id uuid; current_id uuid;
BEGIN
 IF private.tl03_can_manage(board) IS DISTINCT FROM FALSE
  OR private.tl03_can_create_draft(board) IS DISTINCT FROM FALSE
  OR private.tl03_can_review(board) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Disposable reviewer-only identity has an unexpected capability set';
 END IF;
 first_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',NULL,NULL,50);
 IF first_page IS NULL OR jsonb_array_length(first_page->'rows') IS DISTINCT FROM 50
  OR first_page->>'hasMore' IS DISTINCT FROM 'true'
  OR NOT (first_page->'nextCursor' ? 'createdAt') THEN
  RAISE EXCEPTION 'Reviewer-only first page/cursor mismatch: %',first_page;
 END IF;
 second_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',
  (first_page->'nextCursor'->>'createdAt')::timestamptz,
  (first_page->'nextCursor'->>'documentId')::uuid,50);
 IF second_page IS NULL OR jsonb_array_length(second_page->'rows') IS DISTINCT FROM 2
  OR second_page->>'hasMore' IS DISTINCT FROM 'false' THEN
  RAISE EXCEPTION 'Reviewer-only second page did not return the remaining two assigned rows';
 END IF;
 all_rows:=coalesce(first_page->'rows','[]'::jsonb)||coalesce(second_page->'rows','[]'::jsonb);
 SELECT count(*),count(DISTINCT value->>'documentId'),
  count(*) FILTER(WHERE value->>'assignedStage'='secondary'),
  count(*) FILTER(WHERE value->>'documentId'='00000000-0000-4000-8000-000000000053'),
  count(*) FILTER(WHERE value->>'documentId'='00000000-0000-4000-8000-000000000054')
 INTO row_count,unique_count,secondary_count,creator_only_count,manager_only_count
 FROM jsonb_array_elements(all_rows) AS rows(value);
 IF row_count<>52 OR unique_count<>52 OR secondary_count<>52
  OR creator_only_count<>0 OR manager_only_count<>0 THEN
  RAISE EXCEPTION 'Reviewer-only result included non-assigned rows or duplicates';
 END IF;
 previous_id:=NULL;
 FOR row_value IN
  SELECT value FROM jsonb_array_elements(all_rows) WITH ORDINALITY AS page(value,ordinality)
  ORDER BY ordinality
 LOOP
  current_id:=(row_value->>'documentId')::uuid;
  IF previous_id IS NOT NULL AND previous_id<=current_id THEN
   RAISE EXCEPTION 'Reviewer-only pages lost created_at/id ordering';
  END IF;
  IF (row_value->>'createdAt')::timestamptz<>fixed_created
   OR nullif(btrim(row_value->>'clientName'),'') IS NULL THEN
   RAISE EXCEPTION 'Reviewer-only row omitted creation time or client identity';
  END IF;
  previous_id:=current_id;
 END LOOP;
 RAISE NOTICE 'CP-TL-01B reviewer-only pagination PASS: 52 assigned rows across 50+2 pages';
END $reviewer_only_pages$;

-- Manager: all 54 rows, including the unassigned manager-owned record.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
DO $manager_pages$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 manager_only_id uuid:='00000000-0000-4000-8000-000000000054';
 first_page jsonb; second_page jsonb; all_rows jsonb;
 total integer; distinct_total integer; manager_only_count integer;
BEGIN
 first_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',NULL,NULL,50);
 IF first_page IS NULL OR jsonb_array_length(first_page->'rows') IS DISTINCT FROM 50
  OR first_page->>'hasMore' IS DISTINCT FROM 'true'
  OR NOT (first_page->'nextCursor' ? 'createdAt') THEN
  RAISE EXCEPTION 'Manager first page/cursor mismatch: %',first_page;
 END IF;
 second_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',
  (first_page->'nextCursor'->>'createdAt')::timestamptz,
  (first_page->'nextCursor'->>'documentId')::uuid,50);
 IF second_page IS NULL OR jsonb_array_length(second_page->'rows') IS DISTINCT FROM 4
  OR second_page->>'hasMore' IS DISTINCT FROM 'false'
  OR second_page->'nextCursor' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION 'Manager second page did not return the remaining four rows: %',second_page;
 END IF;
 all_rows:=coalesce(first_page->'rows','[]'::jsonb)||coalesce(second_page->'rows','[]'::jsonb);
 SELECT count(*),count(DISTINCT value->>'documentId'),
  count(*) FILTER(WHERE value->>'documentId'=manager_only_id::text)
 INTO total,distinct_total,manager_only_count
 FROM jsonb_array_elements(all_rows) AS rows(value);
 IF total<>54 OR distinct_total<>54 OR manager_only_count<>1 THEN
  RAISE EXCEPTION 'Manager page merge count or record scope mismatch';
 END IF;
 RAISE NOTICE 'CP-TL-01B manager pagination PASS: 54 unique rows across 50+4 pages';
END $manager_pages$;

-- Edit a saved document. Its updated_at changes, but created_at and list position do not.
DO $edit$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc_id uuid:='00000000-0000-4000-8000-000000000001';
 payload jsonb; receipt jsonb; saved public.tradelink_documents%rowtype;
 first_page jsonb; second_page jsonb; all_rows jsonb;
BEGIN
 payload:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-PAGE-001',
  'customerName','Pagination Client 001','date','2026-11-23',
  'currency','PHP','vatType','12',
  'verifiedBy','QA Reviewer One','verifiedByEmail','qa-reviewer-one@example.test',
  'approvedBy','QA Reviewer Two','approvedByEmail','qa-reviewer-two@example.test',
  'remarks','Edited after initial save; creation position must remain stable',
  'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'id','line-one','kind','item','description','Disposable pagination line',
   'quantity',1,'unitPrice',10))
 );
 receipt:=public.tl03_document_save(board,doc_id,1,'update',payload,'for-approval');
 IF receipt->>'revision'<>'2' OR receipt->>'state'<>'for-approval'
  OR receipt->>'documentId'<>doc_id::text THEN
  RAISE EXCEPTION 'Disposable edit receipt mismatch: %',receipt;
 END IF;
 SELECT * INTO saved FROM public.tradelink_documents WHERE id=doc_id;
 IF saved.created_at<>'2026-11-01 00:00:00+00'::timestamptz
  OR saved.updated_at<=saved.created_at OR saved.revision<>2
  OR saved.document_number<>'Q-PAGE-001'
  OR saved.content->>'customerName'<>'Pagination Client 001' THEN
  RAISE EXCEPTION 'Edit changed immutable creation identity or failed readback';
 END IF;
 first_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',NULL,NULL,50);
 second_page:=public.tl03_documents_page(board,'','quotation','for-approval','active',
  (first_page->'nextCursor'->>'createdAt')::timestamptz,
  (first_page->'nextCursor'->>'documentId')::uuid,50);
 all_rows:=coalesce(first_page->'rows','[]'::jsonb)||coalesce(second_page->'rows','[]'::jsonb);
 IF (all_rows->(jsonb_array_length(all_rows)-1)->>'documentId')<>doc_id::text THEN
  RAISE EXCEPTION 'Edited document moved from its original creation position';
 END IF;
 RAISE NOTICE 'CP-TL-01B edit-position PASS: revision 2, created_at unchanged, updated_at advanced, final position retained';
END $edit$;

RESET ROLE;
ROLLBACK;
-- Rollback removes all 54 synthetic documents, Board projections, and events.
