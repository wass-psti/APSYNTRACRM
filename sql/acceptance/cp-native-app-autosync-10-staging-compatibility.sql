-- Read-only nonproduction staging metadata for schema reconciliation.
SELECT c.table_name,c.column_name,c.data_type,c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema='public'
 AND c.table_name IN ('profiles','workspaces','workspace_members')
ORDER BY c.table_name,c.ordinal_position;
SELECT n.nspname AS schema_name,p.proname AS function_name,
 pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private')
ORDER BY n.nspname,p.proname;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,
 count(DISTINCT pol.policyname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policies pol ON pol.schemaname=n.nspname AND pol.tablename=c.relname
WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname IN ('profiles','workspaces','workspace_members')
GROUP BY c.relname,c.relrowsecurity ORDER BY c.relname;
