-- CP-TL-FINAL-07: source-aware module production readiness inventory.
-- Read-only diagnostic: does NOT restore archived QA fixtures or submit records.
-- Counts historical signed source transitions only when revision snapshots and
-- Board identity match; archived QA material is not genuine business acceptance.
BEGIN TRANSACTION READ ONLY;
WITH required(document_type,expected_event,expected_state) AS (
 VALUES ('esi','submitted','submitted'),
  ('quotation','submitted','submitted'),
  ('po','submitted','submitted'),
  ('delivery','submitted','submitted'),
  ('payment','submitted','submitted'),
  ('packing','completed','completed')
), document_inventory AS (
 SELECT d.document_type,
  count(*) FILTER (WHERE d.archived_at IS NULL) AS active_documents,
  count(*) FILTER (WHERE d.archived_at IS NOT NULL) AS archived_documents,
  count(*) FILTER (WHERE d.archived_at IS NOT NULL AND d.workflow_state='draft')
   AS archived_drafts,
  count(*) FILTER (WHERE d.archived_at IS NULL AND d.workflow_state='draft')
   AS active_drafts
 FROM public.tradelink_documents d
 GROUP BY d.document_type
), accepted AS (
 SELECT r.document_type,
  count(DISTINCT e.document_id) AS signed_submitted_documents
 FROM required r
 JOIN public.tradelink_documents d ON d.document_type=r.document_type
 JOIN public.tradelink_document_events e ON e.document_id=d.id
  AND e.operation=r.expected_event AND e.metadata->>'action'='submit'
  AND e.metadata->>'to'=r.expected_state
  AND e.metadata->>'from' IN ('draft','revision-required')
 JOIN private.tradelink_document_revision_snapshots s ON s.document_id=d.id
  AND s.revision=e.revision AND s.workflow_state=r.expected_state
  AND s.document_number=d.document_number AND s.document_type=d.document_type
  AND s.board_item_id=d.board_item_id
 JOIN public.work_board_items b ON b.id=d.board_item_id
  AND b.board_id=d.board_id AND b.title=d.document_number
 WHERE e.actor_id IS NOT NULL
 GROUP BY r.document_type
)
SELECT r.document_type, r.expected_state,
 coalesce(i.active_documents,0) AS active_documents,
 coalesce(i.active_drafts,0) AS active_drafts,
 coalesce(i.archived_documents,0) AS archived_documents,
 coalesce(i.archived_drafts,0) AS archived_drafts,
 coalesce(a.signed_submitted_documents,0) AS historical_signed_acceptance,
 coalesce(a.signed_submitted_documents,0)>0 AS production_transition_verified
FROM required r
LEFT JOIN document_inventory i USING(document_type)
LEFT JOIN accepted a USING(document_type)
ORDER BY r.document_type;
ROLLBACK;
