CREATE OR REPLACE FUNCTION public.tool_traceability_evidence_audit_v1(p_workspace_id uuid,p_kind text DEFAULT 'all',p_offset integer DEFAULT 0,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog,public,private,storage,pg_temp AS $b$
DECLARE v_items jsonb;v_total integer;
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN RAISE EXCEPTION 'Tool Traceability ADMIN required to audit evidence' USING ERRCODE='42501';END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('all','missing','orphan_candidate') OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR p_limit IS NULL OR p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'Invalid evidence audit selection' USING ERRCODE='22023';END IF;
 WITH issues AS (
 SELECT 'missing'::text kind,a.id::text attachment_id,a.request_id,a.name filename,a.storage_path,a.created_at observed_at FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='tool-traceability-attachments' AND o.name=a.storage_path)
 UNION ALL
 SELECT 'orphan_candidate'::text,NULL::text,NULL::text,NULL::text,o.name,o.created_at FROM storage.objects o WHERE o.bucket_id='tool-traceability-attachments' AND o.name LIKE p_workspace_id::text||'/%' AND o.created_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND a.storage_path=o.name))
 SELECT count(*) INTO v_total FROM issues WHERE p_kind='all' OR kind=p_kind;
 WITH issues AS (
 SELECT 'missing'::text kind,a.id::text attachment_id,a.request_id,a.name filename,a.storage_path,a.created_at observed_at FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='tool-traceability-attachments' AND o.name=a.storage_path)
 UNION ALL
 SELECT 'orphan_candidate'::text,NULL::text,NULL::text,NULL::text,o.name,o.created_at FROM storage.objects o WHERE o.bucket_id='tool-traceability-attachments' AND o.name LIKE p_workspace_id::text||'/%' AND o.created_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM public.tool_traceability_attachments a WHERE a.workspace_id=p_workspace_id AND a.storage_path=o.name)),paged AS (
 SELECT * FROM issues WHERE p_kind='all' OR kind=p_kind ORDER BY observed_at DESC,storage_path,kind LIMIT p_limit OFFSET p_offset)
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.observed_at DESC,p.storage_path,p.kind),'[]'::jsonb) INTO v_items FROM paged p;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'items',v_items,'total',v_total,'cursor',CASE WHEN p_offset+p_limit<v_total THEN (p_offset+p_limit)::text ELSE NULL END,'read_only',true,'grace_period_hours',24);
END;$b$;
REVOKE ALL ON FUNCTION public.tool_traceability_evidence_audit_v1(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_evidence_audit_v1(uuid,text,integer,integer) TO authenticated;;
