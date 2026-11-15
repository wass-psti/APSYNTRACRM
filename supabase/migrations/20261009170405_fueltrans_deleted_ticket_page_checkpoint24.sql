CREATE INDEX IF NOT EXISTS fueltrans_tickets_deleted_lookup24 ON public.fueltrans_tickets (workspace_id, deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.fueltrans_deleted_ticket_page_v1(p_workspace_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 25,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $fn$
DECLARE v_total bigint;v_items jsonb;v_search text:=trim(coalesce(p_search,''));
BEGIN
 IF auth.uid() IS NULL OR private.fueltrans_current_role(p_workspace_id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only active FuelTrans administrators can list deleted tickets' USING ERRCODE='42501'; END IF;
 IF p_workspace_id IS NULL OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 OR p_limit IS NULL OR p_limit<1 OR p_limit>50 OR length(v_search)>80 OR v_search ~ '[%_,()*]' THEN RAISE EXCEPTION 'Invalid recovery pagination or search' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO v_total FROM public.fueltrans_tickets t WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_search='' OR t.id ILIKE '%'||v_search||'%' OR coalesce(t.ticket_number,'') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'title',t.payload->>'issueTitle','') ILIKE '%'||v_search||'%');
 SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_items FROM (SELECT t.id,t.ticket_number,coalesce(nullif(t.payload->>'title',''),nullif(t.payload->>'issueTitle',''),'Untitled ticket') AS title,t.created_at,t.deleted_at FROM public.fueltrans_tickets t WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_search='' OR t.id ILIKE '%'||v_search||'%' OR coalesce(t.ticket_number,'') ILIKE '%'||v_search||'%' OR coalesce(t.payload->>'title',t.payload->>'issueTitle','') ILIKE '%'||v_search||'%') ORDER BY t.deleted_at DESC,t.id DESC LIMIT p_limit OFFSET p_offset) s;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'total',v_total,'items',v_items);
END;$fn$;
REVOKE ALL ON FUNCTION public.fueltrans_deleted_ticket_page_v1(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_deleted_ticket_page_v1(uuid,integer,integer,text) TO authenticated;;
