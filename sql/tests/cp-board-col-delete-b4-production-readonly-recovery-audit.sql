-- CP-BOARD-COL-DELETE / Phase B4.2 — production READ-ONLY acceptance.
-- Observe one signed QA deletion, Activity audit and restoration only.
-- No JWT impersonation, no writes, no source/actor/record identifiers returned.
WITH qa AS (
 SELECT id, created_by FROM public.work_boards
 WHERE id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
  AND name='CP-BOARD-COL-DELETE QA Signed Fixture'
  AND status='active'
), fixture AS (
 SELECT
  (SELECT count(*) FROM qa) AS qa_boards,
  (SELECT count(*) FROM public.work_board_items i JOIN qa b ON i.board_id=b.id
    WHERE i.archived_at IS NULL) AS qa_items,
  (SELECT count(*) FROM public.work_board_columns c JOIN qa b ON c.board_id=b.id
    WHERE c.name='Recovery Status' AND c.data_type='text' AND c.system_key IS NULL
      AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%')) AS qa_columns,
  (SELECT count(*) FROM public.work_board_item_values v
    JOIN public.work_board_columns c ON c.id=v.column_id
    JOIN qa b ON c.board_id=b.id
    WHERE c.name='Recovery Status') AS qa_values,
  (SELECT count(*) FROM (
    VALUES ('B2 QA item 1','B2-QA-Alpha'),
           ('B2 QA item 2','B2-QA-Beta'),
           ('B2 QA item 3','B2-QA-Gamma'),
           ('B2 QA item 4','B2-QA-Delta')
   ) expected(title,value)
   JOIN qa b ON TRUE
   JOIN public.work_board_items i ON i.board_id=b.id
     AND i.title=expected.title AND i.created_by=b.created_by AND i.archived_at IS NULL
   JOIN public.work_board_item_values v ON v.item_id=i.id
   JOIN public.work_board_columns c ON c.id=v.column_id
     AND c.board_id=b.id AND c.name='Recovery Status'
     AND c.data_type='text' AND c.system_key IS NULL
   WHERE v.value=to_jsonb(expected.value)
  ) AS exact_value_pairs
), recovery AS (
 SELECT count(*) AS total_snapshots,
   count(*) FILTER(WHERE d.restored_at IS NOT NULL) AS restored_snapshots,
   count(*) FILTER(WHERE d.restored_at IS NULL) AS pending_snapshots,
   count(*) FILTER(WHERE d.value_count=4) AS four_value_snapshots,
   count(*) FILTER(WHERE d.removed_by=(SELECT created_by FROM qa)) AS deleted_by_qa_creator,
   count(*) FILTER(WHERE d.restored_by=(SELECT created_by FROM qa)
                           AND d.restored_at IS NOT NULL) AS restored_by_qa_creator
 FROM private.wm_recoverable_deleted_columns d JOIN qa b ON d.board_id=b.id
), events AS (
 SELECT
 count(*) FILTER(WHERE e.event_type='column.deleted_recoverable') AS deleted_events,
 count(*) FILTER(WHERE e.event_type='column.restored') AS restored_events,
 count(*) FILTER(WHERE e.event_type='column.deleted_recoverable'
   AND e.actor_id=(SELECT created_by FROM qa)) AS owner_deleted_events,
 count(*) FILTER(WHERE e.event_type='column.restored'
   AND e.actor_id=(SELECT created_by FROM qa)) AS owner_restored_events
 FROM public.work_board_events e JOIN qa b ON b.id=e.board_id
), controls AS (
 SELECT (SELECT count(*)=1 FROM public.work_board_columns c
         WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
           AND c.name='Status I') AND
        (SELECT count(*)=4 FROM public.work_board_item_values v
         JOIN public.work_board_columns c ON c.id=v.column_id
         WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
          AND c.name='Status I') AS contacts_preserved
)
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-B4-2',
 'status',CASE
   WHEN (SELECT contacts_preserved FROM controls) IS NOT TRUE
     THEN 'BLOCKED_CONTACTS_INTEGRITY_CHANGED'
   WHEN (SELECT qa_boards=1 AND qa_items=4 AND qa_columns=1
         AND qa_values=4 AND exact_value_pairs=4 FROM fixture) IS TRUE
     AND (SELECT total_snapshots=0 FROM recovery) IS TRUE
     AND (SELECT deleted_events=0 AND restored_events=0 FROM events) IS TRUE
     THEN 'READY_FOR_SIGNED_QA_DELETE_NO_RECOVERY_ATTEMPT'
   WHEN (SELECT qa_boards=1 AND qa_items=4 AND qa_columns=1
         AND qa_values=4 AND exact_value_pairs=4 FROM fixture) IS TRUE
     AND (SELECT total_snapshots=1 AND restored_snapshots=1
          AND pending_snapshots=0 AND four_value_snapshots=1
          AND deleted_by_qa_creator=1 AND restored_by_qa_creator=1 FROM recovery) IS TRUE
     AND (SELECT deleted_events=1 AND restored_events=1
          AND owner_deleted_events=1 AND owner_restored_events=1 FROM events) IS TRUE
     THEN 'POST_RESTORATION_DATABASE_AND_AUDIT_PASS_SIGNED_BROWSER_EVIDENCE_SEPARATE'
   WHEN (SELECT qa_boards=1 AND qa_items=4 AND qa_columns=0 AND qa_values=0 FROM fixture) IS TRUE
     AND (SELECT total_snapshots=1 AND pending_snapshots=1
          AND four_value_snapshots=1 AND deleted_by_qa_creator=1 FROM recovery) IS TRUE
     AND (SELECT deleted_events=1 AND restored_events=0 FROM events) IS TRUE
     THEN 'QA_DELETED_RESTORATION_REQUIRED'
   ELSE 'B4_2_FIXTURE_OR_AUDIT_REVIEW_REQUIRED'
 END,
 'qa_boards',(SELECT qa_boards FROM fixture),
 'qa_items',(SELECT qa_items FROM fixture),
 'qa_columns',(SELECT qa_columns FROM fixture),
 'qa_stored_cells',(SELECT qa_values FROM fixture),
 'qa_exact_pairs',(SELECT exact_value_pairs FROM fixture),
 'snapshot_count',(SELECT total_snapshots FROM recovery),
 'restored_snapshots',(SELECT restored_snapshots FROM recovery),
 'pending_snapshots',(SELECT pending_snapshots FROM recovery),
 'four_value_snapshots',(SELECT four_value_snapshots FROM recovery),
 'deleted_events',(SELECT deleted_events FROM events),
 'restored_events',(SELECT restored_events FROM events),
 'contacts_untouched',(SELECT contacts_preserved FROM controls),
 'signed_origin_from_privileged_sql_verified',false
) AS b4_2_readonly_acceptance;
