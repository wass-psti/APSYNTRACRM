
CREATE TABLE IF NOT EXISTS public.tool_traceability_delivery_ledger16 (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK(length(event_key) BETWEEN 1 AND 240),
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 notification_id uuid,
 suppressed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,event_key,recipient_user_id));
ALTER TABLE public.tool_traceability_delivery_ledger16 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_traceability_delivery_ledger16 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.tool_traceability_deliver16(
 p_workspace_id uuid,p_event_key text,p_recipient uuid,p_request_id text,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_suppressed boolean;v_row public.tool_traceability_delivery_ledger16%rowtype;v_id uuid;
BEGIN
 IF p_workspace_id IS NULL OR p_recipient IS NULL OR p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 240
 OR p_message IS NULL OR length(p_message) NOT BETWEEN 1 AND 500 THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
 JOIN public.tool_traceability_memberships m ON m.workspace_id=w.workspace_id AND m.user_id=w.user_id AND m.enabled AND m.status='active'
 WHERE w.workspace_id=p_workspace_id AND w.user_id=p_recipient AND w.active) THEN RETURN;END IF;
 v_suppressed:=EXISTS(SELECT 1 FROM public.tool_traceability_notification_prefs15 p
 WHERE p.workspace_id=p_workspace_id AND p.user_id=p_recipient AND NOT p.in_app_enabled);
 INSERT INTO public.tool_traceability_delivery_ledger16(workspace_id,event_key,recipient_user_id,suppressed)
 VALUES(p_workspace_id,p_event_key,p_recipient,v_suppressed)
 ON CONFLICT DO NOTHING RETURNING * INTO v_row;
 IF NOT FOUND OR v_suppressed THEN RETURN;END IF;
 INSERT INTO public.tool_traceability_notifications(workspace_id,target_user_id,request_id,message)
 VALUES(p_workspace_id,p_recipient,p_request_id,p_message) RETURNING id INTO v_id;
 UPDATE public.tool_traceability_delivery_ledger16 SET notification_id=v_id
 WHERE workspace_id=p_workspace_id AND event_key=p_event_key AND recipient_user_id=p_recipient;
END;$fn$;
REVOKE ALL ON FUNCTION private.tool_traceability_deliver16(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.tool_traceability_request_notice16() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_kind text;v_message text;v_key text;v_member record;
BEGIN
 IF TG_OP='INSERT' THEN
  v_kind:='submitted';v_message:='Borrow request submitted for review: '||left(NEW.reference,100);
 ELSIF NEW.request_status IS DISTINCT FROM OLD.request_status THEN
  v_kind:=CASE NEW.request_status WHEN 'Borrowed' THEN 'approved' WHEN 'Rejected' THEN 'rejected' WHEN 'Returned' THEN 'returned' ELSE NULL END;
  v_message:=CASE v_kind WHEN 'approved' THEN 'Borrow request approved: ' WHEN 'rejected' THEN 'Borrow request rejected: ' WHEN 'returned' THEN 'Borrow request returned: ' ELSE '' END||left(NEW.reference,100);
 ELSIF NEW.extension_state IS DISTINCT FROM OLD.extension_state THEN
  v_kind:=CASE NEW.extension_state WHEN 'Extension Requested' THEN 'extension_requested' WHEN 'Extension Approved' THEN 'extension_approved' WHEN 'Extension Denied' THEN 'extension_denied' ELSE NULL END;
  v_message:=CASE v_kind WHEN 'extension_requested' THEN 'Return date extension requested: ' WHEN 'extension_approved' THEN 'Return date extension approved: ' WHEN 'extension_denied' THEN 'Return date extension denied: ' ELSE '' END||left(NEW.reference,100);
 END IF;
 IF v_kind IS NULL THEN RETURN NEW;END IF;
 v_key:='request:'||NEW.id||':v'||NEW.version::text||':'||v_kind;
 IF v_kind IN ('submitted','extension_requested') THEN
  FOR v_member IN SELECT m.user_id FROM public.tool_traceability_memberships m WHERE m.workspace_id=NEW.workspace_id AND m.enabled AND m.status='active' AND m.role IN('ADMIN','LOGISTICS') AND m.user_id IS DISTINCT FROM NEW.creator_user_id ORDER BY m.user_id LIMIT 100 LOOP
   PERFORM private.tool_traceability_deliver16(NEW.workspace_id,v_key,v_member.user_id,NEW.id,v_message);
  END LOOP;
 ELSE
  PERFORM private.tool_traceability_deliver16(NEW.workspace_id,v_key,NEW.creator_user_id,NEW.id,v_message);
 END IF;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS tt_requests_notifications16 ON public.tool_traceability_requests;
CREATE TRIGGER tt_requests_notifications16 AFTER INSERT OR UPDATE OF request_status,extension_state
ON public.tool_traceability_requests FOR EACH ROW EXECUTE FUNCTION private.tool_traceability_request_notice16();
CREATE OR REPLACE FUNCTION private.tool_traceability_inventory_notice16() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_member record;v_text text;
BEGIN
 IF NEW.entity_type<>'tool' OR NEW.event_type NOT IN ('defect_reported','defect_resolved','inspection_released') THEN RETURN NEW;END IF;
 v_text:=CASE NEW.event_type WHEN 'defect_reported' THEN 'Equipment defect reported: ' WHEN 'defect_resolved' THEN 'Equipment repair recorded: ' ELSE 'Equipment inspection released: ' END||left(coalesce(NEW.entity_id,''),130);
 FOR v_member IN SELECT m.user_id FROM public.tool_traceability_memberships m
 WHERE m.workspace_id=NEW.workspace_id AND m.enabled AND m.status='active' AND m.role IN ('ADMIN','LOGISTICS') ORDER BY m.user_id LIMIT 100 LOOP
  PERFORM private.tool_traceability_deliver16(NEW.workspace_id,'activity:'||NEW.id::text,v_member.user_id,NULL,v_text);
 END LOOP;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS tt_inventory_notifications16 ON public.tool_traceability_activity;
CREATE TRIGGER tt_inventory_notifications16 AFTER INSERT ON public.tool_traceability_activity
FOR EACH ROW EXECUTE FUNCTION private.tool_traceability_inventory_notice16();
;
