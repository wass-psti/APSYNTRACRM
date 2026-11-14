-- CP-DB-CPU-09: controlled-workload baseline and query-plan diagnostics.
-- READ ONLY: SELECT and EXPLAIN without ANALYZE only.
-- Do not reset statistics, change settings, impersonate users, or invoke RPCs.

-- 1. Capture the database and statistics window. pg_stat_statements is cumulative
--    since stats_reset; this timestamp is essential when comparing snapshots.
SELECT
  now() AS captured_at,
  current_setting('server_version') AS server_version,
  pg_postmaster_start_time() AS database_start,
  (SELECT stats_reset FROM extensions.pg_stat_statements_info) AS pgss_stats_reset,
  current_setting('pg_stat_statements.track', true) AS pgss_track,
  current_setting('pg_stat_statements.track_planning', true) AS pgss_track_planning,
  current_setting('track_functions', true) AS track_functions,
  current_setting('track_io_timing', true) AS track_io_timing,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_kcache') AS pg_stat_kcache_installed;

-- 2. Snapshot the three top-level PostgREST RPC statements. These are elapsed
--    execution and buffer counters, not per-function CPU measurements.
SELECT
  statement.queryid,
  role.rolname,
  statement.calls,
  round(statement.total_exec_time::numeric, 2) AS total_exec_ms,
  round(statement.mean_exec_time::numeric, 3) AS mean_exec_ms,
  round(statement.max_exec_time::numeric, 2) AS max_exec_ms,
  statement.rows,
  statement.shared_blks_hit,
  statement.shared_blks_read,
  statement.temp_blks_written,
  left(regexp_replace(statement.query, '[[:space:]]+', ' ', 'g'), 500) AS statement
FROM extensions.pg_stat_statements statement
LEFT JOIN pg_roles role ON role.oid = statement.userid
WHERE statement.queryid IN (
  -8551254353028248045, -- wm_list_boards
   5962890455400465064, -- wm_import_board_wizard_extended_atomic
   3194171109028220051  -- apsyntra_crm_my_effective_access
)
ORDER BY statement.queryid;

-- 3. Cumulative table counters. High sequential-scan counts on very small
--    tables are not automatically evidence of a missing index.
SELECT
  stats.schemaname,
  stats.relname,
  stats.n_live_tup,
  stats.n_dead_tup,
  stats.seq_scan,
  stats.seq_tup_read,
  stats.idx_scan,
  stats.idx_tup_fetch
FROM pg_stat_user_tables stats
WHERE (stats.schemaname = 'public' AND stats.relname IN (
  'profiles', 'workspace_members', 'apsyntra_crm_platform_roles',
  'module_role_assignments', 'work_boards', 'work_board_members',
  'work_board_items', 'work_board_columns', 'work_board_item_values',
  'work_board_events'
))
OR (stats.schemaname = 'private' AND stats.relname IN (
  'ws01_member_roles', 'ws02_personal_workspaces'
))
ORDER BY stats.seq_tup_read DESC;

-- 4. Existing indexes for the relevant access, board-list, and importer paths.
SELECT
  indexes.schemaname,
  indexes.tablename,
  indexes.indexname,
  indexes.indexdef
FROM pg_indexes indexes
WHERE (indexes.schemaname = 'public' AND indexes.tablename IN (
  'profiles', 'workspace_members', 'apsyntra_crm_platform_roles',
  'module_role_assignments', 'work_boards', 'work_board_members',
  'work_board_items', 'work_board_columns', 'work_board_item_values',
  'work_board_events'
))
OR (indexes.schemaname = 'private' AND indexes.tablename IN (
  'ws01_member_roles', 'ws02_personal_workspaces'
))
ORDER BY indexes.schemaname, indexes.tablename, indexes.indexname;

-- 5. Current activity/wait profile. Query text and user identifiers are omitted.
SELECT
  state,
  wait_event_type,
  wait_event,
  count(*) AS sessions
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event
ORDER BY sessions DESC;

-- 6. Plan the board-list item-count access path. EXPLAIN without ANALYZE does
--    not execute the SELECT or acquire row locks.
EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
SELECT item.board_id, count(*) AS item_count
FROM public.work_board_items item
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND item.archived_at IS NULL
GROUP BY item.board_id;

-- 7. Plan the importer's board-wide active-item lock query. This is a plan only;
--    no FOR UPDATE lock is acquired because ANALYZE is intentionally omitted.
EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
SELECT 1
FROM public.work_board_items item
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND item.archived_at IS NULL
FOR UPDATE;

-- 8. Plan the importer's board-wide value-lock join. This is a plan only;
--    no row locks are acquired because ANALYZE is intentionally omitted.
EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
SELECT 1
FROM public.work_board_item_values value_row
JOIN public.work_board_items item ON item.id = value_row.item_id
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND item.archived_at IS NULL
FOR UPDATE OF value_row;

-- 9. Plan the existing Item-title matching predicate used by import update mode.
EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
SELECT item.id
FROM public.work_board_items item
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND item.group_id = (
    SELECT group_row.id
    FROM public.work_board_groups group_row
    WHERE group_row.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
    ORDER BY group_row.position, group_row.id
    LIMIT 1
  )
  AND lower(btrim(item.title)) = lower(btrim('CP-BIMP-11 CSV Alpha'))
  AND item.archived_at IS NULL
LIMIT 2;

-- 10. Plan the custom-value match predicate used by the importer.
EXPLAIN (COSTS, VERBOSE, FORMAT TEXT)
SELECT value_row.item_id
FROM public.work_board_item_values value_row
WHERE value_row.column_id = '160b2b61-2462-47d6-9e1e-255c648e4b06'::uuid
  AND lower(btrim(coalesce(value_row.value #>> '{}', ''))) = lower(btrim('true'))
ORDER BY value_row.item_id
LIMIT 2;
