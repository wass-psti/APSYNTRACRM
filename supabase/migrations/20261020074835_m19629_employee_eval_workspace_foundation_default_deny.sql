-- M196.13 STAGED ONLY: Employee Evaluation workspace-owned persistence foundation.
-- Do not deploy without a migration review and confirmed identity/permission mapping.
-- No browser/direct DML grant. No employee rows imported or seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS public.employee_evaluation_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  auth_user_id uuid NULL REFERENCES auth.users(id),
  employee_code text NOT NULL CHECK(length(trim(employee_code)) > 0),
  name text NOT NULL CHECK(length(trim(name)) > 0),
  email text NOT NULL,
  job_title text,
  department text,
  supervisor_id uuid NULL,
  role text NOT NULL CHECK(role IN ('admin','supervisor','employee')),
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
  schema_version integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, workspace_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_eval_workspace_code_uq
  ON public.employee_evaluation_employees(workspace_id, lower(employee_code));
CREATE UNIQUE INDEX IF NOT EXISTS employee_eval_workspace_email_uq
  ON public.employee_evaluation_employees(workspace_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS employee_eval_workspace_auth_user_uq
  ON public.employee_evaluation_employees(workspace_id,auth_user_id)
  WHERE auth_user_id IS NOT NULL;
ALTER TABLE public.employee_evaluation_employees
  ADD CONSTRAINT employee_eval_supervisor_same_workspace_fk
  FOREIGN KEY(supervisor_id,workspace_id)
  REFERENCES public.employee_evaluation_employees(id,workspace_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS public.employee_evaluation_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 employee_id uuid NOT NULL,
 evaluator_id uuid NULL,
 period text NOT NULL,
 ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
 comments text, strengths text, improvements text, recommendation text,
 overall_score numeric(4,2),
 status text NOT NULL CHECK(status IN ('Draft','Submitted','Reviewed','Finalized','Returned')),
 review_comment text, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 submitted_at timestamptz,reviewed_at timestamptz,finalized_at timestamptz,returned_at timestamptz,
 reviewed_by uuid,finalized_by uuid,returned_by uuid,
 schema_version integer NOT NULL DEFAULT 2,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,employee_id,period),
 FOREIGN KEY(employee_id,workspace_id) REFERENCES public.employee_evaluation_employees(id,workspace_id),
 FOREIGN KEY(evaluator_id,workspace_id) REFERENCES public.employee_evaluation_employees(id,workspace_id),
 FOREIGN KEY(reviewed_by,workspace_id) REFERENCES public.employee_evaluation_employees(id,workspace_id),
 FOREIGN KEY(finalized_by,workspace_id) REFERENCES public.employee_evaluation_employees(id,workspace_id),
 FOREIGN KEY(returned_by,workspace_id) REFERENCES public.employee_evaluation_employees(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS public.employee_evaluation_settings (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id),
 active_period text NOT NULL,
 evaluation_window text NOT NULL CHECK(evaluation_window IN ('Open','Grace Period','Closed')),
 window_open_date timestamptz,window_close_date timestamptz,
 grace_period_days integer NOT NULL DEFAULT 3 CHECK(grace_period_days >= 0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 schema_version integer NOT NULL DEFAULT 2,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_evaluation_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 action text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,
 summary text NOT NULL,actor_user_id uuid NULL REFERENCES auth.users(id),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 schema_version integer NOT NULL DEFAULT 2,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_eval_evaluations_period_idx ON public.employee_evaluation_evaluations(workspace_id,period);
CREATE INDEX IF NOT EXISTS employee_eval_activity_created_idx ON public.employee_evaluation_activity(workspace_id,created_at DESC);
-- No policies: RLS enabled with default denial for non-bypass roles.
ALTER TABLE public.employee_evaluation_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluation_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_evaluation_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_evaluation_employees FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.employee_evaluation_evaluations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.employee_evaluation_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.employee_evaluation_activity FROM PUBLIC,anon,authenticated;
COMMIT;
;
