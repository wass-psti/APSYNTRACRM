DROP FUNCTION public.tool_traceability_get_item(uuid,text,text,boolean);
CREATE FUNCTION public.tool_traceability_get_item(p_workspace_id uuid,p_board text,p_item_id text,p_include_updates boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $fn$
DECLARE r jsonb;
BEGIN
 r:=public.tool_traceability_get_item(p_workspace_id,p_board,p_item_id);
 IF p_board='requests' AND p_include_updates THEN
  r:=r||jsonb_build_object('updates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id::text,'text_body',u.text_body,'creator',private.tool_traceability_profile_json(u.creator_user_id),'created_at',u.created_at,'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'name',a.name,'storagePath',a.storage_path,'mime_type',a.mime_type,'file_size',a.size_bytes)) FROM public.tool_traceability_attachments a WHERE a.update_id=u.id),'[]'::jsonb)) ORDER BY u.created_at) FROM public.tool_traceability_updates u WHERE u.workspace_id=p_workspace_id AND u.request_id=p_item_id),'[]'::jsonb));
 END IF; RETURN r;
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_get_item(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_get_item(uuid,text,text,boolean) TO authenticated;;
