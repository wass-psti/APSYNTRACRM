-- CP-WS-01B disposable PostgreSQL 17 fixture only. No real users or secrets.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth,private TO authenticated;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email_confirmed_at timestamptz DEFAULT now(),
 is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 not_after timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
 AS $$ SELECT pg_catalog.jsonb_build_object('session_id',
  nullif(current_setting('request.jwt.claim.session_id',true),'')) $$;
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.workspaces(
 id uuid PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.work_boards(
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 name text NOT NULL
);
CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $initial$
 SELECT m.workspace_id FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active IS TRUE AND p.status='active'
 ORDER BY m.created_at ASC LIMIT 1;
$initial$;
CREATE FUNCTION private.wm_board_config_session_active() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $guard$
DECLARE actor uuid:=auth.uid();sid text:=auth.jwt()->>'session_id';
BEGIN
 IF actor IS NULL OR sid IS NULL OR sid !~
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid
  AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now()));
END $guard$;
-- Disposable fixture introspection only: return booleans, not tokens or PII.
-- All underlying checks run as the same definer context as staged RPCs.
CREATE FUNCTION public.ws01_fixture_auth_diagnostics() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $diagnostics$
 SELECT pg_catalog.jsonb_build_object(
  'actor_present',auth.uid() IS NOT NULL,
  'session_claim_present',auth.jwt()->>'session_id' IS NOT NULL,
  'signed_session_guard',private.wm_board_config_session_active(),
  'active_profile',EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.status='active'),
  'active_membership',EXISTS(SELECT 1 FROM public.workspace_members m
    WHERE m.user_id=auth.uid() AND m.active IS TRUE))
$diagnostics$;
REVOKE ALL ON FUNCTION public.ws01_fixture_auth_diagnostics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ws01_fixture_auth_diagnostics() TO authenticated;

CREATE FUNCTION public.ws01_fixture_visible_boards() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $boards$
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',b.id,'name',b.name) ORDER BY b.name),'[]'::jsonb)
 FROM public.work_boards b
 WHERE b.workspace_id=public.current_workspace_id(auth.uid());
$boards$;
REVOKE ALL ON FUNCTION public.ws01_fixture_visible_boards() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ws01_fixture_visible_boards() TO authenticated;

INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.profiles(id,status)
 SELECT id,'active' FROM auth.users;
INSERT INTO public.workspaces(id,name) VALUES
 ('00000000-0000-4000-8000-000000000001','Main Workspace'),
 ('00000000-0000-4000-8000-000000000002','Foreign Workspace');
INSERT INTO public.workspace_members(workspace_id,user_id,active,created_at) VALUES
 ('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'2026-01-01'),
 ('00000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'2026-01-02'),
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,'2026-01-03'),
 ('00000000-0000-4000-8000-000000000002','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,'2026-01-04'),
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true,'2026-01-05');
INSERT INTO public.work_boards(id,workspace_id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','Private Main Board'),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000002','Private Foreign Board');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL),
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL),
 ('cccccccc-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc',NULL),
 ('cccccccc-0000-4000-8000-000000000002','cccccccc-cccc-4ccc-8ccc-cccccccccccc',NULL),
 ('dddddddd-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL);
