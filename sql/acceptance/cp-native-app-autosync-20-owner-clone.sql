-- Verify authoritative staging owner topology; never modify any object.
DO $check$
BEGIN
 IF current_database()<>'cp_native20_owner_clone' THEN
  RAISE EXCEPTION 'CP20 test must run in isolated owner clone';
 END IF;
 IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='auth')
    <>'supabase_admin' THEN
  RAISE EXCEPTION 'Auth schema owner differs from staging';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='auth' AND c.relkind='r'
     AND pg_get_userbyid(c.relowner)='supabase_auth_admin')<>27 THEN
  RAISE EXCEPTION 'Staging Auth table owner topology differs';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='auth' AND c.relkind='S'
     AND pg_get_userbyid(c.relowner)='supabase_auth_admin')<>1 THEN
  RAISE EXCEPTION 'Staging Auth sequence owner topology differs';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users) THEN
  RAISE EXCEPTION 'Unexpected real user records in schema-only clone';
 END IF;
END $check$;
SELECT 'PASS: staging Auth schema, 27 tables and one sequence preserve owner names';
