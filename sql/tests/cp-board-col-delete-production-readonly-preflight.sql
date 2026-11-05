-- CP-BOARD-COL-DELETE — read-only live PostgreSQL proof of why the
-- Contacts / Status I delete is denied by the current empty-only RPC.
-- Never SELECT cell contents, user identifiers, tokens or private snapshots.
-- Do not execute any DELETE/UPDATE/GRANT/DDL in production.
WITH target AS (
 SELECT b.id,b.name AS board_name,b.status,
  c.id AS column_id,c.name AS column_name,c.column_key,c.system_key,c.required
 FROM public.work_boards b
 JOIN public.work_board_columns c ON c.board_id=b.id
 WHERE b.id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
   AND c.name='Status I'
), facts AS (
 SELECT
  count(*)::int AS matched_target_columns,
  coalesce(bool_and(board_name='Contacts' AND status='active'
    AND system_key IS NULL AND required IS FALSE
    AND (column_key LIKE 'custom:%' OR column_key LIKE 'custom_%')),false)
    AS is_active_ordinary_custom_column,
  coalesce(sum((SELECT count(*) FROM public.work_board_item_values v
                WHERE v.column_id=t.column_id)),0)::int AS stored_value_rows
 FROM target t
), controls AS (
 SELECT
 md5(pg_get_functiondef(
  'public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)'::regprocedure
 ))='7e5ae389363acffa093ad3291314cf2a' AS original_empty_only_rpc_unchanged,
 md5(pg_get_functiondef(
  'private.wm_board_config_session_active()'::regprocedure
 ))='a2284885128169732cb646fe03adcd83' AS genuine_session_guard_unchanged,
 to_regprocedure('public.work_board_access(uuid,text)') IS NOT NULL AS board_acl_present,
 to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NOT NULL
  AS board_activity_log_present,
 to_regclass('private.wm_recoverable_deleted_columns') IS NULL
  AND to_regclass('private.wm_recoverable_deleted_cells') IS NULL
  AND to_regprocedure(
   'public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'
  ) IS NULL AND to_regprocedure(
   'public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'
  ) IS NULL AS recoverable_delete_not_installed,
 EXISTS(
  SELECT 1 FROM pg_constraint k
  WHERE k.contype='f' AND k.conrelid='public.work_board_item_values'::regclass
    AND k.confrelid='public.work_board_columns'::regclass
    AND k.confdeltype='c'
 ) AS cell_fk_cascades_if_column_removed
)
SELECT
 CASE WHEN f.matched_target_columns=1
 AND f.is_active_ordinary_custom_column AND f.stored_value_rows=4
 AND c.original_empty_only_rpc_unchanged AND c.genuine_session_guard_unchanged
 AND c.board_acl_present AND c.board_activity_log_present
 AND c.recoverable_delete_not_installed
 AND c.cell_fk_cascades_if_column_removed
 THEN 'CP_BOARD_COL_DELETE_LIVE_4_ROWS_INTACT_RECOVERY_NOT_INSTALLED'
 ELSE 'CP_BOARD_COL_DELETE_PRECONDITIONS_CHANGED_REVIEW_REQUIRED' END AS status,
 f.*,c.*
FROM facts f CROSS JOIN controls c;
