
CREATE TABLE IF NOT EXISTS public.fueltrans_ticket_events_v2 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 ticket_id text NOT NULL,
 actor_user_id uuid,
 event_type text NOT NULL,
 before_state jsonb,
 after_state jsonb,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS fueltrans_ticket_events_v2_lookup_idx
 ON public.fueltrans_ticket_events_v2 (workspace_id,ticket_id,id DESC);
ALTER TABLE public.fueltrans_ticket_events_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fueltrans_ticket_events_v2 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fueltrans_ticket_events_v2 TO authenticated;
DROP POLICY IF EXISTS fueltrans_ticket_events_v2_select ON public.fueltrans_ticket_events_v2;
CREATE POLICY fueltrans_ticket_events_v2_select ON public.fueltrans_ticket_events_v2
 FOR SELECT TO authenticated USING (
  private.fueltrans_current_role(workspace_id) = 'admin'
  OR private.fueltrans_can_view_ticket(workspace_id,ticket_id)
 );
CREATE OR REPLACE FUNCTION private.fueltrans_record_ticket_event_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
 v_old jsonb := NULL;
 v_new jsonb := NULL;
 v_workspace uuid;
 v_ticket text;
 v_event text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  v_old := jsonb_build_object('status',OLD.status,'archived',OLD.archived,'assigned_l1',OLD.assigned_l1,'assigned_l2',OLD.assigned_l2);
 END IF;
 IF TG_OP <> 'DELETE' THEN
  v_new := jsonb_build_object('status',NEW.status,'archived',NEW.archived,'assigned_l1',NEW.assigned_l1,'assigned_l2',NEW.assigned_l2);
 END IF;
 v_workspace := CASE WHEN TG_OP = 'DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 v_ticket := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
 v_event := CASE WHEN TG_OP = 'INSERT' THEN 'ticket.created'
                 WHEN TG_OP = 'DELETE' THEN 'ticket.deleted'
                 WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'ticket.status_changed'
                 WHEN OLD.assigned_l1 IS DISTINCT FROM NEW.assigned_l1 OR OLD.assigned_l2 IS DISTINCT FROM NEW.assigned_l2 THEN 'ticket.assignment_changed'
                 WHEN OLD.archived IS DISTINCT FROM NEW.archived THEN 'ticket.archive_changed'
                 ELSE 'ticket.updated' END;
 INSERT INTO public.fueltrans_ticket_events_v2(workspace_id,ticket_id,actor_user_id,event_type,before_state,after_state)
 VALUES(v_workspace,v_ticket,auth.uid(),v_event,v_old,v_new);
 RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.fueltrans_record_ticket_event_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS fueltrans_ticket_events_v2_after ON public.fueltrans_tickets;
CREATE TRIGGER fueltrans_ticket_events_v2_after
 AFTER INSERT OR UPDATE OR DELETE ON public.fueltrans_tickets
 FOR EACH ROW EXECUTE FUNCTION private.fueltrans_record_ticket_event_v2();
NOTIFY pgrst,'reload schema';
;
