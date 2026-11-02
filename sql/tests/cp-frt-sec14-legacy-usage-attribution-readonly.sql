-- CP-FRT-SEC14 legacy read-RPC historical attribution: READ ONLY.
-- Run against production only when needed; no telemetry installation,
-- reset, GRANT, REVOKE, session tokens, or financial record access.
-- pg_stat_statements is historical and has NO per-call origin or timestamp.
-- A match on PostgREST-generated SQL proves RPC execution via PostgREST,
-- NOT the exact app, end user, or time of the HTTP request.
WITH stats AS (
 SELECT r.rolname AS db_role, s.calls,
  CASE
   WHEN position('"public"."frt_list_requests"' in s.query)>0
    THEN 'frt_list_requests'
   WHEN position('"public"."frt_dashboard"' in s.query)>0
    THEN 'frt_dashboard'
   WHEN position('"public"."frt_get_request"' in s.query)>0
    THEN 'frt_get_request'
   ELSE NULL
  END AS rpc_name,
  (left(ltrim(s.query),17) = 'WITH pgrst_source') AS postgrest_generated
 FROM extensions.pg_stat_statements s
 JOIN pg_roles r ON r.oid=s.userid
 WHERE r.rolname='authenticated'
)
SELECT pg_catalog.jsonb_build_object(
 'checkpoint','CP-FRT-SEC14-LEGACY-CONSUMER-HISTORY',
 'reportType','AGGREGATED_READ_ONLY',
 'statisticsResetUtc',(SELECT stats_reset FROM extensions.pg_stat_statements_info),
 'postgrestCalls',COALESCE((SELECT pg_catalog.jsonb_object_agg(
     rpc_name,total_calls ORDER BY rpc_name)
    FROM (SELECT rpc_name, sum(calls) AS total_calls FROM stats
     WHERE rpc_name IS NOT NULL AND postgrest_generated
     GROUP BY rpc_name) x), '{}'::jsonb),
 'nonPostgrestMentions',COALESCE((SELECT sum(calls) FROM stats
  WHERE rpc_name IS NOT NULL AND NOT postgrest_generated),0),
 'clientIdentity','NOT_AVAILABLE_FROM_PG_STAT_STATEMENTS',
 'lastUsedAt','NOT_AVAILABLE_FROM_PG_STAT_STATEMENTS',
 'externalCompatibility','NOT_VERIFIED',
 'permissionChangesAttempted',0
) AS legacy_consumer_history;
