-- CP-DB-CPU-12: move stable request-identity and workspace-context lookups
-- out of per-row RLS evaluation and into statement-level initplans.
--
-- Semantics are intentionally unchanged: every policy keeps its exact table,
-- name, role target, command, predicate, workspace condition, and operation.
-- Only auth.uid() and current_setting(...) evaluation placement is changed.
-- No policy is created/dropped, no role is added/removed, and no grant changes.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- Self/admin profile and module-role reads: same predicates, one auth lookup
-- per statement instead of evaluating auth.uid() for each candidate row.
ALTER POLICY profiles_self_or_admin_select ON public.profiles
USING ((id = (SELECT auth.uid())) OR is_platform_admin());

ALTER POLICY assignments_self_or_admin_select ON public.module_role_assignments
USING ((user_id = (SELECT auth.uid())) OR is_platform_admin());

-- Order Intake: retain the same signed-user, workspace and module-access checks.
ALTER POLICY order_intake_activity_select ON public.order_intake_activity
USING (
  ((SELECT auth.uid()) IS NOT NULL)
  AND (workspace_id = current_workspace_id((SELECT auth.uid())))
  AND has_module_access('order-intake'::text, (SELECT auth.uid()))
);

ALTER POLICY order_intake_orders_select ON public.order_intake_orders
USING (
  ((SELECT auth.uid()) IS NOT NULL)
  AND (workspace_id = current_workspace_id((SELECT auth.uid())))
  AND has_module_access('order-intake'::text, (SELECT auth.uid()))
);

-- Fund Release Tracker: preserve the self-or-General-Manager membership rule.
ALTER POLICY frt_membership_self_or_gm_select ON public.frt_memberships
USING (
  private.frt_has_membership(workspace_id)
  AND (
    (user_id = (SELECT auth.uid()))
    OR private.frt_has_role(workspace_id, VARIADIC ARRAY['GENERAL_MANAGER'::text])
  )
);

-- Tool Traceability runtime policies: evaluate the existing transaction-local
-- workspace GUC once per statement; role and workspace predicate are unchanged.
ALTER POLICY cp1612ab_source_read_ws ON public.tool_traceability_activity
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612ab_source_read_ws ON public.tool_traceability_request_tools
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612ab_source_read_ws ON public.tool_traceability_requests
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612ab_source_read_ws ON public.tool_traceability_tools
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

-- Watchdog board compatibility tables: preserve each existing public-role
-- policy and apply the same statement-level lookup to USING and WITH CHECK.
ALTER POLICY cp161_files_ws ON watchdog_board.attachments
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp161_audit_ws ON watchdog_board.audit_events
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp161_loans_ws ON watchdog_board.inventory_loans
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp161_tools_ws ON watchdog_board.inventory_tools
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp161_items_ws ON watchdog_board.items
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612d_objects_ws ON watchdog_board.objects
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612b_cutover_ws ON watchdog_board.pilot_cutovers
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612e_relations_ws ON watchdog_board.toolbox_legacy_relations
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612f_subitems_ws ON watchdog_board.toolbox_subitems
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

ALTER POLICY cp1612f_updates_ws ON watchdog_board.toolbox_updates
USING ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)))
WITH CHECK ((workspace_id)::text = (SELECT current_setting('watchdog.workspace_id'::text, true)));

-- Huly event insertion: preserve actor, board-edit and workspace guards.
ALTER POLICY huly_sb06_events_insert ON huly_rewrite.transaction_events
WITH CHECK (
  (actor_id = (SELECT auth.uid()))
  AND work_board_access(board_id, 'edit'::text)
  AND (workspace_id = current_workspace_id())
);
