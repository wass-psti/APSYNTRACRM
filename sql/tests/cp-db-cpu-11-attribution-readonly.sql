-- CP-DB-CPU-11: read-only CPU-attribution feasibility and importer contention snapshot.
-- READ ONLY: SELECT statements only. No settings, extensions, stats, locks, or data are changed.
-- Cumulative counters must be interpreted with the recorded statistics reset timestamp.

-- 1. Platform, instrumentation settings, installed/available extensions, and reset window.
SELECT
  now() AS captured_at,
  current_setting('server_version') AS server_version,
  pg_postmaster_start_time() AS database_start,
  current_setting('pg_stat_statements.track', true) AS pgss_track,
  current_setting('pg_stat_statements.track_planning', true) AS pgss_track_planning,
  current_setting('pg_stat_statements.max', true) AS pgss_max,
  current_setting('track_functions', true) AS track_functions,
  current_setting('track_io_timing', true) AS track_io_timing,
  current_setting('shared_preload_libraries', true) AS shared_preload_libraries,
  (SELECT stats_reset FROM extensions.pg_stat_statements_info) AS pgss_stats_reset,
  (SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements') AS pgss_installed_version,
  (SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_monitor') AS pgsm_installed_version,
  (SELECT default_version FROM pg_available_extensions WHERE name = 'pg_stat_monitor') AS pgsm_available_version,
  (SELECT default_version FROM pg_available_extensions WHERE name = 'pg_stat_kcache') AS kcache_available_version;

-- 2. Cumulative top-level statement elapsed-time and buffer counters.
--    These are not CPU time and are not attributable to a specific signed actor.
SELECT
  statement.queryid,
  role.rolname AS database_role,
  statement.calls,
  round(statement.total_exec_time::numeric, 2) AS total_exec_ms,
  round(statement.mean_exec_time::numeric, 3) AS mean_exec_ms,
  round(statement.max_exec_time::numeric, 2) AS max_exec_ms,
  statement.rows,
  statement.shared_blks_hit,
  statement.shared_blks_read,
  statement.temp_blks_written,
  statement.temp_blks_read
FROM extensions.pg_stat_statements AS statement
LEFT JOIN pg_roles AS role ON role.oid = statement.userid
WHERE statement.queryid IN (
  -8551254353028248045, -- wm_list_boards
   5962890455400465064, -- wm_import_board_wizard_extended_atomic
   3194171109028220051  -- apsyntra_crm_my_effective_access
)
ORDER BY statement.total_exec_time DESC;

-- 3. Function counters, retained only as historical/cumulative evidence.
--    When track_functions=none, do not interpret these as current request measurements.
SELECT
  functions.schemaname,
  functions.funcname,
  functions.calls,
  round(functions.total_time::numeric, 3) AS total_time_ms,
  round(functions.self_time::numeric, 3) AS self_time_ms
FROM pg_stat_user_functions AS functions
WHERE functions.funcname IN (
  'apsyntra_crm_my_effective_access',
  'wm_list_boards',
  'wm_import_board_wizard_extended_atomic',
  'current_workspace_id',
  'apsyntra_role_is_bootstrap'
)
ORDER BY functions.total_time DESC;

-- 4. Database-wide contention counters. Temporary bytes and deadlocks are cumulative
--    since the database statistics reset and are not importer-specific.
SELECT
  now() AS captured_at,
  stats.datname,
  stats.deadlocks,
  stats.temp_files,
  stats.temp_bytes,
  (SELECT count(*) FROM pg_stat_activity activity
   WHERE activity.datname = stats.datname AND activity.state = 'active') AS active_sessions,
  (SELECT count(*) FROM pg_stat_activity activity
   WHERE activity.datname = stats.datname AND activity.state = 'active'
     AND activity.wait_event_type IS NOT NULL) AS active_waiting_sessions,
  (SELECT count(*) FROM pg_stat_activity activity
   WHERE activity.datname = stats.datname
     AND cardinality(pg_blocking_pids(activity.pid)) > 0) AS blocked_sessions
FROM pg_stat_database AS stats
WHERE stats.datname = current_database();

-- 5. Active wait profile only. Client idle waits are intentionally excluded.
SELECT
  activity.wait_event_type,
  activity.wait_event,
  count(*) AS active_sessions
FROM pg_stat_activity AS activity
WHERE activity.datname = current_database()
  AND activity.state = 'active'
GROUP BY activity.wait_event_type, activity.wait_event
ORDER BY active_sessions DESC;
