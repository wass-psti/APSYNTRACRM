-- CP-TL-LARGE-SAVE-02: disposable end-to-end capacity boundary.
-- Exercises the same public signed save/read/submit RPCs used by TradeLink.
-- Runs only against a throwaway PostgreSQL 17 database; the final transaction rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $large_save$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 large_id uuid:='55555555-bbbb-4555-8555-555555555555';
 too_many_id uuid:='66666666-bbbb-4666-8666-666666666666';
 too_large_id uuid:='77777777-bbbb-4777-8777-777777777777';
 duplicate_id uuid:='88888888-bbbb-4888-8888-888888888888';
 payload jsonb;
 payload_v2 jsonb;
 too_many_payload jsonb;
 too_many_update_payload jsonb;
 duplicate_payload jsonb;
 duplicate_update_payload jsonb;
 over_payload jsonb;
 over_update_payload jsonb;
 receipt jsonb;
 readback jsonb;
 filler_length integer;
BEGIN
 IF pg_catalog.octet_length('{"name":"Café 漢字 😀","n":1e-7,"list":[1,2],"ok":true}'::jsonb::text)<>73 THEN
  RAISE EXCEPTION 'PostgreSQL JSONB UTF-8/number canonicalization byte contract changed'; END IF;

 payload:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-LARGE-250',
  'customerName','Capacity Test Customer','customerEmail','capacity@example.test',
  'verifiedBy','Sales Supervisor','verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
  'approvedBy','Management','approvedByEmail','dsenagan@watchdogautomation.com.ph',
  'validity','30 days','deliveryCommitment','2 weeks',
  'paymentTerms','Net 30','currency','PHP','vatType','12',
  'items',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id','line-'||g,'kind','item','description','Capacity item '||g,
    'quantity',1,'unitPrice',10,'unit',CASE WHEN g=1 THEN '' ELSE 'pc' END
   ) ORDER BY g) FROM pg_catalog.generate_series(1,250) AS series(g))
 );
 filler_length:=2097152-pg_catalog.octet_length(payload::text);
 IF filler_length<0 THEN RAISE EXCEPTION '250-item fixture base exceeds 2 MiB'; END IF;
 payload:=pg_catalog.jsonb_set(payload,'{items,0,unit}',
  pg_catalog.to_jsonb(pg_catalog.repeat('x',filler_length)),true);
 IF pg_catalog.octet_length(payload::text)<>2097152 THEN
  RAISE EXCEPTION 'Exact 2 MiB JSONB fixture mismatch: % bytes',pg_catalog.octet_length(payload::text);
 END IF;

 -- The public save RPC is the same endpoint used by the current frontend
 -- when saving a manually numbered document.
 receipt:=public.tl03_document_save(board,large_id,0,'create',payload,'draft');
 IF (receipt->>'revision')::integer<>1 OR receipt->>'operation'<>'create'
  OR coalesce((receipt->>'idempotent')::boolean,true) THEN
  RAISE EXCEPTION '250-item / 2 MiB signed save did not create revision 1'; END IF;

 -- Replaying the same create command must return the original receipt,
 -- without adding another document, Board projection, event or snapshot.
 receipt:=public.tl03_document_save(board,large_id,0,'create',payload,'draft');
 IF receipt->>'idempotent'<>'true' OR (receipt->>'revision')::integer<>1 THEN
  RAISE EXCEPTION 'Same-command create retry was not idempotent'; END IF;
 readback:=public.tl03_document_read(board,large_id);
 IF (readback->>'revision')::integer<>1
  OR pg_catalog.octet_length((readback->'content')::text)<>2097152
  OR pg_catalog.jsonb_array_length(readback->'content'->'items')<>250 THEN
  RAISE EXCEPTION 'Signed read RPC did not return the exact 2 MiB / 250-item document'; END IF;

 -- A changed revision remains exactly 2 MiB and exercises the public update RPC.
 payload_v2:=pg_catalog.jsonb_set(payload,'{customerName}',
  pg_catalog.to_jsonb('Capacity Test Customer v2'::text),true);
 payload_v2:=pg_catalog.jsonb_set(payload_v2,'{items,0,unit}',
  pg_catalog.to_jsonb(pg_catalog.repeat('x',filler_length-3)),true);
 IF pg_catalog.octet_length(payload_v2::text)<>2097152 THEN
  RAISE EXCEPTION 'Updated 2 MiB JSONB fixture mismatch'; END IF;
 receipt:=public.tl03_document_save(board,large_id,1,'update',payload_v2,'draft');
 IF (receipt->>'revision')::integer<>2 OR receipt->>'operation'<>'update' THEN
  RAISE EXCEPTION '250-item / 2 MiB signed update did not commit revision 2'; END IF;

 too_many_payload:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-LARGE-251',
  'customerName','Capacity Test Customer','customerEmail','capacity@example.test',
  'verifiedBy','Sales Supervisor','verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
  'approvedBy','Management','approvedByEmail','dsenagan@watchdogautomation.com.ph',
  'validity','30 days','deliveryCommitment','2 weeks',
  'paymentTerms','Net 30',
  'items',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id','line-'||g,'kind','item','description','Capacity item '||g,
   'quantity',1,'unitPrice',10) ORDER BY g)
   FROM pg_catalog.generate_series(1,251) AS series(g))
 );
 BEGIN
  PERFORM public.tl03_document_save(board,too_many_id,0,'create',too_many_payload,'draft');
  RAISE EXCEPTION '251-item document was accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 over_payload:=pg_catalog.jsonb_set(payload,'{items,0,unit}',
  pg_catalog.to_jsonb(pg_catalog.repeat('x',filler_length+1)),true);
 IF pg_catalog.octet_length(over_payload::text)<>2097153 THEN
  RAISE EXCEPTION '2 MiB + 1 JSONB fixture mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_document_save(board,too_large_id,0,'create',over_payload,'draft');
  RAISE EXCEPTION '2 MiB + 1 document was accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 duplicate_payload:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-LARGE-DUP',
  'customerName','Capacity Test Customer','customerEmail','capacity@example.test',
  'verifiedBy','Sales Supervisor','verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
  'approvedBy','Management','approvedByEmail','dsenagan@watchdogautomation.com.ph',
  'validity','30 days','deliveryCommitment','2 weeks',
  'paymentTerms','Net 30',
  'items',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('id','duplicate-line','kind','item',
    'description','Duplicate one','quantity',1,'unitPrice',10),
   pg_catalog.jsonb_build_object('id','duplicate-line','kind','item',
    'description','Duplicate two','quantity',1,'unitPrice',10)
  )
 );
 BEGIN
  PERFORM public.tl03_document_save(board,duplicate_id,0,'create',duplicate_payload,'draft');
  RAISE EXCEPTION 'Duplicate line-item identifiers were accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 -- Invalid updates must leave revision 2, its content, and its two snapshots intact.
 too_many_update_payload:=pg_catalog.jsonb_set(too_many_payload,'{documentNumber}',
  pg_catalog.to_jsonb('Q-LARGE-250'::text),true);
 BEGIN
  PERFORM public.tl03_document_save(board,large_id,2,'update',too_many_update_payload,'draft');
  RAISE EXCEPTION '251-item update was accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 over_update_payload:=pg_catalog.jsonb_set(payload_v2,'{items,0,unit}',
  pg_catalog.to_jsonb(pg_catalog.repeat('x',filler_length-2)),true);
 IF pg_catalog.octet_length(over_update_payload::text)<>2097153 THEN
  RAISE EXCEPTION '2 MiB + 1 update fixture mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_document_save(board,large_id,2,'update',over_update_payload,'draft');
  RAISE EXCEPTION '2 MiB + 1 update was accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 duplicate_update_payload:=pg_catalog.jsonb_set(duplicate_payload,'{documentNumber}',
  pg_catalog.to_jsonb('Q-LARGE-250'::text),true);
 BEGIN
  PERFORM public.tl03_document_save(board,large_id,2,'update',duplicate_update_payload,'draft');
  RAISE EXCEPTION 'Duplicate-ID update was accepted' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 readback:=public.tl03_document_read(board,large_id);
 IF (readback->>'revision')::integer<>2
  OR readback->'content' IS DISTINCT FROM payload_v2 THEN
  RAISE EXCEPTION 'Rejected update partially changed the signed document readback'; END IF;

 -- The actual signed submit RPC must accept the same 250-item payload.
 receipt:=public.tl03_document_submit(board,large_id,2);
 IF receipt->>'state'<>'submitted' OR (receipt->>'revision')::integer<>3 THEN
  RAISE EXCEPTION '250-item document did not pass signed submission'; END IF;
 readback:=public.tl03_document_read(board,large_id);
 IF (readback->>'revision')::integer<>3
  OR readback->>'workflow_state'<>'submitted'
  OR pg_catalog.octet_length((readback->'content')::text)<>2097152
  OR pg_catalog.jsonb_array_length(readback->'content'->'items')<>250
  OR readback->'content'->'customerName'<>'"Capacity Test Customer v2"'::jsonb THEN
  RAISE EXCEPTION 'Signed read RPC after submission did not preserve the updated 2 MiB document'; END IF;
