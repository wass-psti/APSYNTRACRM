CREATE OR REPLACE FUNCTION public.aps_aims_service_transition(p_asset_id uuid,p_kind text,p_action text,p_service_id uuid DEFAULT NULL,p_input jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w uuid; a public.aps_aims_entities%ROWTYPE; s public.aps_aims_entities%ROWTYPE; t text; busy text; payload jsonb; details jsonb; service_id uuid;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) OR NOT public.has_module_access('aps-aims',auth.uid()) THEN RAISE EXCEPTION 'APS AIMS service permission denied' USING ERRCODE='42501'; END IF;
w:=public.current_workspace_id(auth.uid());
IF w IS NULL OR p_kind NOT IN ('maintenance','calibration') OR p_action NOT IN ('start','complete') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid service transition'; END IF;
busy:=CASE WHEN p_kind='maintenance' THEN 'UnderMaintenance' ELSE 'UnderCalibration' END;
SELECT * INTO a FROM public.aps_aims_entities WHERE id=p_asset_id AND workspace_id=w AND entity_type='asset' AND NOT archived FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;
IF p_action='start' THEN
 IF a.payload->>'status'<>'Available' OR nullif(a.payload->>'currentCustodianId','') IS NOT NULL THEN RAISE EXCEPTION 'Asset must be available and unassigned'; END IF;
 IF EXISTS (SELECT 1 FROM public.aps_aims_entities WHERE workspace_id=w AND entity_type=p_kind AND NOT archived AND payload->>'assetId'=p_asset_id::text AND payload->>'isOpen'='true') THEN RAISE EXCEPTION 'Existing open service record'; END IF;
 IF p_kind='maintenance' AND length(btrim(coalesce(p_input->>'description','')))=0 THEN RAISE EXCEPTION 'Maintenance description required'; END IF;
 details:=jsonb_build_object('assetId',p_asset_id,'isOpen',true,'startedAt',transaction_timestamp(),'serviceProvider',left(coalesce(p_input->>'serviceProvider',''),300),'startNotes',left(coalesce(p_input->>'notes',''),2000));
 IF p_kind='maintenance' THEN details:=details||jsonb_build_object('description',left(p_input->>'description',2000)); END IF;
 INSERT INTO public.aps_aims_entities(workspace_id,entity_type,payload) VALUES(w,p_kind,details) RETURNING id INTO service_id;
 payload:=a.payload||jsonb_build_object('status',busy);
ELSE
 IF a.payload->>'status'<>busy OR p_service_id IS NULL THEN RAISE EXCEPTION 'Asset is not in the requested service state'; END IF;
 SELECT * INTO s FROM public.aps_aims_entities WHERE id=p_service_id AND workspace_id=w AND entity_type=p_kind AND NOT archived FOR UPDATE;
 IF NOT FOUND OR s.payload->>'assetId' IS DISTINCT FROM p_asset_id::text OR s.payload->>'isOpen' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'No matching open service record'; END IF;
 IF p_kind='calibration' AND coalesce(p_input->>'result','') NOT IN ('Passed','Failed','Conditional') THEN RAISE EXCEPTION 'Invalid calibration result'; END IF;
 IF p_kind='maintenance' AND p_input ? 'cost' AND jsonb_typeof(p_input->'cost') NOT IN ('null','number') THEN RAISE EXCEPTION 'Invalid maintenance cost'; END IF;
 details:=jsonb_build_object('isOpen',false,'completedAt',transaction_timestamp(),'completionNotes',left(coalesce(p_input->>'completionNotes',''),2000));
 IF p_kind='maintenance' THEN details:=details||jsonb_build_object('cost',p_input->'cost','currency',left(coalesce(p_input->>'currency',''),10),'nextMaintenanceDueAt',p_input->'nextMaintenanceDueAt');
 ELSE details:=details||jsonb_build_object('certificateNumber',left(coalesce(p_input->>'certificateNumber',''),200),'result',p_input->>'result','nextCalibrationDueAt',p_input->'nextCalibrationDueAt'); END IF;
 UPDATE public.aps_aims_entities SET payload=s.payload||details WHERE id=s.id;
 service_id:=s.id;
 payload:=a.payload||jsonb_build_object('status',CASE WHEN p_kind='calibration' AND p_input->>'result'='Failed' THEN 'Quarantined' ELSE 'Available' END);
END IF;
UPDATE public.aps_aims_entities SET payload=payload WHERE id=a.id;
INSERT INTO public.aps_aims_entities(workspace_id,entity_type,payload) VALUES(w,'transaction',jsonb_build_object('assetId',a.id,'type',CASE WHEN p_kind='maintenance' THEN 'Maintenance' ELSE 'Calibration' END||initcap(p_action),'fromStatus',a.payload->>'status','toStatus',payload->>'status','serviceId',service_id,'occurredAt',transaction_timestamp()));
RETURN payload||jsonb_build_object('id',a.id);
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_service_transition(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aps_aims_service_transition(uuid,text,text,uuid,jsonb) TO authenticated;;
