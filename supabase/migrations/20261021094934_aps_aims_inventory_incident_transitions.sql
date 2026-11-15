CREATE OR REPLACE FUNCTION public.aps_aims_finish_workflow(p_entity_id uuid,p_kind text,p_action text,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_ws uuid; v_row public.aps_aims_entities%ROWTYPE; v_payload jsonb; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) OR NOT public.has_module_access('aps-aims',auth.uid()) THEN
  RAISE EXCEPTION 'APS AIMS workflow permission denied' USING ERRCODE='42501';
 END IF;
 v_ws:=public.current_workspace_id(auth.uid());
 IF v_ws IS NULL OR p_entity_id IS NULL OR p_kind NOT IN ('inventory_campaign','incident') THEN RAISE EXCEPTION 'Invalid workflow request'; END IF;
 IF (p_kind='inventory_campaign' AND p_action NOT IN ('start','complete')) OR (p_kind='incident' AND p_action<>'resolve') THEN RAISE EXCEPTION 'Invalid workflow transition'; END IF;
 SELECT * INTO v_row FROM public.aps_aims_entities WHERE id=p_entity_id AND workspace_id=v_ws AND entity_type=p_kind AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workflow record not found'; END IF;
 IF p_kind='inventory_campaign' THEN
   IF p_action='start' THEN
     IF v_row.payload->>'status'<>'Draft' THEN RAISE EXCEPTION 'Only draft campaigns may be started'; END IF;
     v_payload:=v_row.payload||jsonb_build_object('status','InProgress','startedAt',transaction_timestamp());
   ELSE
     IF v_row.payload->>'status'<>'InProgress' THEN RAISE EXCEPTION 'Only active campaigns may be completed'; END IF;
     SELECT count(*) INTO v_count FROM public.aps_aims_entities
      WHERE workspace_id=v_ws AND entity_type='inventory_count' AND NOT archived AND payload->>'campaignId'=p_entity_id::text;
     v_payload:=v_row.payload||jsonb_build_object('status','Completed','completedAt',transaction_timestamp(),'countedAssets',v_count);
   END IF;
 ELSE
   IF v_row.payload->>'status'<>'Open' OR v_row.payload->>'resolvedAt' IS NOT NULL THEN RAISE EXCEPTION 'Incident is not open'; END IF;
   IF length(btrim(coalesce(p_notes,'')))<3 THEN RAISE EXCEPTION 'Resolution notes are required'; END IF;
   v_payload:=v_row.payload||jsonb_build_object('status','Resolved','resolvedAt',transaction_timestamp(),'resolutionNotes',left(btrim(p_notes),2000));
 END IF;
 UPDATE public.aps_aims_entities SET payload=v_payload WHERE id=v_row.id;
 RETURN v_payload||jsonb_build_object('id',v_row.id);
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_finish_workflow(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aps_aims_finish_workflow(uuid,text,text,text) TO authenticated;;
