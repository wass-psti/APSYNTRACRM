-- CP-TL-FINAL-09B — Read-only first genuine automatic-numbered create audit.
-- Never issue a create, allocate a sequence, restore QA fixtures, or simulate
-- a business transaction to make this audit pass.
BEGIN TRANSACTION READ ONLY;

WITH types(document_type,prefix) AS (
 VALUES ('esi','ESI-'),('packing','PL-'),('delivery','DR-'),
  ('payment','AR-'),('quotation','Q-'),('po','PO-')
), verified AS (
 SELECT d.document_type,d.id,d.document_number,d.created_at,d.created_by
 FROM public.tradelink_documents d
 JOIN types t USING(document_type)
 JOIN public.tradelink_document_events e
  ON e.document_id=d.id AND e.operation='created'
  AND e.actor_id=d.created_by AND e.revision=1
 JOIN private.tradelink_document_revision_snapshots s
  ON s.document_id=d.id AND s.revision=1
  AND s.document_type=d.document_type
  AND s.document_number=d.document_number
  AND s.board_item_id=d.board_item_id AND s.created_by=d.created_by
 JOIN public.work_board_items b
  ON b.id=d.board_item_id AND b.board_id=d.board_id
  AND b.title=d.document_number AND b.created_by=d.created_by
 WHERE d.board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND d.document_number ~ ('^'||t.prefix||'[0-9]{6,}$')
  AND s.content->>'documentNumber'=d.document_number
  AND s.content->>'documentType'=d.document_type
  AND d.content->>'documentNumber'=d.document_number
)
SELECT t.document_type,t.prefix,
 (SELECT count(*) FROM private.tradelink_document_sequences q
  WHERE q.board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
   AND q.document_type=t.document_type) AS allocated_sequence_rows,
 (SELECT count(*) FROM verified v WHERE v.document_type=t.document_type)
  AS matching_created_document_count,
 EXISTS(SELECT 1 FROM verified v WHERE v.document_type=t.document_type)
  AS first_signed_create_verified
FROM types t ORDER BY t.document_type;

SELECT
 to_regprocedure('public.tl03_document_create(uuid,uuid,jsonb,text)') IS NOT NULL
  AS create_rpc_installed,
 has_function_privilege('authenticated',
  'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  AS authenticated_create_execute,
 has_function_privilege('anon',
  'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  AS anon_create_execute,
 (SELECT count(*) FROM private.tradelink_document_sequences) AS sequence_rows,
 (SELECT count(*) FROM public.tradelink_documents) AS all_documents,
 (SELECT count(*) FROM public.tradelink_documents
  WHERE archived_at IS NULL) AS active_documents,
 (SELECT count(*) FROM private.tradelink_document_revision_snapshots)
  AS revision_snapshots;
ROLLBACK;
