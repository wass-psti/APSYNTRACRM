-- Test against disposable CP-RC03 fixture, never production accounts.
\set ON_ERROR_STOP on
-- Real Supabase installs both API roles; the minimal RC03 fixture omits them.
DO $$BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END$$;
CREATE TABLE public.apsyntra_crm_platform_roles (
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,
 PRIMARY KEY(workspace_id,user_id));
CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT coalesce((SELECT r.role FROM public.apsyntra_crm_platform_roles r
 WHERE r.user_id=p_user AND r.workspace_id=p_workspace),
 CASE p.platform_role WHEN 'admin_general_manager' THEN 'admin' ELSE 'employee' END)
 FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id
 WHERE p.id=p_user AND p.status='active' AND m.workspace_id=p_workspace AND m.active LIMIT 1 $$;
\ir ../cp-urm04-crm-admin-parity-CANDIDATE.sql
BEGIN;
DO $verify$
DECLARE
 b uuid:='00000000-0000-4000-8000-000000000001';
 a uuid:='11111111-1111-4111-8111-111111111111';
 e uuid:='44444444-4444-4444-8444-444444444444';
 w uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 foreign_w uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('app.workspace_id',w::text,true);
 IF NOT public.apsyntra_role_is_bootstrap() OR NOT public.apsyntra_role_is_admin() THEN
  RAISE EXCEPTION 'Protected bootstrap account failed normal CRM Admin verification'; END IF;
 PERFORM public.apsyntra_role_require_scope(w);
 INSERT INTO public.apsyntra_crm_platform_roles VALUES(w,a,'admin');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF public.apsyntra_role_is_bootstrap() OR NOT public.apsyntra_role_is_admin() THEN
  RAISE EXCEPTION 'CRM Admin missing or incorrectly identified as bootstrap'; END IF;
 PERFORM public.apsyntra_role_require_scope(w);
 -- Workspace switching must drop the previous workspace administration tier.
 PERFORM set_config('app.workspace_id',foreign_w::text,true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'CRM Admin leaked to foreign workspace'; END IF;
 BEGIN PERFORM public.apsyntra_role_require_scope(foreign_w);
 RAISE EXCEPTION 'Cross-workspace role elevation succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('app.workspace_id',w::text,true);
 BEGIN PERFORM public.apsyntra_role_require_scope(foreign_w);
 RAISE EXCEPTION 'Spoofed workspace target succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 DELETE FROM public.apsyntra_crm_platform_roles WHERE workspace_id=w AND user_id=a;
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Revoked admin still authorized'; END IF;
 BEGIN PERFORM public.apsyntra_role_require_scope(w);
 RAISE EXCEPTION 'Revoked role retained admin scope';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 INSERT INTO public.apsyntra_crm_platform_roles VALUES(w,a,'admin');
 UPDATE public.workspace_members SET active=false WHERE workspace_id=w AND user_id=a;
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Revoked member still admin'; END IF;
 UPDATE public.workspace_members SET active=true WHERE workspace_id=w AND user_id=a;
 PERFORM set_config('request.jwt.claim.sub',e::text,true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Employee has admin privilege'; END IF;
 BEGIN PERFORM public.apsyntra_role_require_scope(w);
 RAISE EXCEPTION 'Employee unexpectedly authorized';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Anonymous admin'; END IF;
 BEGIN PERFORM public.apsyntra_role_require_scope(w);
 RAISE EXCEPTION 'Anonymous administrator authorized';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 RAISE NOTICE 'CP-URM-04 disposable CRM Admin parity, bootstrap identity, isolation, revocation and employee denial PASS';
END $verify$;
ROLLBACK;
