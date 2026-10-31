-- Disposable PostgreSQL 17 fixture ONLY; never run against live WatchdogWorkspace.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 platform_role text NOT NULL,
 status text NOT NULL DEFAULT 'active');
CREATE TABLE public.workspace_members(
 workspace_id uuid REFERENCES public.workspaces(id),
 user_id uuid REFERENCES public.profiles(id),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE TABLE public.module_role_assignments(
 user_id uuid REFERENCES auth.users(id),
 module_id text NOT NULL,
 role text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(user_id,module_id));
CREATE TABLE public.work_boards(
 id uuid PRIMARY KEY,
 workspace_id uuid REFERENCES public.workspaces(id));
CREATE TABLE public.work_board_members(
 board_id uuid REFERENCES public.work_boards(id),
 user_id uuid REFERENCES auth.users(id),
 role text NOT NULL,
 PRIMARY KEY(board_id,user_id));
CREATE TABLE public.apsyntra_role_change_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 proposed_by uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL);
CREATE TABLE public.apsyntra_role_change_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 change_id uuid NOT NULL REFERENCES public.apsyntra_role_change_requests(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 event text NOT NULL,
 detail jsonb NOT NULL);

CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT workspace_id FROM public.workspace_members
 WHERE user_id=p_user AND active ORDER BY workspace_id LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p
 WHERE p.id=p_user AND p.platform_role='admin_general_manager' AND p.status='active');
$$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=auth.uid())
  OR public.current_workspace_id(auth.uid()) IS DISTINCT FROM p_workspace_id
 THEN RAISE EXCEPTION 'Bootstrap scope denied' USING ERRCODE='42501'; END IF;
END;
$$;

INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-00000000000a'),
 ('00000000-0000-4000-8000-00000000000b'),
 ('00000000-0000-4000-8000-00000000000c');
INSERT INTO public.workspaces(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,platform_role,status) VALUES
 ('00000000-0000-4000-8000-00000000000a','admin_general_manager','active'),
 ('00000000-0000-4000-8000-00000000000b','employee','active'),
 ('00000000-0000-4000-8000-00000000000c','employee','active');
INSERT INTO public.workspace_members(workspace_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000a'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000b'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-00000000000c');
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id)
 VALUES ('00000000-0000-4000-8000-00000000000a');
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled) VALUES
 ('00000000-0000-4000-8000-00000000000b','fund-released-tracker','FINANCE_MANAGER',true);
INSERT INTO public.work_boards(id,workspace_id) VALUES
 ('00000000-0000-4000-8000-00000000000d','00000000-0000-4000-8000-000000000001');
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-00000000000d','00000000-0000-4000-8000-00000000000b','owner');
