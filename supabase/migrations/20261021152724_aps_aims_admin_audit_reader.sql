DROP POLICY IF EXISTS aps_aims_events_read ON public.aps_aims_events;
CREATE POLICY aps_aims_events_read ON public.aps_aims_events FOR SELECT TO authenticated USING (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())) AND public.is_platform_admin((select auth.uid())));
;
