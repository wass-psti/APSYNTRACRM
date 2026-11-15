BEGIN;
DROP POLICY IF EXISTS aps_aims_entities_create ON public.aps_aims_entities;
CREATE POLICY aps_aims_entities_create ON public.aps_aims_entities FOR INSERT TO authenticated WITH CHECK (
 workspace_id = public.current_workspace_id((select auth.uid()))
 AND public.has_module_access('aps-aims',(select auth.uid()))
 AND public.is_platform_admin((select auth.uid()))
 AND created_by = (select auth.uid())
);
DROP POLICY IF EXISTS aps_aims_entities_update ON public.aps_aims_entities;
CREATE POLICY aps_aims_entities_update ON public.aps_aims_entities FOR UPDATE TO authenticated
 USING (workspace_id = public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())) AND public.is_platform_admin((select auth.uid())))
 WITH CHECK (workspace_id = public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())) AND public.is_platform_admin((select auth.uid())));
CREATE OR REPLACE FUNCTION public.aps_aims_entity_audit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.id IS DISTINCT FROM OLD.id THEN
     RAISE EXCEPTION 'Immutable APS AIMS identity fields cannot change';
   END IF;
   NEW.revision := OLD.revision + 1;
   NEW.updated_at := transaction_timestamp();
 ELSE
   NEW.created_by := auth.uid();
   NEW.created_at := transaction_timestamp();
   NEW.updated_at := NEW.created_at;
   NEW.revision := 1;
 END IF;
 INSERT INTO public.aps_aims_events(workspace_id,entity_id,event_type,actor_id,data)
 VALUES (NEW.workspace_id,NEW.id,lower(TG_OP),auth.uid(),jsonb_build_object('entity_type',NEW.entity_type,'revision',NEW.revision));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aps_aims_entity_audit_trigger ON public.aps_aims_entities;
CREATE TRIGGER aps_aims_entity_audit_trigger AFTER INSERT OR UPDATE ON public.aps_aims_entities FOR EACH ROW EXECUTE FUNCTION public.aps_aims_entity_audit();
CREATE OR REPLACE FUNCTION public.aps_aims_guard_entity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable APS AIMS identity fields cannot change'; END IF;
   NEW.revision := OLD.revision + 1; NEW.updated_at := transaction_timestamp();
 ELSE
   NEW.created_by := auth.uid(); NEW.created_at := transaction_timestamp(); NEW.updated_at := NEW.created_at; NEW.revision := 1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aps_aims_entity_guard_trigger ON public.aps_aims_entities;
CREATE TRIGGER aps_aims_entity_guard_trigger BEFORE INSERT OR UPDATE ON public.aps_aims_entities FOR EACH ROW EXECUTE FUNCTION public.aps_aims_guard_entity();
CREATE OR REPLACE FUNCTION public.aps_aims_log_entity_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.aps_aims_events(workspace_id,entity_id,event_type,actor_id,data)
 VALUES(NEW.workspace_id,NEW.id,lower(TG_OP),auth.uid(),jsonb_build_object('entity_type',NEW.entity_type,'revision',NEW.revision));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_log_entity_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aps_aims_entity_audit_trigger ON public.aps_aims_entities;
CREATE TRIGGER aps_aims_entity_audit_trigger AFTER INSERT OR UPDATE ON public.aps_aims_entities FOR EACH ROW EXECUTE FUNCTION public.aps_aims_log_entity_change();
COMMIT;;
