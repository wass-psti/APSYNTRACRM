-- Disposable PostgreSQL 17 only. Isolated fake user/session/role fixture; no real accounts/tokens.
\set ON_ERROR_STOP on
\set ON_ERROR_STOP on
DO $tl03e_disposable_only$
BEGIN
 IF current_database() <> 'cp_tl03e_disposable'
 THEN RAISE EXCEPTION 'TL03E_DISPOSABLE_ONLY' USING ERRCODE='42501'; END IF;
END $tl03e_disposable_only$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth,private TO authenticated;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'sub','')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
CREATE OR REPLACE FUNCTION private.wm_board_config_session_active()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE sid text:=auth.jwt()->>'session_id'; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR sid IS NULL OR sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid AND s.user_id=actor
  AND (s.not_after IS NULL OR s.not_after>pg_catalog.now()));
END $function$;
-- Minimal, explicitly synthetic auth and workspace dependencies, not production tables.
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT CASE p_user_id
 WHEN '11111111-1111-4111-8111-111111111111'::uuid THEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 WHEN '55555555-5555-4555-8555-555555555555'::uuid THEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
 ELSE null::uuid END;
$$;
CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT p_module_id='tradelink' AND p_user_id IN (
 '11111111-1111-4111-8111-111111111111'::uuid,
 '55555555-5555-4555-8555-555555555555'::uuid);
$$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT p_user_id='11111111-1111-4111-8111-111111111111'::uuid;
$$;
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p_module_id='tradelink' AND public.is_platform_admin(p_user_id)
 THEN 'General Manager' ELSE 'Employee' END;
$$;
CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,active boolean NOT NULL);
INSERT INTO public.workspace_members VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','55555555-5555-4555-8555-555555555555',true);
CREATE TABLE public.tradelink_vendor_assets(
 workspace_id uuid NOT NULL, vendor_id text NOT NULL,asset_kind text NOT NULL,
 image_data text NOT NULL, revision bigint NOT NULL, updated_by uuid,
 updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(workspace_id,vendor_id,asset_kind));
INSERT INTO public.tradelink_vendor_assets(workspace_id,vendor_id,asset_kind,image_data,revision,updated_by)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic-vendor','logo','data:image/png;base64,YQ==',1,'11111111-1111-4111-8111-111111111111');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',now()+interval '1 day'),
('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',now()+interval '1 day'),
('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555',now()+interval '1 day');
