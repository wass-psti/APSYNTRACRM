\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,platform_role text NOT NULL,status text NOT NULL);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,active boolean NOT NULL,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.module_role_assignments(user_id uuid,module_id text,role text,
 enabled boolean NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,module_id));
CREATE TABLE public.apsyntra_crm_platform_roles(workspace_id uuid,user_id uuid,role text,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY);
CREATE TABLE public.apsyntra_role_change_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid,proposed_by uuid,
 operation text,payload jsonb,status text,created_at timestamptz DEFAULT now());
CREATE TABLE public.apsyntra_role_change_audit(
 change_id uuid,workspace_id uuid,actor_id uuid,event text,detail jsonb);
CREATE TABLE private.ws02_personal_workspaces(workspace_id uuid,user_id uuid);
CREATE TABLE private.ws01_member_roles(workspace_id uuid,user_id uuid,relation text);
CREATE TABLE public.material_request_hub_memberships(workspace_id uuid,user_id uuid,
 role text,enabled boolean,status text);
CREATE TABLE public.toolbox_issues_memberships(workspace_id uuid,user_id uuid,
 role text,enabled boolean);
CREATE TABLE public.tool_traceability_memberships(workspace_id uuid,user_id uuid,
 role text,enabled boolean,status text);
CREATE TABLE public.fueltrans_memberships(workspace_id uuid,user_id uuid,
 role text,enabled boolean,status text,client_code text);
CREATE TABLE public.work_boards(id uuid PRIMARY KEY,workspace_id uuid,name text,status text);
CREATE TABLE public.work_board_members(board_id uuid,user_id uuid,role text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('test.actor',true),'')::uuid
$$;
CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
 RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('test.workspace',true),'')::uuid
$$;
CREATE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles
 WHERE id=p_user_id AND platform_role='admin_general_manager')
$$;
CREATE FUNCTION public.apsyntra_crm_explicit_role(uuid,uuid) RETURNS text
 LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.apsyntra_crm_effective_role(uuid,uuid) RETURNS text
 LANGUAGE sql STABLE AS $$ SELECT 'employee'::text $$;
CREATE FUNCTION public.apsyntra_crm_module_role_rank(text,text) RETURNS integer
 LANGUAGE sql STABLE AS $$ SELECT 1 $$;
CREATE FUNCTION public.apsyntra_crm_role_rank(text) RETURNS integer
 LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN $1='admin' THEN 4 WHEN $1='supervisor' THEN 3
             WHEN $1='employee' THEN 2 ELSE 1 END
$$;
CREATE FUNCTION public.apsyntra_role_is_bootstrap() RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF auth.uid() IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid OR
    p_workspace_id IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 THEN RAISE EXCEPTION 'Workspace admin denied' USING ERRCODE='42501'; END IF;
END $$;
INSERT INTO public.workspaces VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO auth.users VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.profiles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin_general_manager','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','employee','active'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','employee','active');
INSERT INTO public.workspace_members VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
INSERT INTO public.apsyntra_role_bootstrap_identities VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','time-tracker','Supervisor',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fueltrack-plus','Admin',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','tradelink','General Manager',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','order-intake','Admin',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','employee-eval','admin',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aps-aims','Administrator',true);
