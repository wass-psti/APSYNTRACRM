-- CP-RC03 minimal isolated PostgreSQL 17 fixture. Synthetic identities only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL,display_name text,email text,platform_role text NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL,active boolean NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY);
CREATE TABLE public.module_role_assignments(user_id uuid NOT NULL,module_id text NOT NULL,role text NOT NULL,enabled boolean NOT NULL,assigned_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,module_id));
CREATE TABLE public.material_request_hub_memberships(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active',assigned_by uuid,created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,user_id),
 CHECK(role IN ('ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER')),CHECK(status IN ('active','disabled')));
CREATE TABLE public.work_boards(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,name text NOT NULL,status text NOT NULL DEFAULT 'active',trashed_at timestamptz,archived_at timestamptz);
CREATE TABLE public.work_board_members(board_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,added_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(board_id,user_id));
CREATE TABLE public.apsyntra_role_change_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,proposed_by uuid NOT NULL,operation text NOT NULL,payload jsonb NOT NULL,status text NOT NULL);
CREATE TABLE public.apsyntra_role_change_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,change_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,event text NOT NULL,detail jsonb NOT NULL);
CREATE TABLE public.toolbox_issues_memberships(workspace_id uuid,user_id uuid,enabled boolean,assigned_by uuid,updated_at timestamptz);
CREATE TABLE public.toolbox_issues_activity(workspace_id uuid,entity_type text,entity_id text,actor_user_id uuid,event_type text,detail jsonb);
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT NULLIF(current_setting('app.workspace_id',true),'')::uuid WHERE p_user_id=auth.uid() $$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.apsyntra_role_is_bootstrap() OR p_workspace_id IS NULL
 OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(auth.uid())
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace_id AND m.user_id=auth.uid() AND m.active)
 THEN RAISE EXCEPTION 'Bootstrap role configuration access denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.platform_role='admin_general_manager') $$;
CREATE OR REPLACE FUNCTION public.wm_admin_set_application_role(p_user_id uuid,p_module_id text,p_role text,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN IF p_module_id='material-request-hub' THEN RAISE EXCEPTION 'Legacy global MRH setter must not be called'; END IF; RETURN jsonb_build_object('delegated',true); END $$;
INSERT INTO public.profiles(id,status,display_name,email,platform_role) VALUES
 ('00000000-0000-4000-8000-000000000001','active','Bootstrap admin','bootstrap@example.invalid','admin_general_manager'),
 ('11111111-1111-4111-8111-111111111111','active','Multi-workspace employee','target@example.invalid','employee'),
 ('22222222-2222-4222-8222-222222222222','active','Foreign employee','foreign@example.invalid','employee'),
 ('33333333-3333-4333-8333-333333333333','active','Protected admin','protected@example.invalid','admin_general_manager'),
 ('44444444-4444-4444-8444-444444444444','active','Ordinary employee','ordinary@example.invalid','employee');
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id) VALUES
 ('00000000-0000-4000-8000-000000000001'),('33333333-3333-4333-8333-333333333333');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444',true);
INSERT INTO public.work_boards(id,workspace_id,name) VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Work Management board');
