\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA private;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p_user_id=auth.uid()
 THEN nullif(current_setting('request.jwt.claim.workspace_id',true),'')::uuid ELSE NULL END
$$;
GRANT USAGE ON SCHEMA public,auth,extensions,private TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),public.current_workspace_id(uuid) TO authenticated;
INSERT INTO public.workspaces VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000002');
