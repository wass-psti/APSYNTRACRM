-- CP-WS-02D/B3: isolated user-scoped PostgREST + RLS fixture.
-- Not a migration. Never execute on Supabase production.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'gotrue_disposable'
 OR current_setting('server_version_num')::integer<170000
 OR to_regclass('auth.users') IS NULL
 OR to_regclass('auth.sessions') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ws02d_b3_authenticator')
 THEN RAISE EXCEPTION 'Requires fresh isolated GoTrue/PostgreSQL 17 CI';
 END IF;
END $guard$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE ws02d_b3_authenticator LOGIN NOINHERIT
 PASSWORD 'disposable_ws02d_b3_postgrest_only';
GRANT anon,authenticated TO ws02d_b3_authenticator;
GRANT USAGE ON SCHEMA public TO authenticated;

-- GoTrue JWTs are *cryptographically* verified by PostgREST before it sets
-- request.jwt.claims. No user-supplied p_user_id can change the caller.
CREATE FUNCTION auth.uid() RETURNS uuid
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
 AS $func$
 SELECT nullif(
   coalesce(
     nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',''
   ),''
 )::uuid
 $func$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws02d_b3_self_profile ON public.profiles
 FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));
CREATE POLICY ws02d_b3_own_active_workspace ON public.workspace_members
 FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) AND active IS TRUE);
GRANT SELECT ON public.profiles,public.workspace_members TO authenticated;
REVOKE ALL ON public.profiles,public.workspace_members FROM anon;

CREATE TABLE public.ws02d_b3_module_acl(
 user_id uuid NOT NULL, module_id text NOT NULL,
 PRIMARY KEY(user_id,module_id)
);
ALTER TABLE public.ws02d_b3_module_acl ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws02d_b3_acl_self ON public.ws02d_b3_module_acl
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
GRANT SELECT ON public.ws02d_b3_module_acl TO authenticated;

-- Minimal security-invoker snapshot of signed-read contract output; this
-- is NOT the original production SECURITY DEFINER function body.
CREATE FUNCTION public.wm_auth_access_context()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
 AS $rpc$
 SELECT pg_catalog.jsonb_build_object(
   'user_id',p.id,
   'workspace_id',(
      SELECT m.workspace_id
      FROM public.workspace_members m
      WHERE m.user_id=p.id AND m.active
      ORDER BY m.workspace_id LIMIT 1),
   'profile',pg_catalog.jsonb_build_object('status',p.status)
 ) FROM public.profiles p
 WHERE p.id=auth.uid() AND p.status='active'
 AND EXISTS(
   SELECT 1 FROM public.workspace_members m
   WHERE m.user_id=p.id AND m.active);
 $rpc$;

-- Unlike the preexisting production function, this disposable RLS fixture
-- explicitly DENIES cross-principal p_user_id use. This tests the desired
-- safe contract, not an assumption that production already enforces it.
CREATE FUNCTION public.has_module_access(
 p_module_id text,p_user_id uuid DEFAULT NULL
) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
 AS $rpc$
 BEGIN
  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cross-principal module inspection denied'
      USING ERRCODE='42501';
  END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.ws02d_b3_module_acl a
    JOIN public.profiles p ON p.id=a.user_id AND p.status='active'
    WHERE a.user_id=auth.uid() AND a.module_id=p_module_id
    AND EXISTS(
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id=a.user_id AND m.active)
  );
 END $rpc$;

REVOKE ALL ON FUNCTION public.wm_auth_access_context() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.has_module_access(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_auth_access_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(text,uuid) TO authenticated;

DO $verify$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='public.profiles'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='public.workspace_members'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='public.ws02d_b3_module_acl'::regclass)
 OR has_table_privilege('anon','public.profiles','SELECT')
 OR has_table_privilege('anon','public.workspace_members','SELECT')
 OR has_table_privilege('authenticated','public.profiles','INSERT')
 OR has_table_privilege('authenticated','public.profiles','UPDATE')
 OR has_table_privilege('authenticated','public.workspace_members','UPDATE')
 OR has_function_privilege('anon',
  'public.wm_auth_access_context()','EXECUTE')
 OR has_function_privilege('anon',
  'public.has_module_access(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Disposable RLS or RPC permission invariant failed';
 END IF;
 RAISE NOTICE 'WS02D_B3_DISPOSABLE_RLS_CONTRACT_READY';
END $verify$;
