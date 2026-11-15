BEGIN;
CREATE TABLE IF NOT EXISTS public.aps_aims_entities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 entity_type text NOT NULL CHECK (entity_type IN ('company','branch','department','location','category','employee','asset','custody','transaction','maintenance','calibration','inventory_campaign','inventory_count','incident','audit')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision bigint NOT NULL DEFAULT 1,
 archived boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS aps_aims_entities_workspace_type_idx ON public.aps_aims_entities(workspace_id, entity_type, archived);
CREATE INDEX IF NOT EXISTS aps_aims_entities_payload_gin_idx ON public.aps_aims_entities USING gin(payload jsonb_path_ops);
CREATE TABLE IF NOT EXISTS public.aps_aims_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 entity_id uuid REFERENCES public.aps_aims_entities(id) ON DELETE RESTRICT,
 event_type text NOT NULL,
 actor_id uuid NOT NULL DEFAULT auth.uid(),
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aps_aims_events_ws_entity_idx ON public.aps_aims_events(workspace_id,entity_id,created_at DESC);
ALTER TABLE public.aps_aims_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aps_aims_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aps_aims_entities_read ON public.aps_aims_entities;
CREATE POLICY aps_aims_entities_read ON public.aps_aims_entities FOR SELECT TO authenticated
 USING (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())));
DROP POLICY IF EXISTS aps_aims_entities_create ON public.aps_aims_entities;
CREATE POLICY aps_aims_entities_create ON public.aps_aims_entities FOR INSERT TO authenticated
 WITH CHECK (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())) AND created_by=(select auth.uid()));
DROP POLICY IF EXISTS aps_aims_entities_update ON public.aps_aims_entities;
CREATE POLICY aps_aims_entities_update ON public.aps_aims_entities FOR UPDATE TO authenticated
 USING (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())))
 WITH CHECK (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())));
DROP POLICY IF EXISTS aps_aims_events_read ON public.aps_aims_events;
CREATE POLICY aps_aims_events_read ON public.aps_aims_events FOR SELECT TO authenticated
 USING (workspace_id=public.current_workspace_id((select auth.uid())) AND public.has_module_access('aps-aims',(select auth.uid())));
REVOKE ALL ON public.aps_aims_entities,public.aps_aims_events FROM anon,public;
GRANT SELECT,INSERT,UPDATE ON public.aps_aims_entities TO authenticated;
GRANT SELECT ON public.aps_aims_events TO authenticated;
COMMIT;;
