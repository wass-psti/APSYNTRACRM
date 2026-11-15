-- M196.14 STAGED ONLY. Apply strictly after reviewed M196.13 foundation.
-- Validates explicit user links against active workspace membership; never auto-links by email.
-- This creates no API/read/write grants and no frontend activation.
BEGIN;
CREATE OR REPLACE FUNCTION public.employee_evaluation_validate_identity_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
BEGIN
  IF NEW.auth_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.user_id = NEW.auth_user_id
      AND wm.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Employee identity is not an active member of this workspace'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.employee_evaluation_validate_identity_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS employee_eval_identity_workspace_guard ON public.employee_evaluation_employees;
CREATE TRIGGER employee_eval_identity_workspace_guard
  BEFORE INSERT OR UPDATE OF workspace_id, auth_user_id
  ON public.employee_evaluation_employees
  FOR EACH ROW EXECUTE FUNCTION public.employee_evaluation_validate_identity_link();
COMMIT;
;
