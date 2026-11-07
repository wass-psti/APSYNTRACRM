-- CP-BOARD-COL-DELETE / Phase B5 final acceptance. READ ONLY.
-- Verify default-off activation, empty private QA scope, complete recovery
-- evidence, exact restored four-cell fixture, original RPC contracts and Contacts.
-- No JWT, actor identifiers, private cell payloads or credentials are returned.
WITH qa AS (
 SELECT b.id,b.created_by FROM public.work_boards b
 WHERE b.id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
  AND b.name='CP-BOARD-COL-DELETE QA Signed Fixture'
  AND b.status='active'
), controls AS (
 SELECT
  (SELECT count(*)=1 FROM private.wm_recoverable_column_activation a
    WHERE a.id IS TRUE AND a.delete_enabled IS FALSE
      AND a.restore_enabled IS FALSE) AS both_disabled,
  (SELECT count(*)=0 FROM private.wm_recoverable_column_qa_scope) AS no_qa_scope,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid='private.wm_recoverable_column_qa_scope'::regclass) AS scope_rls,
  NOT has_table_privilege('anon','private.wm_recoverable_column_qa_scope','SELECT') AND
  NOT has_table_privilege('authenticated','private.wm_recoverable_column_qa_scope','SELECT') AS scope_private,
  md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))='c9306ac46991b67bbfc1817cf197b5b5'
  AND md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))='51a6f2574597107396e298277111e1c6'
  AND md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))='d569201323f80d9e5f8e08d7cdeffab5'
  AS rpc_source_unchanged
), fixture AS (
 SELECT
  (SELECT count(*) FROM qa) AS qa_board_count,
  (SELECT count(*) FROM public.work_boards
    WHERE name LIKE 'CP-BOARD-COL-DELETE QA %') AS qa_marker_boards,
  (SELECT count(*) FROM public.work_board_items i JOIN qa b ON b.id=i.board_id
    WHERE i.archived_at IS NULL) AS qa_items,
  (SELECT count(*) FROM public.work_board_columns c JOIN qa b ON b.id=c.board_id
    WHERE c.name='Recovery Status' AND c.system_key IS NULL AND c.data_type='text'
    AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%')) AS qa_columns,
  (SELECT count(*) FROM public.work_board_item_values v
    JOIN public.work_board_columns c ON c.id=v.column_id JOIN qa b ON b.id=c.board_id
    WHERE c.name='Recovery Status') AS qa_cells,
  (SELECT count(*) FROM (
    VALUES ('B2 QA item 1','B2-QA-Alpha'),('B2 QA item 2','B2-QA-Beta'),
           ('B2 QA item 3','B2-QA-Gamma'),('B2 QA item 4','B2-QA-Delta')
   ) e(title,expected)
   JOIN qa b ON TRUE
   JOIN public.work_board_items i ON i.board_id=b.id AND i.title=e.title
     AND i.created_by=b.created_by AND i.archived_at IS NULL
   JOIN public.work_board_item_values v ON v.item_id=i.id
   JOIN public.work_board_columns c ON c.id=v.column_id AND c.board_id=b.id
     AND c.name='Recovery Status' AND c.system_key IS NULL AND c.data_type='text'
   WHERE v.value=to_jsonb(e.expected)) AS exact_pairs
), recovery AS (
 SELECT
  (SELECT count(*) FROM private.wm_recoverable_deleted_columns) AS snapshot_total,
  (SELECT count(*) FROM private.wm_recoverable_deleted_columns d JOIN qa b ON b.id=d.board_id
    WHERE d.restored_at IS NOT NULL AND d.restored_by=b.created_by
      AND d.removed_by=b.created_by AND d.value_count=4) AS restored_owner_snapshot,
  (SELECT count(*) FROM private.wm_recoverable_deleted_columns
    WHERE restored_at IS NULL) AS pending_snapshots,
  (SELECT count(*) FROM private.wm_recoverable_deleted_cells) AS archived_cell_total
), audit AS (
 SELECT
  (SELECT count(*) FROM public.work_board_events e JOIN qa b ON b.id=e.board_id
    WHERE e.event_type='column.deleted_recoverable' AND e.actor_id=b.created_by) AS deletion_events,
  (SELECT count(*) FROM public.work_board_events e JOIN qa b ON b.id=e.board_id
    WHERE e.event_type='column.restored' AND e.actor_id=b.created_by) AS restoration_events
), contacts AS (
 SELECT
  (SELECT count(*) FROM public.work_board_columns c
    WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
      AND c.name='Status I') AS protected_columns,
  (SELECT count(*) FROM public.work_board_item_values v JOIN public.work_board_columns c
    ON c.id=v.column_id WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
      AND c.name='Status I') AS protected_values
)
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-B5',
 'status',CASE WHEN c.both_disabled AND c.no_qa_scope AND c.scope_rls
  AND c.scope_private AND c.rpc_source_unchanged
  AND f.qa_board_count=1 AND f.qa_marker_boards=1 AND f.qa_items=4 AND
   f.qa_columns=1 AND f.qa_cells=4 AND f.exact_pairs=4
  AND r.snapshot_total=1 AND r.restored_owner_snapshot=1 AND
   r.pending_snapshots=0 AND r.archived_cell_total=4
  AND a.deletion_events=1 AND a.restoration_events=1
  AND k.protected_columns=1 AND k.protected_values=4
 THEN 'B5_DEACTIVATION_AND_FINAL_PRESERVATION_VERIFIED'
 ELSE 'B5_FINAL_PRESERVATION_REVIEW_REQUIRED' END,
 'both_recovery_flags_disabled',c.both_disabled,
 'qa_scope_empty',c.no_qa_scope,
 'private_scope_rls',c.scope_rls,
 'private_scope_grants_revoked',c.scope_private,
 'recovery_rpc_sources_unchanged',c.rpc_source_unchanged,
 'qa_board_count',f.qa_board_count,
 'qa_items',f.qa_items,
 'qa_recovery_columns',f.qa_columns,
 'qa_stored_cells',f.qa_cells,
 'qa_exact_value_pairs',f.exact_pairs,
 'recovery_snapshot_count',r.snapshot_total,
 'restored_snapshot_count',r.restored_owner_snapshot,
 'pending_snapshot_count',r.pending_snapshots,
 'archived_recovery_cells',r.archived_cell_total,
 'qa_delete_audit_events',a.deletion_events,
 'qa_restore_audit_events',a.restoration_events,
 'contacts_status_i_untouched',k.protected_columns=1 AND k.protected_values=4,
 'signed_auth_reenactment_performed',false
) AS phase_b5_final_acceptance
FROM controls c CROSS JOIN fixture f CROSS JOIN recovery r
 CROSS JOIN audit a CROSS JOIN contacts k;
