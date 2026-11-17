-- CP-TL-FINAL-05: reusable production acceptance readback (no mutations).
-- Run only with an authorized READ-ONLY SQL session after a legitimate business submission.
-- Evaluates signed event + immutable revision snapshot + current document/Board identity.
-- Historical snapshot content is deliberately NOT compared to current content:
-- later revisions may differ while their historical submission remains authentic.
BEGIN TRANSACTION READ ONLY;

WITH required(document_type,required_event,required_state) AS (
  VALUES ('esi','submitted','submitted'),
    ('quotation','submitted','submitted'),
    ('po','submitted','submitted'),
    ('delivery','submitted','submitted'),
    ('payment','submitted','submitted'),
    ('packing','completed','completed')
)
SELECT required.document_type,
  required.required_state,
  (SELECT count(*) FROM public.tradelink_documents d
   WHERE d.document_type=required.document_type AND d.archived_at IS NULL)
    AS active_document_count,
  EXISTS (
    SELECT 1 FROM public.tradelink_document_events e
    JOIN public.tradelink_documents d ON d.id=e.document_id
    JOIN private.tradelink_document_revision_snapshots s
      ON s.document_id=d.id AND s.revision=e.revision
    JOIN public.work_board_items b
      ON b.id=d.board_item_id AND b.board_id=d.board_id
    WHERE d.document_type=required.document_type
      AND e.operation=required.required_event
      AND e.metadata->>'action'='submit'
      AND e.metadata->>'to'=required.required_state
      AND e.metadata->>'from' IN ('draft','revision-required')
      AND s.workflow_state=required.required_state
      AND s.document_type=d.document_type
      AND s.document_number=d.document_number
      AND s.board_item_id=d.board_item_id
      AND s.content->>'documentType'=required.document_type
      AND e.actor_id IS NOT NULL
      AND b.title=d.document_number
  ) AS has_historical_submitted_evidence
FROM required ORDER BY required.document_type;

SELECT
  (SELECT count(*) FROM public.tradelink_documents WHERE archived_at IS NULL)
    AS active_documents,
  (SELECT count(*) FROM public.tradelink_document_events
   WHERE operation IN ('submitted','completed')) AS submit_events,
  (SELECT count(*) FROM private.tradelink_document_revision_snapshots)
    AS immutable_snapshots,
  (SELECT count(*) FROM public.tradelink_documents d
   WHERE d.archived_at IS NULL AND NOT EXISTS (
     SELECT 1 FROM private.tradelink_document_revision_snapshots s
     WHERE s.document_id=d.id AND s.revision=d.revision
       AND s.content=d.content AND s.workflow_state=d.workflow_state
       AND s.document_number=d.document_number)) AS current_snapshot_mismatches,
  (SELECT count(*) FROM public.tradelink_documents d
   WHERE d.archived_at IS NULL AND NOT EXISTS (
     SELECT 1 FROM public.work_board_items b
     WHERE b.id=d.board_item_id AND b.board_id=d.board_id
       AND b.title=d.document_number AND b.archived_at IS NULL))
    AS current_board_mismatches,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261117060100') AS submit_migration_recorded,
  has_function_privilege('authenticated',
    'public.tl03_document_submit(uuid,uuid,bigint)','EXECUTE') AS authenticated_execute,
  has_function_privilege('anon',
    'public.tl03_document_submit(uuid,uuid,bigint)','EXECUTE') AS anon_execute;
ROLLBACK;
