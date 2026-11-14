-- CP-DB-CPU-10: signed workload and bounded importer post-run verification.
-- READ ONLY: every statement is SELECT. No statistics reset or configuration change.

-- 1. Measurement configuration and statistics window.
SELECT
  now() AS captured_at,
  current_setting('server_version') AS server_version,
  pg_postmaster_start_time() AS database_start,
  (SELECT stats_reset FROM extensions.pg_stat_statements_info) AS pgss_stats_reset,
  current_setting('pg_stat_statements.track', true) AS pgss_track,
  current_setting('track_functions', true) AS track_functions,
  current_setting('track_io_timing', true) AS track_io_timing,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_kcache') AS pg_stat_kcache_installed;

-- 2. Top-level statement counters for effective access, board listing, and importer.
SELECT
  statement.queryid,
  statement.calls,
  round(statement.total_exec_time::numeric, 3) AS total_exec_ms,
  round(statement.mean_exec_time::numeric, 3) AS mean_exec_ms,
  round(statement.max_exec_time::numeric, 3) AS max_exec_ms,
  statement.rows,
  statement.shared_blks_hit,
  statement.shared_blks_read,
  statement.temp_blks_written
FROM extensions.pg_stat_statements statement
WHERE statement.queryid IN (
  -8551254353028248045, -- wm_list_boards
   5962890455400465064, -- wm_import_board_wizard_extended_atomic
   3194171109028220051  -- apsyntra_crm_my_effective_access
)
ORDER BY statement.queryid;

-- 3. CP-DB-CPU-10 synthetic items retained on the dedicated nonproduction QA board.
SELECT
  count(*) FILTER (WHERE item.archived_at IS NULL) AS active_board_items,
  count(*) FILTER (WHERE item.title LIKE 'CP-DB-CPU-10 Signed Import %'
                    AND item.archived_at IS NULL) AS signed_three_row_items,
  count(*) FILTER (WHERE item.title LIKE 'CP-DB-CPU-10 Bulk %'
                    AND item.archived_at IS NULL) AS signed_twenty_five_row_items
FROM public.work_board_items item
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid;

-- 4. Mapped cell persistence for both CP-10 batches.
SELECT
  count(*) AS mapped_cells,
  count(DISTINCT value_row.item_id) AS distinct_imported_items,
  count(DISTINCT value_row.column_id) AS mapped_columns,
  count(*) FILTER (WHERE item.title LIKE 'CP-DB-CPU-10 Signed Import %') AS first_batch_cells,
  count(*) FILTER (WHERE item.title LIKE 'CP-DB-CPU-10 Bulk %') AS second_batch_cells
FROM public.work_board_item_values value_row
JOIN public.work_board_items item ON item.id = value_row.item_id
WHERE item.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND (item.title LIKE 'CP-DB-CPU-10 Signed Import %'
       OR item.title LIKE 'CP-DB-CPU-10 Bulk %');

-- 5. Audit summary for the two bounded import runs.
SELECT
  event.event_type,
  count(*) AS event_count,
  min(event.created_at) AS first_event,
  max(event.created_at) AS last_event,
  max((event.payload->>'created')::integer)
    FILTER (WHERE event.event_type = 'items.imported.wizard') AS max_created_in_summary
FROM public.work_board_events event
WHERE event.board_id = 'e1071df3-1b0d-43c0-8aa0-732c09032df4'::uuid
  AND event.event_type IN ('item.cell_updated', 'items.imported.wizard')
  AND event.created_at >= timestamptz '2026-11-14 09:38:00+00'
  AND event.created_at < timestamptz '2026-11-14 09:46:00+00'
GROUP BY event.event_type
ORDER BY event.event_type;

-- 6. Current activity and wait profile (no query text or user identifiers).
SELECT
  state,
  wait_event_type,
  wait_event,
  count(*) AS sessions
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event
ORDER BY sessions DESC;
