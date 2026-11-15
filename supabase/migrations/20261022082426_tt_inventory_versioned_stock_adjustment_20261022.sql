CREATE OR REPLACE FUNCTION public.tool_traceability_inventory_set_stock_v2(
 p_workspace_id uuid,p_tool_id text,p_quantity integer,p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp'
AS $fn$
DECLARE t public.tool_traceability_tools%rowtype;
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN
  RAISE EXCEPTION 'Inventory management denied' USING ERRCODE='42501';
 END IF;
 IF p_tool_id IS NULL OR p_tool_id !~ '^(tt-tool-[a-zA-Z0-9-]{20,100}|[0-9]{1,30})$'
    OR p_quantity IS NULL OR p_quantity<0 OR p_quantity>100000
    OR p_expected_version IS NULL OR p_expected_version<1 THEN
  RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023';
 END IF;
 SELECT * INTO t FROM public.tool_traceability_tools
 WHERE workspace_id=p_workspace_id AND id=p_tool_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE='P0002'; END IF;
 IF t.version<>p_expected_version THEN RAISE EXCEPTION 'Inventory changed; refresh and retry' USING ERRCODE='40001'; END IF;
 IF p_quantity<t.borrowed_quantity THEN RAISE EXCEPTION 'Stock cannot be below borrowed quantity' USING ERRCODE='22023'; END IF;
 UPDATE public.tool_traceability_tools SET stock_quantity=p_quantity,version=version+1,updated_at=now()
 WHERE workspace_id=p_workspace_id AND id=p_tool_id RETURNING * INTO t;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'tool',p_tool_id,auth.uid(),'tool_stock_adjusted',
 jsonb_build_object('previous',t.stock_quantity,'new',p_quantity,'version',t.version));
 RETURN private.tool_traceability_tool_json(t);
END $fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_inventory_set_stock_v2(uuid,text,integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_inventory_set_stock_v2(uuid,text,integer,bigint) TO authenticated;;
