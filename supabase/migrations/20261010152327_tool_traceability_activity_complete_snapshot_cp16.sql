CREATE OR REPLACE FUNCTION public.tool_traceability_activity_snapshot_v1(p_workspace_id uuid,p_query text DEFAULT '',p_group text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_search text:=btrim(coalesce(p_query,''));v_total integer;v_items jsonb;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN RAISE EXCEPTION 'Activity snapshot authorization denied' USING ERRCODE='42501';END IF;
 IF p_query IS NULL OR length(v_search)>90 OR p_group IS NULL OR p_group NOT IN('all','requests','inventory','administration','evidence','other') THEN RAISE EXCEPTION 'Invalid activity snapshot filter' USING ERRCODE='22023';END IF;
 WITH matching AS (SELECT a.* FROM public.tool_traceability_activity a WHERE a.workspace_id=p_workspace_id
 AND (v_search='' OR position(lower(v_search) IN lower(a.event_type))>0 OR position(lower(v_search) IN lower(a.entity_type))>0 OR position(lower(v_search) IN lower(coalesce(a.entity_id,'')))>0)
 AND (p_group='all' OR p_group=(CASE WHEN a.event_type ~* 'attachment|evidence|storage|file' THEN 'evidence' WHEN a.event_type ~* 'role|membership|personnel|access|admin' THEN 'administration' WHEN a.event_type ~* 'tool|inventory|stock|defect|repair|inspection' THEN 'inventory' WHEN a.event_type ~* 'request|approval|reject|extension|return|borrow|comment|update' THEN 'requests' ELSE 'other' END)))
 SELECT count(*) INTO v_total FROM matching;
 IF v_total>1000 THEN RAISE EXCEPTION 'Activity snapshot exceeds 1000 rows; narrow the filters' USING ERRCODE='54000';END IF;
 WITH matching AS (SELECT a.* FROM public.tool_traceability_activity a WHERE a.workspace_id=p_workspace_id
 AND (v_search='' OR position(lower(v_search) IN lower(a.event_type))>0 OR position(lower(v_search) IN lower(a.entity_type))>0 OR position(lower(v_search) IN lower(coalesce(a.entity_id,'')))>0)
 AND (p_group='all' OR p_group=(CASE WHEN a.event_type ~* 'attachment|evidence|storage|file' THEN 'evidence' WHEN a.event_type ~* 'role|membership|personnel|access|admin' THEN 'administration' WHEN a.event_type ~* 'tool|inventory|stock|defect|repair|inspection' THEN 'inventory' WHEN a.event_type ~* 'request|approval|reject|extension|return|borrow|comment|update' THEN 'requests' ELSE 'other' END)))
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'entityType',a.entity_type,'entityId',a.entity_id,'eventType',a.event_type,'createdAt',a.created_at,'actor',CASE WHEN a.actor_user_id IS NULL THEN NULL ELSE private.tool_traceability_profile_json(a.actor_user_id) END) ORDER BY a.created_at DESC,a.id DESC),'[]'::jsonb) INTO v_items FROM matching a;
 IF jsonb_array_length(v_items)<>v_total THEN RAISE EXCEPTION 'Activity snapshot row count changed' USING ERRCODE='40001';END IF;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'snapshot',true,'read_only',true,'kind','activity','max_rows',1000,'total',v_total,'items',v_items,'filter_query',v_search,'filter_group',p_group);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_activity_snapshot_v1(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_activity_snapshot_v1(uuid,text,text) TO authenticated;;
