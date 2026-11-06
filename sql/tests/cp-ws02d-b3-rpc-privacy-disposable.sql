-- CP-WS-02D/B3 — genuine PostgreSQL 17 disposable RPC privacy regression.
-- Synthetic accounts only. No public network, production data, secrets or writes.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'ws02d_privacy_disposable'
 OR current_setting('server_version_num')::integer<170000
 OR to_regnamespace('auth') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated'))
 THEN RAISE EXCEPTION 'Fresh disposable PostgreSQL 17 only'; END IF;
END $guard$;
BEGIN;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public,auth TO authenticated;

CREATE FUNCTION auth.uid() RETURNS uuid
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
 AS $f$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 $f$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.workspace_members(
 user_id uuid NOT NULL,workspace_id uuid NOT NULL,active boolean NOT NULL
);
CREATE TABLE public.module_role_assignments(
 user_id uuid NOT NULL,module_id text NOT NULL,enabled boolean NOT NULL
);
INSERT INTO public.profiles VALUES
 ('11111111-1111-4111-8111-111111111111','active'),
 ('22222222-2222-4222-8222-222222222222','active');
INSERT INTO public.workspace_members VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO public.module_role_assignments VALUES
 ('11111111-1111-4111-8111-111111111111','time-tracker',true),
 ('22222222-2222-4222-8222-222222222222','tradelink',true);

CREATE FUNCTION public.current_workspace_id(p_user_id uuid) RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT w.workspace_id FROM public.workspace_members w
 WHERE w.user_id=p_user_id AND w.active LIMIT 1
 $f$;
CREATE FUNCTION public.apsyntra_crm_explicit_role(p_user_id uuid,p_workspace_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT 'Member'::text WHERE EXISTS(
  SELECT 1 FROM public.workspace_members w WHERE w.user_id=p_user_id
   AND w.workspace_id=p_workspace_id AND w.active)
 $f$;
CREATE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT 'USER'::text WHERE EXISTS (
  SELECT 1 FROM public.module_role_assignments a
  WHERE a.user_id=p_user_id AND a.module_id=p_module_id AND a.enabled)
 $f$;
CREATE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT false
 $f$;

-- Synthetic replica of the LIVE pre-hardening function, not a fake mock
-- return value. It must demonstrate the exact cross-principal exposure.
CREATE FUNCTION public.has_module_access(
 p_module_id text,p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT p_user_id IS NOT NULL
  AND public.current_workspace_id(p_user_id) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.status='active')
  AND (
   CASE WHEN p_module_id IN (
     'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
     'fund-released-tracker','fueltrans','order-intake','tool-traceability',
     'material-request-hub','aps-aims','employee-eval','charter-navigator')
    AND public.apsyntra_crm_explicit_role(
       p_user_id,public.current_workspace_id(p_user_id)) IS NOT NULL
   THEN public.module_role_for(p_module_id,p_user_id) IS NOT NULL
   ELSE public.is_platform_admin(p_user_id) OR EXISTS(
    SELECT 1 FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
   END
  );
$function$;
REVOKE ALL ON FUNCTION public.has_module_access(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(text,uuid) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $baseline$
BEGIN
 IF public.has_module_access('time-tracker') IS DISTINCT FROM true
 OR public.has_module_access('time-tracker',auth.uid()) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Original authorized self read must pass'; END IF;
 IF public.has_module_access('tradelink',
     '22222222-2222-4222-8222-222222222222'::uuid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Baseline cross-principal regression not reproduced'; END IF;
 RAISE NOTICE 'WS02D_B3_BASELINE_CROSS_PRINCIPAL_INFORMATION_EXPOSURE_REPRODUCED';
END $baseline$;
RESET ROLE;

-- Source candidate is guarded against any non-disposable database.
\i sql/cp-ws02d-b3-rpc-privacy-disposable-candidate.sql

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $actor_one$
BEGIN
 IF public.has_module_access('time-tracker') IS DISTINCT FROM true
 OR public.has_module_access('time-tracker',auth.uid()) IS DISTINCT FROM true
 OR public.has_module_access('tradelink',auth.uid()) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Self reads changed after privacy guard'; END IF;
 IF public.has_module_access('tradelink',
    '22222222-2222-4222-8222-222222222222'::uuid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Foreign entitlement still inspectable'; END IF;
END $actor_one$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $actor_two$
BEGIN
 IF public.has_module_access('tradelink') IS DISTINCT FROM true
 OR public.has_module_access('tradelink',auth.uid()) IS DISTINCT FROM true
 OR public.has_module_access('time-tracker') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Other signed actor self reads invalid'; END IF;
 IF public.has_module_access('time-tracker',
     '11111111-1111-4111-8111-111111111111'::uuid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Reverse cross-principal entitlement still inspectable'; END IF;
END $actor_two$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $anonymous_claim$
BEGIN
 IF public.has_module_access('tradelink',
      '22222222-2222-4222-8222-222222222222'::uuid) IS DISTINCT FROM false
 OR public.has_module_access('tradelink') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Missing signed identity not denied'; END IF;
END $anonymous_claim$;
RESET ROLE;
DO $privileges$
BEGIN
 IF has_function_privilege('anon','public.has_module_access(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
      'public.has_module_access(text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Function grants unexpectedly changed'; END IF;
END $privileges$;
ROLLBACK;
\echo 'WS02D_B3_RPC_PRIVACY_DISPOSABLE_PASS baseline_exposure=REPRODUCED self_reads=PASS foreign_denial=PASS unsigned_denial=PASS grants=PRESERVED production_requests=0 production_writes=0'
