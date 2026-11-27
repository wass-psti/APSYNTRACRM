-- CP-CRM-PERF-01: repeat before/after a documented workload. SELECT only.
-- Never reset shared pg_stat_statements or enable instrumentation on production.
-- Match counters only when stats_reset and dealloc are unchanged.
WITH named AS (
 SELECT (regexp_match(query,'(?i)(?:public\.|"public"\.)"?([a-z][a-z0-9_]+)"?\s*\('))[1] AS operation,
        calls,total_exec_time
 FROM extensions.pg_stat_statements
), selected AS (
 SELECT operation,sum(calls)::bigint AS calls,
        round(sum(total_exec_time)::numeric,2) AS total_ms
 FROM named
 WHERE operation IN ('wm_list_boards','apsyntra_crm_my_effective_access',
  'wm_auth_access_context','wm_get_board_shell','wm_get_board_items_page',
  'list_module_directory','list_module_state','native_application_board_context',
  'timetracker_clock_snapshot','timetracker_ot_snapshot','tl03_documents_page',
  'fueltrack_v3_read','frt_board_dashboard_safe')
 GROUP BY operation
)
SELECT now() AS observed_at,info.stats_reset,info.dealloc,
 (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS connections,
 (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active') AS active_connections,
 (SELECT coalesce(jsonb_agg(selected ORDER BY total_ms DESC),'[]'::jsonb) FROM selected) AS workload
FROM extensions.pg_stat_statements_info info;
