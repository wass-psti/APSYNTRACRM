
CREATE UNIQUE INDEX IF NOT EXISTS tool_traceability_attachment_path08
ON public.tool_traceability_attachments(workspace_id,storage_path);
CREATE OR REPLACE FUNCTION public.tool_traceability_register_verified_attachment_v2(
 p_workspace_id uuid,p_request_id text,p_storage_path text,p_name text,p_mime_type text,p_size_bytes bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,storage,pg_temp AS $f$
DECLARE v_actor uuid:=auth.uid();v_obj storage.objects%rowtype;v_attachment public.tool_traceability_attachments%rowtype;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_can_comment(p_workspace_id) THEN
  RAISE EXCEPTION 'Attachment registration denied' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$'
 OR p_storage_path IS NULL OR length(p_storage_path)>500
 OR p_storage_path !~ ('^'||p_workspace_id::text||'/'||p_request_id||'/[0-9a-f-]{36}-[A-Za-z0-9_.-]{1,120}$')
 OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 120 OR p_name !~ '^[A-Za-z0-9_.-]+$'
 OR p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','image/png','image/jpeg','image/webp','text/plain')
 OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 10485760 THEN
  RAISE EXCEPTION 'Invalid attachment metadata' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tool_traceability_requests WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Request unavailable' USING ERRCODE='P0002';END IF;
 SELECT * INTO v_obj FROM storage.objects
 WHERE bucket_id='tool-traceability-attachments' AND name=p_storage_path;
 IF NOT FOUND OR coalesce(v_obj.owner_id,'')<>v_actor::text THEN
  RAISE EXCEPTION 'Private uploaded object not found or not owned by actor' USING ERRCODE='42501';END IF;
 IF coalesce(v_obj.metadata->>'mimetype','')<>p_mime_type
 OR coalesce(v_obj.metadata->>'size','') !~ '^[0-9]+$'
 OR (v_obj.metadata->>'size')::bigint<>p_size_bytes THEN
  RAISE EXCEPTION 'Stored object MIME or byte count differs' USING ERRCODE='22023';END IF;
 INSERT INTO public.tool_traceability_attachments(workspace_id,request_id,update_id,storage_path,name,mime_type,size_bytes,creator_user_id)
 VALUES(p_workspace_id,p_request_id,NULL,p_storage_path,p_name,p_mime_type,p_size_bytes,v_actor)
 RETURNING * INTO v_attachment;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'request',p_request_id,v_actor,'attachment_registered',jsonb_build_object('id',v_attachment.id,'name',p_name));
 RETURN jsonb_build_object('id',v_attachment.id,'request_id',p_request_id,'storage_path',p_storage_path,'name',p_name,'mime_type',p_mime_type,'size_bytes',p_size_bytes);
END;$f$;
CREATE OR REPLACE FUNCTION public.tool_traceability_attachment_page_v2(
 p_workspace_id uuid,p_request_id text,p_offset integer DEFAULT 0,p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $f$
DECLARE v_total bigint;v_items jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN
  RAISE EXCEPTION 'Attachment listing denied' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$'
 OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN
  RAISE EXCEPTION 'Invalid attachment pagination' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tool_traceability_requests WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Request unavailable' USING ERRCODE='P0002';END IF;
 SELECT count(*) INTO v_total FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND a.request_id=p_request_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO v_items FROM
 (SELECT a.id,a.request_id,a.name,a.storage_path,a.mime_type,a.size_bytes,a.created_at
 FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND a.request_id=p_request_id
 ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit OFFSET p_offset) x;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'cursor',CASE WHEN p_offset+p_limit<v_total THEN (p_offset+p_limit)::text ELSE NULL END);
END;$f$;
REVOKE ALL ON FUNCTION public.tool_traceability_register_verified_attachment_v2(uuid,text,text,text,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tool_traceability_attachment_page_v2(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_register_verified_attachment_v2(uuid,text,text,text,text,bigint),public.tool_traceability_attachment_page_v2(uuid,text,integer,integer) TO authenticated;
;
