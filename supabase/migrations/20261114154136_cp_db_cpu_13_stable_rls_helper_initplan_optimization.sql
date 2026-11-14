-- CP-DB-CPU-13: hoist stable, statement-invariant authorization helpers
-- from per-row RLS evaluation into statement-level scalar subqueries.
--
-- Every policy retains its exact identity, command, roles, permissive mode,
-- row-dependent predicates and authorization meaning. Only stable helper
-- evaluation placement changes. work_board_access(board_id, ...) and other
-- row-dependent helpers are deliberately not hoisted.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- Huly: current workspace is statement-invariant; board access remains row-bound.
ALTER POLICY huly_documents_insert ON huly_rewrite.documents
WITH CHECK (
  work_board_access(board_id, 'edit'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
);

ALTER POLICY huly_documents_read ON huly_rewrite.documents
USING (
  work_board_access(board_id, 'view'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
);

ALTER POLICY huly_documents_update ON huly_rewrite.documents
USING (
  work_board_access(board_id, 'edit'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
)
WITH CHECK (
  work_board_access(board_id, 'edit'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
);

ALTER POLICY huly_sb06_events_insert ON huly_rewrite.transaction_events
WITH CHECK (
  (actor_id = (SELECT auth.uid()))
  AND work_board_access(board_id, 'edit'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
);

ALTER POLICY huly_sb06_events_read ON huly_rewrite.transaction_events
USING (
  work_board_access(board_id, 'view'::text)
  AND (workspace_id = (SELECT current_workspace_id()))
);

-- APS AIMS: workspace, module and platform checks are invariant per statement.
ALTER POLICY aps_aims_entities_create ON public.aps_aims_entities
WITH CHECK (
  (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('aps-aims'::text, (SELECT auth.uid())))
  AND (SELECT is_platform_admin((SELECT auth.uid())))
  AND (created_by = (SELECT auth.uid()))
);

ALTER POLICY aps_aims_entities_read ON public.aps_aims_entities
USING (
  (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('aps-aims'::text, (SELECT auth.uid())))
);

ALTER POLICY aps_aims_entities_update ON public.aps_aims_entities
USING (
  (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('aps-aims'::text, (SELECT auth.uid())))
  AND (SELECT is_platform_admin((SELECT auth.uid())))
)
WITH CHECK (
  (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('aps-aims'::text, (SELECT auth.uid())))
  AND (SELECT is_platform_admin((SELECT auth.uid())))
);

ALTER POLICY aps_aims_events_read ON public.aps_aims_events
USING (
  (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('aps-aims'::text, (SELECT auth.uid())))
  AND (SELECT is_platform_admin((SELECT auth.uid())))
);

-- Self/admin profile and module-role policies: admin identity is invariant.
ALTER POLICY assignments_self_or_admin_select ON public.module_role_assignments
USING (
  (user_id = (SELECT auth.uid()))
  OR (SELECT is_platform_admin())
);

ALTER POLICY profiles_self_or_admin_select ON public.profiles
USING (
  (id = (SELECT auth.uid()))
  OR (SELECT is_platform_admin())
);

-- Order Intake: both workspace and module checks are invariant per statement.
ALTER POLICY order_intake_activity_select ON public.order_intake_activity
USING (
  ((SELECT auth.uid()) IS NOT NULL)
  AND (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('order-intake'::text, (SELECT auth.uid())))
);

ALTER POLICY order_intake_orders_select ON public.order_intake_orders
USING (
  ((SELECT auth.uid()) IS NOT NULL)
  AND (workspace_id = (SELECT current_workspace_id((SELECT auth.uid()))))
  AND (SELECT has_module_access('order-intake'::text, (SELECT auth.uid())))
);
