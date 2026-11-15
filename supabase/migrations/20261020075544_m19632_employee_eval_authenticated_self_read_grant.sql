BEGIN;
REVOKE ALL ON FUNCTION public.employee_evaluation_my_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_evaluation_my_snapshot() TO authenticated;
COMMIT;;
