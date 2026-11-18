\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,platform_role text,status text);
CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,active boolean,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_crm_platform_roles(workspace_id uuid,user_id uuid,role text,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE private.ws02_personal_workspaces(workspace_id uuid,user_id uuid);
CREATE TABLE private.ws01_member_roles(workspace_id uuid,user_id uuid,relation text);
CREATE TABLE public.module_role_assignments(user_id uuid,module_id text,role text,enabled boolean);
CREATE TABLE public.material_request_hub_memberships(workspace_id uuid,user_id uuid,role text,enabled boolean,status text);
CREATE TABLE public.toolbox_issues_memberships(workspace_id uuid,user_id uuid,role text,enabled boolean);
CREATE TABLE public.fueltrans_memberships(workspace_id uuid,user_id uuid,role text,enabled boolean,status text,client_code text);
CREATE TABLE public.work_boards(id uuid,workspace_id uuid,name text,status text);
CREATE TABLE public.work_board_members(board_id uuid,user_id uuid,role text);
CREATE FUNCTION public.current_workspace_id(p_user uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT workspace_id FROM public.workspace_members WHERE user_id=p_user AND active IS TRUE ORDER BY workspace_id LIMIT 1 $$;
CREATE FUNCTION public.apsyntra_role_is_bootstrap() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.apsyntra_crm_role_rank(p_role text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE p_role WHEN 'admin' THEN 3 WHEN 'supervisor' THEN 2 WHEN 'employee' THEN 1 WHEN 'viewer' THEN 0 ELSE NULL END $$;
CREATE FUNCTION public.apsyntra_crm_module_role_rank(p_module text,p_role text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN p_role IS NULL THEN NULL
 WHEN p_role IN ('Admin','ADMIN','admin') THEN 3
 WHEN p_role IN ('APPROVER','WAREHOUSE','supervisor') THEN 2
 WHEN p_role IN ('User','REQUESTOR','employee') THEN 1
 WHEN p_role IN ('Viewer','VIEWER','viewer') THEN 0 ELSE NULL END $$;
INSERT INTO public.profiles VALUES
 ('11111111-1111-4111-8111-111111111111','employee','active'),
 ('22222222-2222-4222-8222-222222222222','employee','active'),
 ('33333333-3333-4333-8333-333333333333','employee','active');
INSERT INTO public.workspace_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',true);
-- Deliberately stale legacy global row: must not grant role in either workspace.
INSERT INTO public.module_role_assignments VALUES
 ('22222222-2222-4222-8222-222222222222','material-request-hub','ADMIN',true),
 ('11111111-1111-4111-8111-111111111111','tradelink','User',true);
INSERT INTO public.material_request_hub_memberships VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','REQUESTOR',true,'active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','VIEWER',false,'disabled');
INSERT INTO public.toolbox_issues_memberships VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','employee',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','admin',false);
INSERT INTO public.fueltrans_memberships VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','watchdog_employee',true,'active',NULL),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','admin',true,'active','client-scoped');

-- A board not directly assigned to the CRM Admin tests workspace admin parity.
INSERT INTO public.work_boards VALUES
 ('77777777-7777-4777-8777-777777777777','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A shared board','active'),
 ('88888888-8888-4888-8888-888888888888','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other workspace board','active');
