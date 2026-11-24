-- Disposable only: model existing workspace/module helper contracts.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.fixture_access(user_id uuid PRIMARY KEY,workspace_id uuid NOT NULL,allowed boolean NOT NULL);
CREATE FUNCTION public.current_workspace_id(actor uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT workspace_id FROM public.fixture_access WHERE user_id=actor
$$;
CREATE FUNCTION public.has_module_access(module text,actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT coalesce((SELECT allowed FROM public.fixture_access WHERE user_id=actor),false) AND module='order-intake'
$$;
INSERT INTO public.workspaces VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
