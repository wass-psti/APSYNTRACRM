-- CP19: READ-ONLY comparison of Auth ownership against the actual staging
-- baseline. Never applies roles, privileges, migration versions or Auth writes.
DO $check$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'CP19 Auth preflight requires isolated staging clone';
 END IF;
END $check$;
WITH auth_objects AS (
 SELECT c.relkind,pg_get_userbyid(c.relowner) AS owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='auth' AND c.relkind IN ('r','S')
)
SELECT json_build_object(
 'auth_schema_owner',
 (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='auth'),
 'auth_table_count',count(*) FILTER(WHERE relkind='r'),
 'auth_tables_owned_by_auth_admin',
 count(*) FILTER(WHERE relkind='r' AND owner='supabase_auth_admin'),
 'auth_sequence_count',count(*) FILTER(WHERE relkind='S'),
 'auth_sequences_owned_by_auth_admin',
 count(*) FILTER(WHERE relkind='S' AND owner='supabase_auth_admin'),
 'postgres_can_assume_auth_admin',
 pg_has_role('postgres','supabase_auth_admin','SET'),
 'auth_admin_can_create_auth_objects',
 has_schema_privilege('supabase_auth_admin','auth','CREATE')
)::text
FROM auth_objects;
