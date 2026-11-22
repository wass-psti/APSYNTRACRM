-- Disposable-only fixture for CP-TT-OJT migrations. Never use against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA extensions;

CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,
 status text NOT NULL
);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email text NOT NULL,
 email_confirmed_at timestamptz
);
CREATE TABLE private.tt_employee_departments(
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 department text NOT NULL,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.test_tt_boards(
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id)
);
CREATE TABLE public.test_module_roles(
 module_id text NOT NULL,
 user_id uuid NOT NULL,
 module_role text NOT NULL,
 PRIMARY KEY(module_id,user_id)
);
CREATE TABLE public.module_state_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 module_id text NOT NULL,
 state_key text NOT NULL,
 scope text NOT NULL,
 owner_key text NOT NULL DEFAULT '*',
 value jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT r.module_role FROM public.test_module_roles r
 WHERE r.module_id=p_module_id AND r.user_id=p_user_id
$$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT b.workspace_id
 FROM public.test_tt_boards b
 JOIN public.workspace_members m ON m.workspace_id=b.workspace_id
 WHERE b.id=p_board_id AND m.user_id=auth.uid() AND m.active
$$;

INSERT INTO public.workspaces(id)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.profiles(id,status) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'),
 ('d613280d-907b-418f-b872-c0f6dd53e580','active'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d613280d-907b-418f-b872-c0f6dd53e580',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES('d613280d-907b-418f-b872-c0f6dd53e580',
 'ojt@watchdogautomation.com.ph',clock_timestamp());
INSERT INTO private.tt_employee_departments(workspace_id,user_id,department)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'd613280d-907b-418f-b872-c0f6dd53e580','OJT');
INSERT INTO public.test_tt_boards(id,workspace_id)
VALUES('46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.test_module_roles(module_id,user_id,module_role) VALUES
 ('time-tracker','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','System Admin'),
 ('time-tracker','d613280d-907b-418f-b872-c0f6dd53e580','Employee'),
 ('time-tracker','ffffffff-ffff-4fff-8fff-ffffffffffff','Employee');

GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
GRANT INSERT ON public.module_state_entries TO authenticated;
