-- CP-DB-CPU-14 — read-only database workload/resource baseline.
-- Run only against the existing WatchdogWorkspace Supabase project.
-- This transaction is explicitly read-only. It does not reset statistics,
-- execute EXPLAIN ANALYZE, mutate data/schema/configuration, or install extensions.
BEGIN TRANSACTION READ ONLY;

-- 1. Database-wide counters and relevant runtime settings.
SELECT now() AS captured_at,
       current_database() AS database_name,
       pg_postmaster_start_time() AS postmaster_started_at,
       d.xact_commit,d.xact_rollback,d.blks_hit,d.blks_read,
       d.temp_files,d.temp_bytes,d.deadlocks,
       current_setting('max_connections') AS max_connections,
       current_setting('work_mem') AS work_mem,
       current_setting('statement_timeout') AS statement_timeout,
       current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_session_timeout,
       current_setting('autovacuum') AS autovacuum
FROM pg_stat_database d
WHERE d.datname=current_database();

-- 2. Connections by server application/backend/state; count active waits
-- separately from idle ClientRead waits.
SELECT coalesce(application_name,'(none)') AS application_name,
       backend_type,state,wait_event_type,wait_event,count(*) AS sessions
FROM pg_stat_activity
WHERE datname=current_database()
GROUP BY application_name,backend_type,state,wait_event_type,wait_event
ORDER BY sessions DESC,application_name;

-- 3. Longest-running active sessions only; no idle client waits are counted.
SELECT pid,application_name,backend_type,state,wait_event_type,wait_event,
       round((extract(epoch FROM now()-query_start)*1000)::numeric,1) AS query_age_ms,
       left(regexp_replace(query,'[[:space:]]+',' ','g'),180) AS normalized_query_prefix
FROM pg_stat_activity
WHERE datname=current_database() AND state='active'
ORDER BY query_start;

-- 4. Cumulative application RPC statement statistics. These counters are
-- cumulative since the extension's last reset and must not be called a 24h rate.
SELECT queryid,calls,round(total_exec_time::numeric,2) AS total_exec_ms,
       round(mean_exec_time::numeric,2) AS mean_exec_ms,rows,
       shared_blks_hit,shared_blks_read,temp_blks_written,
       left(regexp_replace(query,'[[:space:]]+',' ','g'),260) AS normalized_query
FROM extensions.pg_stat_statements
WHERE query ILIKE '%wm_auth_access_context%'
   OR query ILIKE '%wm_list_boards%'
   OR query ILIKE '%wm_get_board_shell%'
   OR query ILIKE '%wm_get_board_items_page%'
   OR query ILIKE '%apsyntra_crm_my_effective_access%'
   OR query ILIKE '%apsyntra_role_is_admin%'
   OR query ILIKE '%apsyntra_role_is_bootstrap%'
ORDER BY total_exec_time DESC;

-- 5. Cumulative table scan counters for the largest relevant board tables.
SELECT schemaname,relname,n_live_tup,n_dead_tup,seq_scan,seq_tup_read,
       idx_scan,idx_tup_fetch,last_analyze,last_autoanalyze
FROM pg_stat_user_tables
WHERE (schemaname,relname) IN (
 ('public','work_board_items'),
 ('public','work_board_item_values'),
 ('public','work_board_events'),
 ('public','work_boards'),
 ('public','work_board_members')
)
ORDER BY n_live_tup DESC;

-- 6. Largest currently unindexed foreign-key candidates. This is an inventory,
-- not an instruction to create indexes; check actual predicates and plans first.
WITH fk AS (
 SELECT con.oid,n.nspname AS schema_name,c.relname AS table_name,
        con.conname,array_agg(a.attname ORDER BY k.ord) AS fk_columns,
        cardinality(con.conkey) AS fk_column_count,c.oid AS table_oid
 FROM pg_constraint con
 JOIN pg_class c ON c.oid=con.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum,ord) ON true
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
 WHERE con.contype='f' AND n.nspname IN ('public','private')
 GROUP BY con.oid,n.nspname,c.relname,con.conname,c.oid
), missing AS (
 SELECT fk.* FROM fk
 WHERE NOT EXISTS (
  SELECT 1 FROM pg_index ix
  WHERE ix.indrelid=fk.table_oid AND ix.indisvalid AND ix.indisready
    AND ix.indnkeyatts>=fk.fk_column_count
    AND (SELECT array_agg(x.attnum::smallint ORDER BY x.ord)
         FROM unnest(ix.indkey) WITH ORDINALITY x(attnum,ord)
         WHERE x.ord<=fk.fk_column_count) =
        (SELECT array_agg(k.attnum::smallint ORDER BY k.ord)
         FROM unnest((SELECT conkey FROM pg_constraint WHERE oid=fk.oid))
              WITH ORDINALITY k(attnum,ord))
 )
)
SELECT m.schema_name,m.table_name,m.conname,m.fk_columns,
       coalesce(s.n_live_tup,0) AS estimated_live_rows,
       coalesce(s.seq_scan,0) AS cumulative_seq_scans,
       coalesce(s.idx_scan,0) AS cumulative_index_scans,
       pg_size_pretty(pg_total_relation_size(m.table_oid)) AS total_size
FROM missing m
LEFT JOIN pg_stat_user_tables s ON s.relid=m.table_oid
ORDER BY coalesce(s.n_live_tup,0) DESC,pg_total_relation_size(m.table_oid) DESC
LIMIT 50;

-- 7. Duplicate unique-index candidate inventory; do not drop either index
-- until constraint ownership, dependencies, and workload are reviewed.
SELECT i.schemaname,i.tablename,i.indexname,i.indexdef,
       coalesce(s.idx_scan,0) AS cumulative_scans,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
       c.conname AS owning_constraint
FROM pg_indexes i
LEFT JOIN pg_stat_user_indexes s
  ON s.schemaname=i.schemaname AND s.relname=i.tablename AND s.indexrelname=i.indexname
LEFT JOIN pg_constraint c ON c.conindid=s.indexrelid
WHERE i.schemaname='public'
  AND i.indexname IN (
   'material_tracker_materials_workspace_active_name_uidx',
   'material_tracker_materials_workspace_active_name_uq'
  )
ORDER BY i.indexname;

ROLLBACK;
