\set ON_ERROR_STOP on
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL,active boolean NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.frt_memberships(workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,enabled boolean NOT NULL,status text NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_workspace_module_roles(workspace_id uuid NOT NULL,user_id uuid NOT NULL,module_id text NOT NULL,role text NOT NULL,enabled boolean NOT NULL,PRIMARY KEY(workspace_id,user_id,module_id));
CREATE TABLE public.module_role_assignments(user_id uuid NOT NULL,module_id text NOT NULL,role text NOT NULL,enabled boolean NOT NULL,PRIMARY KEY(user_id,module_id));
INSERT INTO public.profiles VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','disabled');
INSERT INTO public.workspace_members VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
INSERT INTO public.frt_memberships VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','REQUESTOR',true,'active'),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','FINANCE_MANAGER',false,'disabled'),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','REQUESTOR',true,'active');
INSERT INTO public.module_role_assignments VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fund-released-tracker','GENERAL_MANAGER',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','time-tracker','Employee',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fund-released-tracker','GENERAL_MANAGER',true);
INSERT INTO public.apsyntra_workspace_module_roles VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fund-released-tracker','FINANCE_APPROVER',true),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tradelink','User',true);
