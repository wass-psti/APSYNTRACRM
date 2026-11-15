CREATE OR REPLACE FUNCTION public.tool_traceability_list_my_requests_v1(
  p_workspace_id uuid,p_search text DEFAULT '',p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,p_cursor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_search text := trim(coalesce(p_search,''));
  v_offset integer;
  v_total integer;
  v_items jsonb;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN
    RAISE EXCEPTION 'Tool Traceability access denied' USING ERRCODE='42501';
  END IF;
  IF length(v_search)>90 OR v_search ~ '[%_]' OR
     (p_status IS NOT NULL AND p_status NOT IN ('','All','Pending Approval','Borrowed','Returned','Rejected')) OR
     p_limit IS NULL OR p_limit<1 OR p_limit>50 OR
     (p_cursor IS NOT NULL AND (p_cursor !~ '^[0-9]{1,7}$' OR length(p_cursor)>7)) THEN
    RAISE EXCEPTION 'Invalid My Requests query' USING ERRCODE='22023';
  END IF;
  v_offset := coalesce(p_cursor::integer,0);
  IF v_offset>1000000 THEN RAISE EXCEPTION 'Page offset exceeds limit' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_total FROM public.tool_traceability_requests r
  WHERE r.workspace_id=p_workspace_id AND r.creator_user_id=v_user AND r.archived_at IS NULL
    AND (v_search='' OR r.name ILIKE '%'||v_search||'%' OR r.reference ILIKE '%'||v_search||'%')
    AND (p_status IS NULL OR p_status='' OR p_status='All' OR r.request_status=p_status);
  SELECT coalesce(jsonb_agg(private.tool_traceability_request_json(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)
  INTO v_items FROM (
    SELECT * FROM public.tool_traceability_requests r
    WHERE r.workspace_id=p_workspace_id AND r.creator_user_id=v_user AND r.archived_at IS NULL
      AND (v_search='' OR r.name ILIKE '%'||v_search||'%' OR r.reference ILIKE '%'||v_search||'%')
      AND (p_status IS NULL OR p_status='' OR p_status='All' OR r.request_status=p_status)
    ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit OFFSET v_offset
  ) r;
  RETURN jsonb_build_object('items',v_items,'total',v_total,
    'cursor',CASE WHEN v_offset+p_limit<v_total THEN (v_offset+p_limit)::text ELSE NULL END);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_list_my_requests_v1(uuid,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_list_my_requests_v1(uuid,text,text,integer,text) TO authenticated;;
