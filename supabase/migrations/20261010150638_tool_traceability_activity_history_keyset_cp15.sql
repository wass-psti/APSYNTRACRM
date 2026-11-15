CREATE INDEX IF NOT EXISTS tt_activity15_history_page ON public.tool_traceability_activity(workspace_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.tool_traceability_activity_page_v2(p_workspace_id uuid,p_query text DEFAULT '',p_group text DEFAULT 'all',p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_row record;v_items jsonb:='[]'::jsonb;v_count integer:=0;v_last_at timestamptz;v_last_id uuid;v_more boolean:=false;v_search text:=btrim(coalesce(p_query,''));
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN RAISE EXCEPTION 'Module Activity History access denied' USING ERRCODE='42501'; END IF;
 IF p_query IS NULL OR length(v_search)>90 OR p_group IS NULL OR p_group NOT IN('all','requests','inventory','administration','evidence','other') OR ((p_before_at IS NULL) <> (p_before_id IS NULL)) THEN RAISE EXCEPTION 'Invalid Activity History filter or cursor' USING ERRCODE='22023'; END IF;
 FOR v_row IN SELECT a.* FROM public.tool_traceability_activity a
 WHERE a.workspace_id=p_workspace_id AND (p_before_at IS NULL OR (a.created_at,a.id)<(p_before_at,p_before_id))
 AND (v_search='' OR position(lower(v_search) IN lower(a.event_type))>0 OR position(lower(v_search) IN lower(a.entity_type))>0 OR position(lower(v_search) IN lower(coalesce(a.entity_id,'')))>0)
 AND (p_group='all' OR p_group=(CASE WHEN a.event_type ~* 'attachment|evidence|storage|file' THEN 'evidence' WHEN a.event_type ~* 'role|membership|personnel|access|admin' THEN 'administration' WHEN a.event_type ~* 'tool|inventory|stock|defect|repair|inspection' THEN 'inventory' WHEN a.event_type ~* 'request|approval|reject|extension|return|borrow|comment|update' THEN 'requests' ELSE 'other' END))
 ORDER BY a.created_at DESC,a.id DESC LIMIT 21 LOOP
 v_count:=v_count+1;IF v_count>20 THEN v_more:=true;EXIT;END IF;
 v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_row.id::text,'entityType',v_row.entity_type,'entityId',v_row.entity_id,'eventType',v_row.event_type,'createdAt',v_row.created_at,'actor',CASE WHEN v_row.actor_user_id IS NULL THEN NULL ELSE private.tool_traceability_profile_json(v_row.actor_user_id) END));
 v_last_at:=v_row.created_at;v_last_id:=v_row.id;END LOOP;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'items',v_items,'has_more',v_more,'next_cursor',CASE WHEN v_more THEN jsonb_build_object('created_at',v_last_at,'id',v_last_id) ELSE NULL END,'read_only',true,'page_size',20,'filter_group',p_group,'filter_query',v_search);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_activity_page_v2(uuid,text,text,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_activity_page_v2(uuid,text,text,timestamptz,uuid) TO authenticated;;
