-- Disposable minimum contracts for isolated PostgreSQL migration/trigger acceptance.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA private;
CREATE TABLE public.work_boards(
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, name text NOT NULL,
  status text NOT NULL, archived_at timestamptz,trashed_at timestamptz);
CREATE TABLE public.work_board_members(
  board_id uuid NOT NULL REFERENCES public.work_boards(id),
  user_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('owner','editor','viewer')),
  added_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(board_id,user_id));
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL,
 active boolean NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY);
CREATE TABLE public.module_role_assignments(
 user_id uuid NOT NULL,module_id text NOT NULL,role text NOT NULL,enabled boolean NOT NULL,
 PRIMARY KEY(user_id,module_id));
CREATE TABLE public.apsyntra_workspace_module_roles(
 workspace_id uuid,user_id uuid,module_id text,role text,enabled boolean,
 PRIMARY KEY(workspace_id,user_id,module_id));
CREATE TABLE public.frt_memberships(
 workspace_id uuid,user_id uuid,role text,enabled boolean,status text,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_crm_platform_roles(
 user_id uuid,workspace_id uuid,role text,PRIMARY KEY(workspace_id,user_id));
CREATE FUNCTION public.is_platform_admin(p_user uuid)
 RETURNS boolean LANGUAGE sql AS $$
 SELECT p_user='77777777-7777-4777-8777-777777777777'::uuid $$;
CREATE FUNCTION public.apsyntra_crm_explicit_role(p_user uuid,p_workspace uuid)
 RETURNS text LANGUAGE sql AS $$
 SELECT role FROM public.apsyntra_crm_platform_roles
 WHERE user_id=p_user AND workspace_id=p_workspace $$;
CREATE FUNCTION public.apsyntra_crm_module_role_rank(p_module text,p_role text)
 RETURNS integer LANGUAGE sql AS $$ SELECT CASE WHEN p_role IN
 ('Employee','REQUESTOR','User') THEN 1 ELSE 3 END $$;
CREATE FUNCTION public.apsyntra_crm_effective_role(p_user uuid,p_workspace uuid)
 RETURNS text LANGUAGE sql AS $$ SELECT 'employee'::text $$;
CREATE FUNCTION public.apsyntra_crm_role_rank(p_role text)
 RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;

INSERT INTO public.work_boards(id,workspace_id,name,status) VALUES
('46bf4ee7-368a-4c35-842c-8593ea1f6ac3','00000000-0000-4000-8000-000000000001','TimeTracker Attendance','active'),
('f36da8fe-8d9d-4629-9938-12533cb3ca39','00000000-0000-4000-8000-000000000001','Fund Released Tracker','active'),
('7af78b3f-67bf-4600-9aa1-9006d19d486e','00000000-0000-4000-8000-000000000001','FuelTrack+ v3','active'),
('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001','TradeLink','active');
INSERT INTO public.profiles VALUES
('11111111-1111-4111-8111-111111111111','active'),
('22222222-2222-4222-8222-222222222222','active'),
('33333333-3333-4333-8333-333333333333','active'),
('44444444-4444-4444-8444-444444444444','active'),
('55555555-5555-4555-8555-555555555555','active'),
('66666666-6666-4666-8666-666666666666','active'),
('77777777-7777-4777-8777-777777777777','active'),
('88888888-8888-4888-8888-888888888888','disabled');
INSERT INTO public.workspace_members
SELECT '00000000-0000-4000-8000-000000000001'::uuid,id,true
FROM public.profiles;
INSERT INTO public.workspace_members VALUES
('00000000-0000-4000-8000-000000000002','44444444-4444-4444-8444-444444444444',true);
INSERT INTO public.module_role_assignments VALUES
('11111111-1111-4111-8111-111111111111','time-tracker','Employee',true),
('11111111-1111-4111-8111-111111111111','fund-released-tracker','REQUESTOR',true),
('11111111-1111-4111-8111-111111111111','fueltrack-plus','User',true),
('11111111-1111-4111-8111-111111111111','tradelink','User',true),
('22222222-2222-4222-8222-222222222222','time-tracker','Employee',true),
('33333333-3333-4333-8333-333333333333','time-tracker','Employee',true),
('44444444-4444-4444-8444-444444444444','time-tracker','Employee',true),
('55555555-5555-4555-8555-555555555555','tradelink','User',true),
('66666666-6666-4666-8666-666666666666','fund-released-tracker','REQUESTOR',true),
('77777777-7777-4777-8777-777777777777','time-tracker','Employee',true),
('88888888-8888-4888-8888-888888888888','time-tracker','Employee',true);
INSERT INTO public.work_board_members(board_id,user_id,role)
VALUES
('46bf4ee7-368a-4c35-842c-8593ea1f6ac3','22222222-2222-4222-8222-222222222222','owner'),
('46bf4ee7-368a-4c35-842c-8593ea1f6ac3','33333333-3333-4333-8333-333333333333','viewer');
INSERT INTO public.apsyntra_workspace_module_roles VALUES
('00000000-0000-4000-8000-000000000001','55555555-5555-4555-8555-555555555555','tradelink','User',false);
INSERT INTO public.frt_memberships VALUES
('00000000-0000-4000-8000-000000000001','66666666-6666-4666-8666-666666666666','REQUESTOR',false,'disabled');