END $large_save$;

RESET ROLE;
DO $verify$
DECLARE
 saved public.tradelink_documents%rowtype;
 snapshots integer;
BEGIN
 SELECT * INTO saved FROM public.tradelink_documents
  WHERE id='55555555-bbbb-4555-8555-555555555555';
 IF saved.id IS NULL OR saved.revision<>3 OR saved.workflow_state<>'submitted'
  OR pg_catalog.octet_length(saved.content::text)<>2097152
  OR pg_catalog.jsonb_array_length(saved.content->'items')<>250
  OR saved.content->'items'->0->>'id'<>'line-1'
  OR saved.content->'items'->249->>'id'<>'line-250'
  OR saved.content->>'customerName'<>'Capacity Test Customer v2'
  OR saved.board_item_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items
    WHERE id=saved.board_item_id AND board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'
     AND title='Q-LARGE-250') THEN
  RAISE EXCEPTION 'Persisted 250-item / 2 MiB document readback mismatch'; END IF;

 SELECT count(*) INTO snapshots FROM private.tradelink_document_revision_snapshots
  WHERE document_id=saved.id AND revision IN (1,2,3)
   AND pg_catalog.octet_length(content::text)=2097152;
 IF snapshots<>3
  OR (SELECT count(*) FROM public.tradelink_documents WHERE id=saved.id)<>1
  OR (SELECT count(*) FROM public.work_board_items
      WHERE id=saved.board_item_id AND board_id=saved.board_id AND title='Q-LARGE-250')<>1
  OR (SELECT count(*) FROM public.tradelink_document_events
      WHERE document_id=saved.id)<>3
  OR NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
    WHERE document_id=saved.id AND revision=1 AND content->>'customerName'='Capacity Test Customer')
  OR NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
    WHERE document_id=saved.id AND revision IN (2,3)
     AND content->>'customerName'='Capacity Test Customer v2') THEN
  RAISE EXCEPTION 'Immutable revision snapshots did not preserve all three exact 2 MiB revisions: %/3',snapshots;
 END IF;

 IF EXISTS(SELECT 1 FROM public.tradelink_documents
   WHERE id IN ('66666666-bbbb-4666-8666-666666666666',
                '77777777-bbbb-4777-8777-777777777777',
                '88888888-bbbb-4888-8888-888888888888'))
  OR EXISTS(SELECT 1 FROM public.work_board_items
   WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'
    AND title IN ('Q-LARGE-251','Q-LARGE-2MIB-OVER','Q-LARGE-DUP'))
  OR EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
   WHERE document_id IN ('66666666-bbbb-4666-8666-666666666666',
                         '77777777-bbbb-4777-8777-777777777777',
                         '88888888-bbbb-4888-8888-888888888888'))
  OR EXISTS(SELECT 1 FROM public.tradelink_document_events
   WHERE document_id IN ('66666666-bbbb-4666-8666-666666666666',
                         '77777777-bbbb-4777-8777-777777777777',
                         '88888888-bbbb-4888-8888-888888888888')) THEN
  RAISE EXCEPTION 'Rejected capacity payload created partial document, projection, event or revision state'; END IF;
END $verify$;
ROLLBACK;
