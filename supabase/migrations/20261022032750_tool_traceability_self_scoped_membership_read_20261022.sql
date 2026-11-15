BEGIN;
ALTER TABLE public.tool_traceability_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT (workspace_id, user_id, enabled, status)
  ON public.tool_traceability_memberships TO authenticated;
CREATE POLICY tool_traceability_self_active_membership_select_20261022
  ON public.tool_traceability_memberships
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND enabled = TRUE AND status = 'active');
COMMIT;;
