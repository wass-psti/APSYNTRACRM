-- Isolated PostgreSQL 17 fixture for CP-MAIN-WS-OWNER-ADMIN-01.
-- Synthetic identities and workspace data only. Run in a disposable database.
\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 email text NOT NULL,
 display_name text NOT NULL,
 platform_role text NOT NULL,
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE private.ws02_personal_workspaces(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id),
 provisioned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws01_member_roles(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 relation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.apsyntra_crm_platform_roles(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('admin','supervisor','employee','viewer')),
 assigned_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);

-- Pre-migration implementation copied from the deployed baseline.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT coalesce(
  (SELECT a.role FROM public.apsyntra_crm_platform_roles a
   WHERE a.user_id=p_user AND a.workspace_id=p_workspace),
  CASE p.platform_role WHEN 'admin_general_manager' THEN 'admin'
   WHEN 'hr' THEN 'supervisor' WHEN 'supervisor' THEN 'supervisor'
   ELSE 'employee' END)
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id
 WHERE p.id=p_user AND p.status='active'
  AND wm.workspace_id=p_workspace AND wm.active
 LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_effective_role(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000004'),
 ('10000000-0000-4000-8000-000000000005'),
 ('10000000-0000-4000-8000-000000000006');

INSERT INTO public.workspaces(id,name) VALUES
 ('20000000-0000-4000-8000-000000000001','Main Workspace'),
 ('20000000-0000-4000-8000-000000000002','Work Management'),
 ('20000000-0000-4000-8000-000000000003','Ordinary workspace'),
 ('20000000-0000-4000-8000-000000000004','Mapped non-owner workspace');

INSERT INTO public.profiles(id,email,display_name,platform_role,status) VALUES
 ('10000000-0000-4000-8000-000000000001','owner-main@example.invalid','Main Workspace owner','employee','active'),
 ('10000000-0000-4000-8000-000000000002','invited-main@example.invalid','Main Workspace invitee','employee','active'),
 ('10000000-0000-4000-8000-000000000003','work-management-only@example.invalid','Work Management member','employee','active'),
 ('10000000-0000-4000-8000-000000000004','ordinary-owner@example.invalid','Ordinary workspace owner','employee','active'),
 ('10000000-0000-4000-8000-000000000005','mapped-non-owner@example.invalid','Mapped non-owner','employee','active'),
 ('10000000-0000-4000-8000-000000000006','bootstrap@example.invalid','Designated bootstrap admin','admin_general_manager','active');

INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006',true),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',true),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005',true);

INSERT INTO private.ws02_personal_workspaces(user_id,workspace_id) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000004');

INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','owner'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','member');

-- Simulate a stale lower CRM override: verified personal ownership must still win.
INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','supervisor',
  '10000000-0000-4000-8000-000000000006');
