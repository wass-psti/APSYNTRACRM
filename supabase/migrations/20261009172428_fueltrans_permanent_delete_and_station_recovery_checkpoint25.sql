
CREATE OR REPLACE FUNCTION public.fueltrans_permanently_delete_ticket_v1(p_workspace_id uuid,p_ticket_id text,p_expected_deleted_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_ticket text;
BEGIN
 IF v_actor IS NULL OR private.fueltrans_current_role(p_workspace_id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Active FuelTrans administrator authorization required' USING ERRCODE='42501'; END IF;
 IF p_workspace_id IS NULL OR p_ticket_id IS NULL OR p_ticket_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$' OR p_expected_deleted_at IS NULL THEN RAISE EXCEPTION 'Invalid deleted-ticket identity or version' USING ERRCODE='22023';END IF;
 DELETE FROM public.fueltrans_tickets WHERE workspace_id=p_workspace_id AND id=p_ticket_id AND deleted_at IS NOT NULL AND deleted_at=p_expected_deleted_at RETURNING id INTO v_ticket;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deleted ticket not found or changed. Refresh recovery list.' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'id',v_ticket,'purged',true,'purged_by',v_actor);
END;$fn$;
REVOKE ALL ON FUNCTION public.fueltrans_permanently_delete_ticket_v1(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_permanently_delete_ticket_v1(uuid,text,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.fueltrans_deleted_ticket_page_v1(p_workspace_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 25,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $fn$
DECLARE v_total bigint;v_items jsonb;v_search text:=trim(coalesce(p_search,''));
BEGIN
 IF auth.uid() IS NULL OR private.fueltrans_current_role(p_workspace_id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only active FuelTrans administrators can list deleted tickets' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 OR p_limit IS NULL OR p_limit<1 OR p_limit>50 OR length(v_search)>80 OR v_search ~ '[%_,()*]' THEN RAISE EXCEPTION 'Invalid recovery pagination or search' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_total FROM public.fueltrans_tickets t WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_search='' OR t.id ILIKE '%'||v_search||'%' OR coalesce(t.ticket_number,'') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'stationId','') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'stationName','') ILIKE '%'||v_search||'%');
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO v_items FROM (
 SELECT t.id,t.ticket_number,
 coalesce(nullif(t.payload->>'stationId',''),'Station ID unavailable') AS station_id,
 coalesce(nullif(t.payload->>'stationName',''),'Station name unavailable') AS station_name,
 t.created_at,t.deleted_at FROM public.fueltrans_tickets t
 WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_search='' OR t.id ILIKE '%'||v_search||'%' OR coalesce(t.ticket_number,'') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'stationId','') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'stationName','') ILIKE '%'||v_search||'%')
 ORDER BY t.deleted_at DESC,t.id DESC LIMIT p_limit OFFSET p_offset
 ) s;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'total',v_total,'items',v_items);
END;$fn$;
REVOKE ALL ON FUNCTION public.fueltrans_deleted_ticket_page_v1(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_deleted_ticket_page_v1(uuid,integer,integer,text) TO authenticated;
;
