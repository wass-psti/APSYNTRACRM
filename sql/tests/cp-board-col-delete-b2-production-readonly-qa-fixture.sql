-- CP-BOARD-COL-DELETE / Phase B2 live inventory. READ ONLY.
-- Observes the authenticated-client fixture AFTER the real user invokes it.
-- This admin SQL query cannot prove GoTrue request provenance by itself.
-- No cell contents, actor IDs, email, or access tokens are returned.
WITH qa AS (
 SELECT id,created_by,workspace_id,status
 FROM public.work_boards
 WHERE name='CP-BOARD-COL-DELETE QA Signed Fixture'
), candidate AS (
 SELECT b.id,b.created_by,b.workspace_id,b.status,
 (SELECT count(*) FROM public.work_board_members bm
  WHERE bm.board_id=b.id AND bm.user_id=b.created_by AND bm.role='owner')
   AS owner_memberships,
 (SELECT count(*) FROM public.work_board_groups g WHERE g.board_id=b.id)
   AS group_rows,
 (SELECT count(*) FROM public.work_board_columns c WHERE c.board_id=b.id)
   AS all_columns,
 (SELECT count(*) FROM public.work_board_columns c WHERE c.board_id=b.id
  AND c.name='Recovery Status' AND c.system_key IS NULL
  AND c.data_type='text'
  AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%'))
   AS qa_columns,
 (SELECT count(*) FROM public.work_board_items i
  WHERE i.board_id=b.id AND i.archived_at IS NULL) AS item_rows,
 (SELECT count(*) FROM public.work_board_item_values v
  JOIN public.work_board_columns c ON c.id=v.column_id
  WHERE c.board_id=b.id AND c.name='Recovery Status') AS qa_cell_rows,
 (SELECT count(*) FROM (
   VALUES (1,'B2 QA item 1','B2-QA-Alpha'),
          (2,'B2 QA item 2','B2-QA-Beta'),
          (3,'B2 QA item 3','B2-QA-Gamma'),
          (4,'B2 QA item 4','B2-QA-Delta')
 ) wanted(n,item_title,cell_value)
 JOIN public.work_board_items i
 ON i.board_id=b.id AND i.title=wanted.item_title
  AND i.created_by=b.created_by AND i.archived_at IS NULL
 JOIN public.work_board_item_values v ON v.item_id=i.id
 JOIN public.work_board_columns c ON c.id=v.column_id
  AND c.board_id=b.id AND c.name='Recovery Status'
  AND c.data_type='text'
  AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%')
  AND c.system_key IS NULL
 WHERE v.value=to_jsonb(wanted.cell_value)) AS exact_pairs
 FROM qa b
), controls AS (
 SELECT (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)=0
    AS qa_scope_empty,
 (SELECT count(*) FROM private.wm_recoverable_column_activation
  WHERE id IS TRUE AND delete_enabled IS FALSE AND restore_enabled IS FALSE)=1
    AS recovery_disabled,
 (SELECT count(*) FROM private.wm_recoverable_deleted_columns)=0
    AND (SELECT count(*) FROM private.wm_recoverable_deleted_cells)=0
    AS snapshots_empty,
 (SELECT count(*) FROM public.work_board_columns c
  WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
  AND c.name='Status I')=1
    AND (SELECT count(*) FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
     AND c.name='Status I')=4
    AS contacts_untouched
)
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-B2',
 'status',CASE WHEN (SELECT qa_scope_empty AND recovery_disabled
  AND snapshots_empty AND contacts_untouched FROM controls) IS NOT TRUE
  THEN 'B2_PRODUCTION_SAFETY_PRECONDITION_CHANGED'
  WHEN (SELECT count(*) FROM public.work_boards
    WHERE name LIKE 'CP-BOARD-COL-DELETE QA %')=0
  THEN 'B2_AWAITING_GENUINE_SIGNED_UI_ACTION'
  WHEN (SELECT count(*) FROM qa)=1
   AND (SELECT count(*) FROM public.work_boards
    WHERE name LIKE 'CP-BOARD-COL-DELETE QA %')=1
   AND (SELECT bool_and(status='active' AND owner_memberships=1
      AND group_rows=1 AND all_columns=1 AND qa_columns=1
      AND item_rows=4 AND qa_cell_rows=4 AND exact_pairs=4)
      FROM candidate) IS TRUE
  THEN 'B2_AUTHORITATIVE_FOUR_CELL_FIXTURE_PRESENT_GOTRUE_PROVENANCE_UNVERIFIED'
  ELSE 'B2_FIXTURE_INCOMPLETE_OR_AMBIGUOUS_REVIEW_REQUIRED' END,
 'qa_board_count',(SELECT count(*) FROM qa),
 'all_qa_marker_boards',(SELECT count(*) FROM public.work_boards
    WHERE name LIKE 'CP-BOARD-COL-DELETE QA %'),
 'qa_column_count',(SELECT qa_columns FROM candidate),
 'qa_items',(SELECT item_rows FROM candidate),
 'qa_stored_cells',(SELECT qa_cell_rows FROM candidate),
 'qa_expected_pairs',(SELECT exact_pairs FROM candidate),
 'server_flags_disabled',(SELECT recovery_disabled FROM controls),
 'qa_scope_empty',(SELECT qa_scope_empty FROM controls),
 'private_snapshots_empty',(SELECT snapshots_empty FROM controls),
 'contacts_status_i_untouched',(SELECT contacts_untouched FROM controls),
 'signed_origin_from_privileged_sql_verified',false
) AS phase_b2_readonly;
