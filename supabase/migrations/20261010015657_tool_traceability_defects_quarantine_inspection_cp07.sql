
CREATE TABLE IF NOT EXISTS public.tool_traceability_defects_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 tool_id text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 5 AND 2000),
 resolution text,
 opened_by uuid NOT NULL,
 closed_by uuid,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 closed_at timestamptz,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY (workspace_id,tool_id) REFERENCES public.tool_traceability_tools(workspace_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS tt_defects07_unique_open ON public.tool_traceability_defects_v1(workspace_id,tool_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS tt_defects07_page ON public.tool_traceability_defects_v1(workspace_id,status,opened_at DESC,id);
ALTER TABLE public.tool_traceability_defects_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_traceability_defects_v1 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.tool_traceability_defect_quarantine_guard07() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
BEGIN
 IF NEW.availability IN ('Available','Pending Approval','In Use')
 AND EXISTS (SELECT 1 FROM public.tool_traceability_defects_v1 d WHERE d.workspace_id=NEW.workspace_id AND d.tool_id=NEW.id AND d.status='open')
 THEN RAISE EXCEPTION 'Tool has an unresolved inspection defect' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS tool_traceability_defect_guard07 ON public.tool_traceability_tools;
CREATE TRIGGER tool_traceability_defect_guard07 BEFORE INSERT OR UPDATE ON public.tool_traceability_tools
 FOR EACH ROW EXECUTE FUNCTION private.tool_traceability_defect_quarantine_guard07();
CREATE OR REPLACE FUNCTION public.tool_traceability_defects_page_v1(
 p_workspace_id uuid,p_status text DEFAULT 'open',p_offset integer DEFAULT 0,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_total integer;v_items jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN RAISE EXCEPTION 'Inspection access denied' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_status NOT IN ('open','resolved','all') OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN RAISE EXCEPTION 'Invalid defect page' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_total FROM public.tool_traceability_defects_v1 d WHERE d.workspace_id=p_workspace_id AND (p_status='all' OR d.status=p_status);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.opened_at DESC,x.id DESC),'[]'::jsonb) INTO v_items FROM (
 SELECT d.id,d.tool_id,t.name AS tool_name,d.status,d.description,d.resolution,d.opened_at,d.closed_at,d.version,t.version AS tool_version
 FROM public.tool_traceability_defects_v1 d
 JOIN public.tool_traceability_tools t ON t.workspace_id=d.workspace_id AND t.id=d.tool_id
 WHERE d.workspace_id=p_workspace_id AND (p_status='all' OR d.status=p_status)
 ORDER BY d.opened_at DESC,d.id DESC LIMIT p_limit OFFSET p_offset) x;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'cursor',CASE WHEN p_offset+p_limit<v_total THEN (p_offset+p_limit)::text ELSE NULL END);
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_report_defect_v1(
 p_workspace_id uuid,p_tool_id text,p_note text,p_expected_tool_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_tool public.tool_traceability_tools%rowtype;v_defect public.tool_traceability_defects_v1%rowtype;
BEGIN
 IF v_actor IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN RAISE EXCEPTION 'Defect reporting denied' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_tool_id IS NULL OR p_tool_id !~ '^tt-tool-[a-zA-Z0-9-]{20,100}$' OR p_expected_tool_version IS NULL OR p_expected_tool_version<1 OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Invalid defect report' USING ERRCODE='22023';END IF;
 SELECT * INTO v_tool FROM public.tool_traceability_tools WHERE workspace_id=p_workspace_id AND id=p_tool_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tool not found' USING ERRCODE='P0002';END IF;
 IF v_tool.version<>p_expected_tool_version THEN RAISE EXCEPTION 'Stale tool version' USING ERRCODE='40001';END IF;
 IF v_tool.availability NOT IN ('Available','Returned') OR v_tool.borrowed_quantity<>0 OR v_tool.current_request_id IS NOT NULL OR
 EXISTS(SELECT 1 FROM public.tool_traceability_request_tools rt JOIN public.tool_traceability_requests r ON r.workspace_id=rt.workspace_id AND r.id=rt.request_id WHERE rt.workspace_id=p_workspace_id AND rt.tool_id=p_tool_id AND rt.returned_at IS NULL AND r.archived_at IS NULL AND r.request_status IN('Pending Approval','Borrowed'))
 THEN RAISE EXCEPTION 'Tool has outstanding custody; cannot open defect' USING ERRCODE='40001';END IF;
 INSERT INTO public.tool_traceability_defects_v1(workspace_id,tool_id,description,opened_by)
 VALUES(p_workspace_id,p_tool_id,btrim(p_note),v_actor) RETURNING * INTO v_defect;
 UPDATE public.tool_traceability_tools SET availability='Returned',updated_at=clock_timestamp(),version=version+1 WHERE workspace_id=p_workspace_id AND id=p_tool_id;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'tool',p_tool_id,v_actor,'defect_reported',jsonb_build_object('defect_id',v_defect.id,'note',btrim(p_note)));
 RETURN jsonb_build_object('id',v_defect.id,'tool_id',p_tool_id,'status','open','version',v_defect.version);
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_resolve_defect_v1(
 p_workspace_id uuid,p_defect_id uuid,p_note text,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_defect public.tool_traceability_defects_v1%rowtype;
BEGIN
 IF v_actor IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN RAISE EXCEPTION 'Defect resolution denied' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_defect_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Invalid repair resolution' USING ERRCODE='22023';END IF;
 SELECT * INTO v_defect FROM public.tool_traceability_defects_v1 WHERE workspace_id=p_workspace_id AND id=p_defect_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Defect not found' USING ERRCODE='P0002';END IF;
 IF v_defect.status<>'open' OR v_defect.version<>p_expected_version THEN RAISE EXCEPTION 'Defect already resolved or version changed' USING ERRCODE='40001';END IF;
 UPDATE public.tool_traceability_defects_v1 SET status='resolved',resolution=btrim(p_note),closed_by=v_actor,closed_at=clock_timestamp(),version=version+1 WHERE id=p_defect_id AND workspace_id=p_workspace_id RETURNING * INTO v_defect;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'tool',v_defect.tool_id,v_actor,'defect_resolved',jsonb_build_object('defect_id',v_defect.id,'resolution',btrim(p_note)));
 RETURN jsonb_build_object('id',v_defect.id,'tool_id',v_defect.tool_id,'status','resolved','version',v_defect.version);
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_release_inspected_v1(
 p_workspace_id uuid,p_tool_id text,p_expected_tool_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_tool public.tool_traceability_tools%rowtype;
BEGIN
 IF v_actor IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN RAISE EXCEPTION 'Inspection release denied' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_tool_id IS NULL OR p_tool_id !~ '^tt-tool-[a-zA-Z0-9-]{20,100}$' OR p_expected_tool_version IS NULL OR p_expected_tool_version<1 THEN RAISE EXCEPTION 'Invalid tool inspection version' USING ERRCODE='22023';END IF;
 SELECT * INTO v_tool FROM public.tool_traceability_tools WHERE workspace_id=p_workspace_id AND id=p_tool_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tool not found' USING ERRCODE='P0002';END IF;
 IF v_tool.version<>p_expected_tool_version THEN RAISE EXCEPTION 'Stale tool inspection version' USING ERRCODE='40001';END IF;
 IF v_tool.availability<>'Returned' OR v_tool.borrowed_quantity<>0 OR v_tool.current_request_id IS NOT NULL THEN RAISE EXCEPTION 'Tool is not free for inspection release' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM public.tool_traceability_defects_v1 WHERE workspace_id=p_workspace_id AND tool_id=p_tool_id AND status='open') THEN RAISE EXCEPTION 'Repair must be resolved before tool release' USING ERRCODE='23514';END IF;
 UPDATE public.tool_traceability_tools SET availability='Available',updated_at=clock_timestamp(),version=version+1 WHERE workspace_id=p_workspace_id AND id=p_tool_id RETURNING * INTO v_tool;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'tool',p_tool_id,v_actor,'inspection_released',jsonb_build_object('version',v_tool.version));
 RETURN jsonb_build_object('id',v_tool.id,'availability',v_tool.availability,'version',v_tool.version);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_defects_page_v1(uuid,text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tool_traceability_report_defect_v1(uuid,text,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tool_traceability_resolve_defect_v1(uuid,uuid,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tool_traceability_release_inspected_v1(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_defects_page_v1(uuid,text,integer,integer),public.tool_traceability_report_defect_v1(uuid,text,text,bigint),public.tool_traceability_resolve_defect_v1(uuid,uuid,text,bigint),public.tool_traceability_release_inspected_v1(uuid,text,bigint) TO authenticated;
;
