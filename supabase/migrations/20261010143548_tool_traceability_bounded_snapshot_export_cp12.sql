
CREATE OR REPLACE FUNCTION public.tool_traceability_export_snapshot_v1(
 p_workspace_id uuid,p_kind text,p_search text DEFAULT '',p_status text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_search text:=btrim(coalesce(p_search,''));v_total integer;v_items jsonb;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN
  RAISE EXCEPTION 'Tool Traceability report authorization required' USING ERRCODE='42501';
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('tools','requests','my-requests') OR
 p_search IS NULL OR length(v_search)>90 OR p_status IS NULL OR
 p_status NOT IN ('','Pending Approval','Borrowed','Returned','Rejected') OR
 (p_kind='tools' AND p_status<>'') THEN
  RAISE EXCEPTION 'Invalid report kind or filters' USING ERRCODE='22023';
 END IF;
 IF p_kind='tools' THEN
  SELECT count(*) INTO v_total FROM public.tool_traceability_tools t
   WHERE t.workspace_id=p_workspace_id AND t.archived_at IS NULL
   AND (v_search='' OR t.name ILIKE '%'||v_search||'%');
  IF v_total>1000 THEN RAISE EXCEPTION 'Report contains more than 1000 records; use a narrower search' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(private.tool_traceability_tool_json(t) ORDER BY t.name COLLATE "C",t.id),'[]'::jsonb)
    INTO v_items FROM public.tool_traceability_tools t
   WHERE t.workspace_id=p_workspace_id AND t.archived_at IS NULL
   AND (v_search='' OR t.name ILIKE '%'||v_search||'%');
 ELSE
  SELECT count(*) INTO v_total FROM public.tool_traceability_requests r
   WHERE r.workspace_id=p_workspace_id AND r.archived_at IS NULL
   AND (p_kind<>'my-requests' OR r.creator_user_id=v_actor)
   AND (v_search='' OR r.name ILIKE '%'||v_search||'%' OR r.reference ILIKE '%'||v_search||'%')
   AND (p_status='' OR r.request_status=p_status);
  IF v_total>1000 THEN RAISE EXCEPTION 'Report contains more than 1000 records; use a narrower search' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(private.tool_traceability_request_json(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)
    INTO v_items FROM public.tool_traceability_requests r
   WHERE r.workspace_id=p_workspace_id AND r.archived_at IS NULL
   AND (p_kind<>'my-requests' OR r.creator_user_id=v_actor)
   AND (v_search='' OR r.name ILIKE '%'||v_search||'%' OR r.reference ILIKE '%'||v_search||'%')
   AND (p_status='' OR r.request_status=p_status);
 END IF;
 IF jsonb_array_length(v_items)<>v_total THEN
  RAISE EXCEPTION 'Report source count changed; no export delivered' USING ERRCODE='40001';
 END IF;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'kind',p_kind,
   'total',v_total,'items',v_items,'snapshot',true,'max_rows',1000);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_export_snapshot_v1(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_export_snapshot_v1(uuid,text,text,text) TO authenticated;
;
