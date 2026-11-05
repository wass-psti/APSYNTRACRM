-- CP-WS-02D/B3 — production READ-ONLY Auth/RLS/EXECUTE boundary.
-- Catalog metadata ONLY. No user names, email, sessions, credentials or rows.
WITH watched_tables AS (
 SELECT c.oid,n.nspname AS schema_name,c.relname AS table_name,
 c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 has_table_privilege('anon',c.oid,'INSERT') OR
 has_table_privilege('anon',c.oid,'UPDATE') OR
 has_table_privilege('anon',c.oid,'DELETE') AS anon_write_grant,
 has_table_privilege('authenticated',c.oid,'INSERT') OR
 has_table_privilege('authenticated',c.oid,'UPDATE') OR
 has_table_privilege('authenticated',c.oid,'DELETE') AS signed_write_grant
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN('r','p')
 AND n.nspname IN('public','private')
 AND (
 (n.nspname='public' AND (
 c.relname LIKE 'employee_evaluation_%'
 OR c.relname LIKE 'order_intake_%'
 OR c.relname LIKE 'tradelink_%'
 OR c.relname IN('module_state_entries','module_operation_locks',
                 'module_activity_events','module_role_assignments')))
 OR (n.nspname='private' AND c.relname LIKE 'ws02d_%')
 )
), policies AS(
 SELECT schemaname,tablename,count(*) AS policy_count
 FROM pg_policies
 GROUP BY schemaname,tablename
), summaries AS(
 SELECT
 count(*) FILTER(WHERE schema_name='public') AS public_domain_tables,
 count(*) FILTER(WHERE schema_name='public' AND rls_enabled)
  AS public_domain_rls_enabled,
 count(*) FILTER(WHERE schema_name='public' AND NOT rls_enabled)
  AS public_domain_rls_missing,
 count(*) FILTER(WHERE schema_name='public' AND signed_write_grant)
  AS public_domain_signed_write_granted,
 count(*) FILTER(WHERE schema_name='public'
  AND signed_write_grant AND NOT rls_enabled) AS exposed_writable_without_rls,
 count(*) FILTER(WHERE schema_name='public' AND anon_write_grant)
  AS public_domain_anon_write_granted,
 count(*) FILTER(WHERE schema_name='public' AND coalesce(p.policy_count,0)>0)
  AS public_domain_tables_with_policy,
 count(*) FILTER(WHERE schema_name='public' AND coalesce(p.policy_count,0)=0)
  AS public_domain_tables_default_deny,
 count(*) FILTER(WHERE schema_name='private') AS private_ws02d_table_count,
 count(*) FILTER(WHERE schema_name='private'
  AND (signed_write_grant OR anon_write_grant)) AS private_ws02d_client_writable,
 coalesce(jsonb_agg(t.table_name ORDER BY t.table_name)
  FILTER(WHERE schema_name='public' AND signed_write_grant AND NOT rls_enabled),
  '[]'::jsonb) AS exposed_writable_without_rls_names
 FROM watched_tables t
 LEFT JOIN policies p ON p.schemaname=t.schema_name AND p.tablename=t.table_name
), function_checks AS(
 SELECT
 has_function_privilege('authenticated',
 'public.wm_admin_set_application_role(uuid,text,text,boolean)','EXECUTE')
 AS signed_can_directly_mutate_application_roles,
 has_function_privilege('authenticated',
 'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
 AS signed_can_directly_call_internal_attendance,
 has_function_privilege('authenticated',
 'public.charter_admin_set_role(uuid,text,boolean)','EXECUTE')
 AS signed_can_call_charter_role_rpc,
 has_function_privilege('anon',
 'public.charter_admin_set_role(uuid,text,boolean)','EXECUTE')
 AS anon_can_call_charter_role_rpc,
 to_regclass('private.ws02d_invitations') IS NULL
 AND to_regclass('private.ws02d_delivery_receipts') IS NULL
 AND to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 AS ws02d_invite_contract_absent,
 to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
 AND to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 AS ws01_b3_b4_rpc_absent
)
SELECT CASE WHEN public_domain_rls_missing=0
 AND exposed_writable_without_rls=0
 AND public_domain_anon_write_granted=0
 AND private_ws02d_table_count=0
 AND NOT signed_can_directly_mutate_application_roles
 AND NOT signed_can_directly_call_internal_attendance
 AND signed_can_call_charter_role_rpc
 AND NOT anon_can_call_charter_role_rpc
 AND ws02d_invite_contract_absent AND ws01_b3_b4_rpc_absent
 THEN 'WS02D_B3_LIVE_AUTH_RLS_GRANTS_BOUNDARY_VERIFIED'
 ELSE 'WS02D_B3_LIVE_AUTH_RLS_REQUIRES_REVIEW' END AS status,
 summaries.*,function_checks.*
FROM summaries CROSS JOIN function_checks;
