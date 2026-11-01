-- Emergency compatibility rollback candidate, requires separate authorization.
-- Re-opens broad financial totals and personally identifying fields to any
-- previously allowed FRT member. Not a security-equivalent rollback.
-- Preserve secure board read RPCs and the canonical detail rollback boundary.
BEGIN;
GRANT EXECUTE ON FUNCTION public.frt_list_requests(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_dashboard(uuid,text) TO authenticated;
COMMIT;
