CREATE OR REPLACE FUNCTION public.tool_traceability_returnable_tools_v1(
 p_workspace_id uuid, p_request_id text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, private, pg_temp AS $fn$
DECLARE v_actor uuid := auth.uid(); v_version bigint; v_status text; v_items jsonb;
BEGIN
 IF v_actor IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN
   RAISE EXCEPTION 'Tool return access denied' USING ERRCODE='42501';
 END IF;
 IF p_workspace_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$' THEN
   RAISE EXCEPTION 'Invalid request identity' USING ERRCODE='22023';
 END IF;
 SELECT r.version, r.request_status INTO v_version,v_status
 FROM public.tool_traceability_requests r
 WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id AND r.archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',t.id,'name',t.name,'returned_at',rt.returned_at,'quantity',rt.quantity
   ) ORDER BY t.name,t.id),'[]'::jsonb)
 INTO v_items
 FROM public.tool_traceability_request_tools rt
 JOIN public.tool_traceability_tools t ON t.workspace_id=rt.workspace_id AND t.id=rt.tool_id
 WHERE rt.workspace_id=p_workspace_id AND rt.request_id=p_request_id;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'request_id',p_request_id,
   'version',v_version,'status',v_status,'items',v_items);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_returnable_tools_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_returnable_tools_v1(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.tool_traceability_partial_return_v1(
 p_workspace_id uuid, p_request_id text, p_tool_ids jsonb,
 p_expected_version bigint, p_return_date date DEFAULT CURRENT_DATE
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, private, pg_temp AS $fn$
DECLARE
 v_actor uuid:=auth.uid(); v_request public.tool_traceability_requests%rowtype;
 v_tool_id text; v_tool public.tool_traceability_tools%rowtype;
 v_relation public.tool_traceability_request_tools%rowtype;
 v_ids text[]; v_count integer; v_remaining integer;
BEGIN
 IF v_actor IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN
   RAISE EXCEPTION 'Only Tool Traceability ADMIN/LOGISTICS can record returns' USING ERRCODE='42501';
 END IF;
 IF p_workspace_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$'
    OR p_expected_version IS NULL OR p_expected_version<1 OR p_return_date IS NULL
    OR p_tool_ids IS NULL OR jsonb_typeof(p_tool_ids) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_tool_ids)<1 OR jsonb_array_length(p_tool_ids)>50 THEN
   RAISE EXCEPTION 'Invalid partial-return request' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_request FROM public.tool_traceability_requests r
  WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id AND r.archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='P0002'; END IF;
 IF v_request.request_status<>'Borrowed' THEN
   RAISE EXCEPTION 'Only actively borrowed requests can be partially returned' USING ERRCODE='22023';
 END IF;
 IF v_request.version<>p_expected_version THEN
   RAISE EXCEPTION 'Stale request version; refresh before returning equipment' USING ERRCODE='40001';
 END IF;
 IF v_request.borrow_from IS NOT NULL AND p_return_date<v_request.borrow_from THEN
   RAISE EXCEPTION 'Return date precedes the borrow start date' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(item ORDER BY item),count(*) INTO v_ids,v_count
 FROM jsonb_array_elements_text(p_tool_ids) AS item;
 IF v_count<>(SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) OR
    EXISTS(SELECT 1 FROM unnest(v_ids) AS x WHERE x !~ '^tt-tool-[a-zA-Z0-9-]{20,100}$') THEN
   RAISE EXCEPTION 'Duplicate or malformed tool IDs' USING ERRCODE='22023';
 END IF;
 FOREACH v_tool_id IN ARRAY v_ids LOOP
   SELECT * INTO v_relation FROM public.tool_traceability_request_tools rt
     WHERE rt.workspace_id=p_workspace_id AND rt.request_id=p_request_id AND rt.tool_id=v_tool_id FOR UPDATE;
   IF NOT FOUND OR v_relation.returned_at IS NOT NULL THEN
     RAISE EXCEPTION 'Tool is not outstanding or has already been returned' USING ERRCODE='40001';
   END IF;
   SELECT * INTO v_tool FROM public.tool_traceability_tools t
     WHERE t.workspace_id=p_workspace_id AND t.id=v_tool_id FOR UPDATE;
   IF NOT FOUND OR v_tool.current_request_id IS DISTINCT FROM p_request_id OR v_tool.availability<>'In Use' THEN
     RAISE EXCEPTION 'Tool custody does not match the borrowed request' USING ERRCODE='40001';
   END IF;
   UPDATE public.tool_traceability_request_tools SET returned_at=clock_timestamp()
     WHERE workspace_id=p_workspace_id AND request_id=p_request_id AND tool_id=v_tool_id AND returned_at IS NULL;
   UPDATE public.tool_traceability_tools
     SET availability='Returned',assigned_to='[]'::jsonb,current_request_id=NULL,
         updated_at=now(),version=version+1
     WHERE workspace_id=p_workspace_id AND id=v_tool_id;
 END LOOP;
 SELECT count(*) INTO v_remaining FROM public.tool_traceability_request_tools rt
   WHERE rt.workspace_id=p_workspace_id AND rt.request_id=p_request_id AND rt.returned_at IS NULL;
 UPDATE public.tool_traceability_requests
   SET request_status=CASE WHEN v_remaining=0 THEN 'Returned' ELSE 'Borrowed' END,
       actual_return=CASE WHEN v_remaining=0 THEN p_return_date ELSE actual_return END,
       updated_at=clock_timestamp(),version=version+1
   WHERE workspace_id=p_workspace_id AND id=p_request_id RETURNING * INTO v_request;
 FOREACH v_tool_id IN ARRAY v_ids LOOP
   PERFORM private.tool_traceability_recalc_inventory(p_workspace_id,v_tool_id);
 END LOOP;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'request',p_request_id,v_actor,'request_partial_return',
   jsonb_build_object('tool_ids',to_jsonb(v_ids),'remaining',v_remaining,'fully_returned',v_remaining=0,'return_date',p_return_date,'version',v_request.version));
 RETURN jsonb_build_object('request',private.tool_traceability_request_json(v_request),
   'returned_tool_ids',to_jsonb(v_ids),'remaining_tool_count',v_remaining,'completed',v_remaining=0);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_partial_return_v1(uuid,text,jsonb,bigint,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_partial_return_v1(uuid,text,jsonb,bigint,date) TO authenticated;;
