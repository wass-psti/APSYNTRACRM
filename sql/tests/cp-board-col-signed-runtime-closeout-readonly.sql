-- CP-BOARD-COL-SIGNED-RUNTIME-CLOSEOUT: production READ-ONLY evidence.
-- Observe a *new* authenticated UI round trip after production activation.
-- Does not mutate data, impersonate a user, or expose cell values, user IDs,
-- session credentials, or private backup contents.
-- The older 2026-11-06 QA recovery evidence alone cannot satisfy this check.
WITH qa AS (
 SELECT b.id,b.created_by
 FROM public.work_boards b
 WHERE b.id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
   AND b.name='CP-BOARD-COL-DELETE QA Signed Fixture'
   AND b.status='active'
), recovery_column AS (
 SELECT c.id FROM public.work_board_columns c JOIN qa ON qa.id=c.board_id
 WHERE c.name='Recovery Status' AND c.data_type='text' AND c.system_key IS NULL
   AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%')
), restored_pairs AS (
 SELECT count(*) AS n FROM (VALUES
  ('B2 QA item 1','B2-QA-Alpha'),('B2 QA item 2','B2-QA-Beta'),
  ('B2 QA item 3','B2-QA-Gamma'),('B2 QA item 4','B2-QA-Delta')
 ) fixture(title,expected) JOIN qa ON true
 JOIN public.work_board_items i ON i.board_id=qa.id AND i.title=fixture.title
   AND i.created_by=qa.created_by AND i.archived_at IS NULL
 JOIN public.work_board_item_values v ON v.item_id=i.id
 JOIN recovery_column c ON c.id=v.column_id AND v.value=to_jsonb(fixture.expected)
), snapshots AS (
 SELECT count(*) AS total,
   count(*) FILTER(WHERE d.restored_at IS NOT NULL) AS restored,
   count(*) FILTER(WHERE d.restored_at IS NULL) AS pending,
   count(*) FILTER(WHERE d.removed_at >= '2026-11-12T04:50:07Z'::timestamptz) AS postactivation_delete,
   count(*) FILTER(WHERE d.removed_at >= '2026-11-12T04:50:07Z'::timestamptz
     AND d.restored_at > d.removed_at AND d.restored_at IS NOT NULL) AS postactivation_restored,
   count(*) FILTER(WHERE d.value_count=4) AS four_cell_snapshots,
   count(*) FILTER(WHERE d.removed_by=(SELECT created_by FROM qa)
     AND d.restored_by=(SELECT created_by FROM qa)) AS same_original_qa_actor
 FROM private.wm_recoverable_deleted_columns d JOIN qa ON qa.id=d.board_id
), audits AS (
 SELECT count(*) FILTER(WHERE e.event_type='column.deleted_recoverable') AS deletes,
   count(*) FILTER(WHERE e.event_type='column.restored') AS restores
 FROM public.work_board_events e JOIN qa ON qa.id=e.board_id
), controls AS (
 SELECT
   (SELECT count(*)=1 FROM private.wm_recoverable_column_activation
     WHERE id IS TRUE AND delete_enabled AND restore_enabled) AS recovery_active,
   (SELECT count(*)=0 FROM private.wm_recoverable_column_qa_scope) AS qa_scope_empty,
   (SELECT count(*)=1 FROM public.work_board_columns c
     WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
     AND c.name='Status I') AS control_column_preserved,
   (SELECT count(*)=4 FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
     AND c.name='Status I') AS control_cells_preserved
)
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-SIGNED-RUNTIME-CLOSEOUT',
 'status',CASE
  WHEN (SELECT recovery_active AND qa_scope_empty AND control_column_preserved
         AND control_cells_preserved FROM controls) IS NOT TRUE
    THEN 'BLOCKED_PRODUCTION_INTEGRITY_OR_ACTIVATION'
  WHEN (SELECT count(*) FROM qa)<>1
    THEN 'BLOCKED_QA_BOARD_MISSING'
  WHEN (SELECT total FROM snapshots)<1
    THEN 'BLOCKED_HISTORICAL_RECOVERY_MISSING'
  WHEN (SELECT pending FROM snapshots)>0
    THEN 'QA_DELETED_RESTORATION_REQUIRED'
  WHEN (SELECT postactivation_delete FROM snapshots)=0
    THEN 'PENDING_NEW_GENUINE_SIGNED_BROWSER_ROUNDTRIP'
  WHEN (SELECT count(*) FROM recovery_column)=1
   AND (SELECT n FROM restored_pairs)=4
   AND (SELECT postactivation_delete=postactivation_restored FROM snapshots) IS TRUE
   AND (SELECT postactivation_restored FROM snapshots)>0
   AND (SELECT four_cell_snapshots=total AND same_original_qa_actor=total FROM snapshots) IS TRUE
   AND (SELECT deletes=restores FROM audits) IS TRUE
    THEN 'POST_ACTIVATION_DATABASE_RESTORE_PASS_BROWSER_PROVENANCE_SEPARATE'
  ELSE 'POST_ACTIVATION_RECOVERY_OR_AUDIT_REVIEW_REQUIRED' END,
 'activated',(SELECT recovery_active FROM controls),
 'qa_board_present',(SELECT count(*) FROM qa)=1,
 'qa_column_present',(SELECT count(*) FROM recovery_column)=1,
 'restored_expected_value_pairs',(SELECT n FROM restored_pairs),
 'recovery_snapshots',(SELECT total FROM snapshots),
 'pending_restoration',(SELECT pending FROM snapshots),
 'postactivation_delete_snapshots',(SELECT postactivation_delete FROM snapshots),
 'postactivation_restored_snapshots',(SELECT postactivation_restored FROM snapshots),
 'delete_audit_events',(SELECT deletes FROM audits),
 'restore_audit_events',(SELECT restores FROM audits),
 'unrelated_contacts_data_preserved',(SELECT control_column_preserved AND control_cells_preserved FROM controls),
 'real_go_true_browser_request_proven_by_privileged_sql',false
) AS acceptance_evidence;
