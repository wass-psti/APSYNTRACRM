
ALTER TABLE public.fueltrans_tickets ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;
REVOKE DELETE ON TABLE public.fueltrans_tickets FROM authenticated;
DROP POLICY IF EXISTS fueltrans_tickets_delete ON public.fueltrans_tickets;
REVOKE INSERT ON TABLE public.fueltrans_tickets FROM authenticated;
GRANT INSERT (workspace_id,id,ticket_number,client_code,created_by,assigned_l1,assigned_l2,status,archived,payload,created_at,updated_at) ON TABLE public.fueltrans_tickets TO authenticated;
REVOKE UPDATE ON TABLE public.fueltrans_tickets FROM authenticated;
GRANT UPDATE (workspace_id,id,ticket_number,client_code,created_by,assigned_l1,assigned_l2,status,archived,payload,created_at,updated_at) ON TABLE public.fueltrans_tickets TO authenticated;
ALTER POLICY fueltrans_tickets_select ON public.fueltrans_tickets USING (deleted_at IS NULL AND (private.fueltrans_is_internal(workspace_id) OR upper(coalesce(client_code,''))=coalesce(private.fueltrans_current_client(workspace_id),'')));
ALTER POLICY fueltrans_tickets_update ON public.fueltrans_tickets USING (deleted_at IS NULL AND (private.fueltrans_current_role(workspace_id) = ANY(ARRAY['admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist']) OR (private.fueltrans_current_role(workspace_id) = ANY(ARRAY['unioil','aramco','rephil','petron']) AND upper(coalesce(client_code,''))=coalesce(private.fueltrans_current_client(workspace_id),'') AND created_by=(SELECT auth.uid())))) WITH CHECK (deleted_at IS NULL AND (private.fueltrans_current_role(workspace_id) = ANY(ARRAY['admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist']) OR (private.fueltrans_current_role(workspace_id) = ANY(ARRAY['unioil','aramco','rephil','petron']) AND upper(coalesce(client_code,''))=coalesce(private.fueltrans_current_client(workspace_id),'') AND created_by=(SELECT auth.uid()))));
CREATE OR REPLACE FUNCTION public.fueltrans_soft_delete_ticket_v1(p_workspace_id uuid,p_ticket_id text,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE v_actor uuid:=auth.uid();v_role text;v_ticket text;v_deleted timestamptz;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_ticket_id IS NULL OR p_ticket_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$' OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'Invalid ticket identity or concurrency token' USING ERRCODE='22023';END IF;
 v_role:=private.fueltrans_current_role(p_workspace_id);
 IF v_role IS NULL OR v_role NOT IN ('admin','call_center_specialist') THEN RAISE EXCEPTION 'FuelTrans ticket deletion is restricted to active administrator and call-center specialist roles' USING ERRCODE='42501';END IF;
 UPDATE public.fueltrans_tickets SET deleted_at=clock_timestamp(),deleted_by=v_actor,updated_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND id=p_ticket_id AND updated_at=p_expected_updated_at AND deleted_at IS NULL RETURNING id,deleted_at INTO v_ticket,v_deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable, already deleted, or modified concurrently' USING ERRCODE='P0002';END IF;
 INSERT INTO public.fueltrans_ticket_events_v2(workspace_id,ticket_id,actor_user_id,event_type,before_state,after_state) VALUES(p_workspace_id,v_ticket,v_actor,'ticket.soft_deleted',jsonb_build_object('deleted',false),jsonb_build_object('deleted',true,'deleted_at',v_deleted));
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'id',v_ticket,'deleted_at',v_deleted,'deleted_by',v_actor);
END;$function$;
REVOKE ALL ON FUNCTION public.fueltrans_soft_delete_ticket_v1(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_soft_delete_ticket_v1(uuid,text,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.fueltrans_restore_deleted_ticket_v1(p_workspace_id uuid,p_ticket_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE v_actor uuid:=auth.uid();v_role text;v_ticket text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_ticket_id IS NULL OR p_ticket_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$' THEN RAISE EXCEPTION 'Invalid ticket identity' USING ERRCODE='22023';END IF;
 v_role:=private.fueltrans_current_role(p_workspace_id);
 IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only an active FuelTrans administrator may restore tickets' USING ERRCODE='42501';END IF;
 UPDATE public.fueltrans_tickets SET deleted_at=NULL,deleted_by=NULL,updated_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND id=p_ticket_id AND deleted_at IS NOT NULL RETURNING id INTO v_ticket;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deleted ticket not found or already restored' USING ERRCODE='P0002';END IF;
 INSERT INTO public.fueltrans_ticket_events_v2(workspace_id,ticket_id,actor_user_id,event_type,before_state,after_state) VALUES(p_workspace_id,v_ticket,v_actor,'ticket.restored',jsonb_build_object('deleted',true),jsonb_build_object('deleted',false));
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'id',v_ticket,'restored',true);
END;$function$;
REVOKE ALL ON FUNCTION public.fueltrans_restore_deleted_ticket_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_restore_deleted_ticket_v1(uuid,text) TO authenticated;
;
