-- CP-TT-ADMIN-MANUAL-ATTENDANCE-HYBRID: PostgreSQL 17 disposable fixture only.
-- Run after cp-tt-auto-clockout-02 setup and the employee-department base migration.
-- NEVER run this fixture against production.
\set ON_ERROR_STOP on

-- Minimal auth.users columns used by the real employee eligibility and
-- workspace-provisioning functions in this isolated test database.
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email text UNIQUE,
 email_confirmed_at timestamptz,
 is_anonymous boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous)
SELECT id,email,clock_timestamp(),false FROM public.profiles
ON CONFLICT(id) DO NOTHING;

-- Match the pg_cron columns and alter_job contract inspected by the production
-- isolated-scheduler activation procedure.
ALTER TABLE cron.job
 ADD COLUMN database text NOT NULL DEFAULT current_database(),
 ADD COLUMN username text NOT NULL DEFAULT current_user;
CREATE FUNCTION cron.alter_job(job_id bigint,active boolean)
RETURNS void LANGUAGE sql
AS $$ UPDATE cron.job SET active=$2 WHERE cron.job.jobid=$1 $$;

-- The regular scheduler eligibility predicate excludes the shared OJT account.
-- This empty table is deliberately separate from regular employee attendance.
CREATE TABLE private.tt_ojt_shared_accounts(
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 shared_user_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 updated_by uuid,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,board_id,shared_user_id)
);
INSERT INTO cron.job(jobname,schedule,command,active)
VALUES('tt-ojt-auto-clockout-9h','30 seconds',
 'SELECT private.tt_process_ojt_auto_clockouts();',true)
ON CONFLICT(jobname) DO NOTHING;

-- Workspace provisioning prerequisites used by the current-main scope migration.
-- These are test doubles for unrelated provisioning services; attendance and
-- scheduler functions under test are the repository migrations themselves.
CREATE TABLE IF NOT EXISTS public.workspaces(id uuid PRIMARY KEY);
INSERT INTO public.workspaces(id)
VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.apsyntra_crm_platform_roles
 ADD COLUMN IF NOT EXISTS assigned_by uuid;

CREATE TABLE private.ws02_new_account_admissions(
 user_id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE private.ws02_personal_workspaces(
 user_id uuid PRIMARY KEY,workspace_id uuid NOT NULL);
CREATE TABLE private.ws01_member_roles(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,relation text NOT NULL,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_workspace_module_roles(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,module_id text NOT NULL,
 role text NOT NULL,enabled boolean NOT NULL DEFAULT true,assigned_by uuid,
 PRIMARY KEY(workspace_id,user_id,module_id));
CREATE TABLE public.module_role_assignments(
 user_id uuid NOT NULL,module_id text NOT NULL,role text NOT NULL,
 PRIMARY KEY(user_id,module_id));

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $ SELECT p_user_id='20000000-0000-4000-8000-000000000001'::uuid $;
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $ SELECT CASE WHEN public.is_platform_admin(p_user_id)
                  THEN 'System Admin' ELSE 'Employee' END $;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT COALESCE(p.platform_role,'employee')
 FROM public.profiles p WHERE p.id=p_user_id
$$;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_role_rank(p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT CASE WHEN p_role IN ('admin_general_manager','ceo') THEN 100
                  WHEN p_role='employee' THEN 10 ELSE 1 END $$;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_module_role_rank(p_module_id text,p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT CASE WHEN p_role='System Admin' THEN 100
                  WHEN p_role='Employee' THEN 10 ELSE 1 END $$;
CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT CASE WHEN public.is_platform_admin(p_user_id)
                  THEN 'System Admin' ELSE 'Employee' END $$;

-- The migration source guard checks these exact production control-flow anchors.
CREATE FUNCTION private.ws02_provision_main_workspace(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $provision$
DECLARE v_workspace uuid;
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
 PERFORM 1 FROM private.ws02_new_account_admissions WHERE user_id=p_user_id;
 v_workspace:=gen_random_uuid();
 RETURN jsonb_build_object('workspaceId',v_workspace);
END;
$provision$;

-- The old ARM01 fixture contains a prior open sample session. Clear only the
-- disposable canonical attendance records so activation begins with zero opens.
UPDATE public.module_state_entries
SET value=pg_catalog.jsonb_set(value::jsonb,'{records}','[]'::jsonb,true)::text,
 revision=revision+1,updated_by='20000000-0000-4000-8000-000000000001',
 updated_at=clock_timestamp()
WHERE workspace_id='10000000-0000-4000-8000-000000000001'
 AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
 AND scope='shared' AND owner_key='*';

INSERT INTO private.tt_employee_departments(
 workspace_id,user_id,department,changed_by)
VALUES
 ('10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001','Engineering',
  '20000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002','Engineering',
  '20000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003','Engineering',
  '20000000-0000-4000-8000-000000000001')
ON CONFLICT(workspace_id,user_id) DO UPDATE
SET department=EXCLUDED.department,changed_by=EXCLUDED.changed_by,
 updated_at=clock_timestamp();

\echo 'CP-TT-ADMIN-MANUAL-ATTENDANCE-HYBRID disposable prerequisites ready'
