
CREATE OR REPLACE FUNCTION public.fueltrans_soft_delete_tickets_v2(p_workspace_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $function$
DECLARE v_actor uuid:=auth.uid();v_role text;v_item jsonb;v_id text;v_version timestamptz;v_seen text[]:=ARRAY[]::text[];v_result jsonb:='[]'::jsonb;v_ack jsonb;v_count integer;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 v_role:=private.fueltrans_current_role(p_workspace_id);
 IF v_role IS NULL OR v_role NOT IN ('admin','call_center_specialist') THEN RAISE EXCEPTION 'Bulk ticket deletion restricted to active FuelTrans admin/call-center members' USING ERRCODE='42501';END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>25 THEN RAISE EXCEPTION 'Select 1 to 25 tickets per bulk deletion' USING ERRCODE='22023';END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(v_item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_item))<>2 OR NOT(v_item ? 'id' AND v_item ? 'updated_at') THEN RAISE EXCEPTION 'Invalid bulk ticket entry' USING ERRCODE='22023';END IF;
  v_id:=v_item->>'id';
  IF v_id IS NULL OR v_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$' OR v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Invalid or repeated ticket ID in bulk request' USING ERRCODE='22023';END IF;
  v_seen:=array_append(v_seen,v_id);
  BEGIN v_version:=(v_item->>'updated_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid ticket concurrency timestamp' USING ERRCODE='22023';END;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Missing ticket concurrency timestamp' USING ERRCODE='22023';END IF;
  v_ack:=public.fueltrans_soft_delete_ticket_v1(p_workspace_id,v_id,v_version);
  IF v_ack->>'id' IS DISTINCT FROM v_id OR v_ack->>'deleted_by' IS DISTINCT FROM v_actor::text THEN RAISE EXCEPTION 'Ticket deletion not confirmed' USING ERRCODE='P0002';END IF;
  v_result:=v_result||jsonb_build_array(v_ack);
 END LOOP;
 v_count:=jsonb_array_length(v_result);
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'count',v_count,'deleted',v_result);
END;$function$;
REVOKE ALL ON FUNCTION public.fueltrans_soft_delete_tickets_v2(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_soft_delete_tickets_v2(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fueltrans_list_deleted_tickets_v1(p_workspace_id uuid,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $function$
DECLARE v_total integer;v_rows jsonb;v_q text:=lower(trim(coalesce(p_search,'')));
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR private.fueltrans_current_role(p_workspace_id) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only active FuelTrans administrators may browse deleted tickets' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR length(v_q)>80 THEN RAISE EXCEPTION 'Invalid deleted ticket page or search' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_total FROM public.fueltrans_tickets t WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_q='' OR strpos(lower(concat_ws(' ',t.id,t.ticket_number,t.payload->>'name',t.payload->>'title',t.payload->>'subject')),v_q)>0);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'ticket_number',r.ticket_number,'title',r.title,'deleted_at',r.deleted_at,'created_at',r.created_at)),'[]'::jsonb) INTO v_rows
 FROM (SELECT t.id,t.ticket_number,left(coalesce(nullif(t.payload->>'name',''),nullif(t.payload->>'title',''),nullif(t.payload->>'subject',''),nullif(t.payload->>'issueDetails',''),'Untitled ticket'),180) AS title,t.deleted_at,t.created_at FROM public.fueltrans_tickets t
 WHERE t.workspace_id=p_workspace_id AND t.deleted_at IS NOT NULL AND (v_q='' OR strpos(lower(concat_ws(' ',t.id,t.ticket_number,t.payload->>'name',t.payload->>'title',t.payload->>'subject')),v_q)>0)
 ORDER BY t.deleted_at DESC,t.id ASC LIMIT p_limit OFFSET p_offset) r;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'total',v_total,'limit',p_limit,'offset',p_offset,'rows',v_rows);
END;$function$;
REVOKE ALL ON FUNCTION public.fueltrans_list_deleted_tickets_v1(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fueltrans_list_deleted_tickets_v1(uuid,integer,integer,text) TO authenticated;
CREATE INDEX IF NOT EXISTS fueltrans_deleted_tickets_page_c24_idx ON public.fueltrans_tickets(workspace_id,deleted_at DESC,id ASC) WHERE deleted_at IS NOT NULL;
;
