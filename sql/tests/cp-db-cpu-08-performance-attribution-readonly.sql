-- CP-DB-CPU-08: read-only performance and QA fixture observations.
-- No statistics reset, configuration changes, impersonation, or writes.

SELECT
  now() AS captured_at,
  pg_postmaster_start_time() AS database_start,
  (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database())
    AS database_stats_reset,
  current_setting('pg_stat_statements.track', true) AS pgss_track,
  current_setting('track_functions', true) AS track_functions,
  current_setting('track_io_timing', true) AS track_io_timing;

SELECT
  role.rolname,
  statement.queryid,
  statement.calls,
  round(statement.total_exec_time::numeric, 2) AS total_exec_ms,
  round(statement.mean_exec_time::numeric, 3) AS mean_exec_ms,
  round(statement.max_exec_time::numeric, 2) AS max_exec_ms,
  statement.shared_blks_hit,
  statement.shared_blks_read,
  statement.temp_blks_written,
  left(regexp_replace(statement.query, '[[:space:]]+', ' ', 'g'), 500) AS statement
FROM extensions.pg_stat_statements statement
LEFT JOIN pg_roles role ON role.oid = statement.userid
WHERE statement.query ILIKE '%wm_list_boards%'
   OR statement.query ILIKE '%wm_import_board_wizard_extended_atomic%'
   OR statement.query ILIKE '%apsyntra_crm_my_effective_access%'
ORDER BY statement.total_exec_time DESC;

SELECT
  stats.relname,
  stats.seq_scan,
  stats.seq_tup_read,
  stats.idx_scan,
  stats.idx_tup_fetch,
  stats.n_live_tup,
  stats.n_dead_tup
FROM pg_stat_user_tables stats
WHERE stats.schemaname = 'public'
  AND stats.relname IN (
    'work_boards',
    'work_board_items',
    'work_board_item_values',
    'work_board_members',
    'workspace_members',
    'profiles'
  )
ORDER BY stats.seq_tup_read DESC;

SELECT
  index_stats.relname AS table_name,
  index_stats.indexrelname AS index_name,
  index_stats.idx_scan,
  index_stats.idx_tup_read,
  index_stats.idx_tup_fetch
FROM pg_stat_user_indexes index_stats
WHERE index_stats.schemaname = 'public'
  AND index_stats.relname IN (
    'work_boards',
    'work_board_items',
    'work_board_item_values',
    'work_board_members',
    'workspace_members',
    'profiles'
  )
ORDER BY index_stats.relname, index_stats.idx_scan DESC;

SELECT
  board.id,
  board.name,
  board.updated_at,
  (SELECT count(*) FROM public.work_board_items item
    WHERE item.board_id = board.id AND item.archived_at IS NULL) AS active_items,
  (SELECT count(*) FROM public.work_board_groups group_row
    WHERE group_row.board_id = board.id) AS groups,
  (SELECT count(*) FROM public.work_board_columns column_row
    WHERE column_row.board_id = board.id) AS columns,
  (SELECT count(*) FROM public.work_board_events event_row
    WHERE event_row.board_id = board.id
      AND event_row.created_at >= now() - interval '1 hour') AS events_last_hour,
  (SELECT count(*) FROM public.work_board_item_values value_row
    JOIN public.work_board_items item ON item.id = value_row.item_id
    WHERE item.board_id = board.id
      AND value_row.updated_at >= now() - interval '1 hour') AS cell_updates_last_hour
FROM public.work_boards board
WHERE board.id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid;
