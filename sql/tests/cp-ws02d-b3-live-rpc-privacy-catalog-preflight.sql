-- CP-WS-02D/B3 — production-safe, READ-ONLY RPC privacy catalog preflight.
-- Catalog metadata only. No identities, tokens, membership rows, DDL or DML.
-- A PASS here is source/grant inventory, not a signed-session penetration test.
-- Compare the source fingerprint before ANY separately approved production migration.
WITH target AS (
  SELECT p.oid, p.prosecdef,
         pg_get_userbyid(p.proowner) AS owner_name,
         md5(pg_get_functiondef(p.oid)) AS source_md5
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'has_module_access'
    AND p.prokind = 'f'
    AND pg_get_function_identity_arguments(p.oid) = 'p_module_id text, p_user_id uuid'
), consumers AS (
  SELECT count(*)::integer AS total,
         count(*) FILTER (WHERE p.proname LIKE 'tradelink_%')::integer AS tradelink,
         count(*) FILTER (WHERE p.proname LIKE 'order_intake_%')::integer AS order_intake,
         count(*) FILTER (WHERE p.proname LIKE 'employee_evaluation_%')::integer AS employee_evaluation,
         count(*) FILTER (WHERE p.proname LIKE 'aps_aims_%')::integer AS aps_aims,
         count(*) FILTER (WHERE p.proname LIKE 'timetracker_%')::integer AS timetracker,
         count(*) FILTER (WHERE p.proname LIKE 'module_state_%')::integer AS module_state_helpers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prokind = 'f'
    AND p.proname <> 'has_module_access'
    AND pg_get_functiondef(p.oid) ILIKE '%has_module_access(%'
)
SELECT
  'CP-WS-02D/B3-LIVE-RPC-PRIVACY-CATALOG' AS checkpoint,
  t.source_md5,
  t.owner_name,
  t.prosecdef AS security_definer,
  has_function_privilege('authenticated', t.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', t.oid, 'EXECUTE') AS anon_execute,
  c.total AS source_consumer_count,
  c.tradelink, c.order_intake, c.employee_evaluation, c.aps_aims,
  c.timetracker, c.module_state_helpers,
  c.total - c.tradelink - c.order_intake - c.employee_evaluation
          - c.aps_aims - c.timetracker - c.module_state_helpers AS core_other,
  CASE
    WHEN t.source_md5 <> '3d44e27eed8d67ac223a9c4353d6003a'
      THEN 'SOURCE_DRIFT_REVIEW_REQUIRED'
    WHEN t.owner_name <> 'postgres'
      OR t.prosecdef IS NOT TRUE
      OR has_function_privilege('authenticated', t.oid, 'EXECUTE') IS NOT TRUE
      OR has_function_privilege('anon', t.oid, 'EXECUTE') IS NOT FALSE
      OR c.total <> 45
      THEN 'CATALOG_DRIFT_REVIEW_REQUIRED'
    ELSE 'INVENTORY_MATCH__PRODUCTION_PRIVACY_GUARD_NOT_DEPLOYED'
  END AS result
FROM target t CROSS JOIN consumers c;
