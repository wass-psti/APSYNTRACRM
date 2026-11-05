-- CP-WS-02D/B3 Employee Evaluation original domain tables: synthetic schema.
-- Only disposable PostgreSQL 17, no live employee records copied.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('public.employee_evaluation_save(jsonb)') IS NULL
 OR to_regclass('public.employee_evaluation_employees') IS NULL
 OR to_regclass('public.employee_evaluation_evaluations') IS NULL
 OR to_regclass('public.employee_evaluation_settings') IS NULL
 OR to_regclass('public.employee_evaluation_activity') IS NOT NULL
 THEN RAISE EXCEPTION 'Employee Evaluation fixture prerequisite/collision'
 USING ERRCODE='42501'; END IF;
END $pre$;
-- The source-check generator already created minimal %ROWTYPE tables with
-- only id uuid. Extend their synthetic shapes to match the referenced columns.
ALTER TABLE public.employee_evaluation_employees
 ALTER COLUMN id SET DEFAULT gen_random_uuid(),
 ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id),
 ADD COLUMN auth_user_id uuid REFERENCES public.profiles(id),
 ADD COLUMN employee_code text,
 ADD COLUMN name text,
 ADD COLUMN email text,
 ADD COLUMN job_title text,
 ADD COLUMN department text,
 ADD COLUMN supervisor_id uuid,
 ADD COLUMN role text,
 ADD COLUMN active boolean NOT NULL DEFAULT true,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN schema_version integer NOT NULL DEFAULT 2,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_evaluation_employees ADD PRIMARY KEY(id);
ALTER TABLE public.employee_evaluation_evaluations
 ALTER COLUMN id SET DEFAULT gen_random_uuid(),
 ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id),
 ADD COLUMN employee_id uuid REFERENCES public.employee_evaluation_employees(id),
 ADD COLUMN evaluator_id uuid REFERENCES public.employee_evaluation_employees(id),
 ADD COLUMN period text,
 ADD COLUMN ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN comments text,
 ADD COLUMN strengths text,
 ADD COLUMN improvements text,
 ADD COLUMN recommendation text,
 ADD COLUMN overall_score numeric,
 ADD COLUMN status text,
 ADD COLUMN review_comment text,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN submitted_at timestamptz,
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN finalized_at timestamptz,
 ADD COLUMN returned_at timestamptz,
 ADD COLUMN reviewed_by uuid,
 ADD COLUMN finalized_by uuid,
 ADD COLUMN returned_by uuid,
 ADD COLUMN schema_version integer NOT NULL DEFAULT 2,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_evaluation_evaluations ADD PRIMARY KEY(id);
ALTER TABLE public.employee_evaluation_settings
 ADD COLUMN workspace_id uuid UNIQUE REFERENCES public.workspaces(id),
 ADD COLUMN active_period text,
 ADD COLUMN evaluation_window text,
 ADD COLUMN window_open_date timestamptz,
 ADD COLUMN window_close_date timestamptz,
 ADD COLUMN grace_period_days integer NOT NULL DEFAULT 3,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN schema_version integer NOT NULL DEFAULT 2,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.employee_evaluation_activity(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 summary text NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 schema_version integer NOT NULL DEFAULT 2,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Synthetic, narrowly scoped module-ACL test double; original domain
-- role and supervisor/record checks remain in the real staged functions.
CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $m$
 SELECT p_module_id IN ('fueltrack-plus','tradelink','time-tracker','employee-eval')
 AND p_actor IS NOT NULL AND p_actor=auth.uid()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active')
 AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.user_id=p_actor
  AND m.active AND m.workspace_id=public.current_workspace_id(p_actor));
$m$;
