CREATE OR REPLACE FUNCTION public.aps_aims_custody_transition(
 p_asset_id uuid, p_action text, p_target_id uuid, p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_ws uuid; v_asset public.aps_aims_entities%ROWTYPE; v_target public.aps_aims_entities%ROWTYPE;
 v_open public.aps_aims_entities%ROWTYPE; v_payload jsonb; v_custody jsonb;
 v_now timestamptz := transaction_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) OR NOT public.has_module_access('aps-aims',auth.uid()) THEN
 RAISE EXCEPTION 'APS AIMS custody permission denied' USING ERRCODE='42501'; END IF;
 v_ws := public.current_workspace_id(auth.uid());
 IF v_ws IS NULL OR p_action NOT IN ('issue','return') OR p_target_id IS NULL THEN RAISE EXCEPTION 'Invalid custody request'; END IF;
 SELECT * INTO v_asset FROM public.aps_aims_entities WHERE id=p_asset_id AND workspace_id=v_ws AND entity_type='asset' AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;
 IF p_action='issue' THEN
 IF v_asset.payload->>'status' <> 'Available' OR nullif(v_asset.payload->>'currentCustodianId','') IS NOT NULL THEN RAISE EXCEPTION 'Asset must be available and without a custodian'; END IF;
 SELECT * INTO v_target FROM public.aps_aims_entities WHERE id=p_target_id AND workspace_id=v_ws AND entity_type='employee' AND NOT archived AND coalesce((payload->>'isActive')::boolean,true);
 IF NOT FOUND THEN RAISE EXCEPTION 'Active employee not found'; END IF;
 IF EXISTS (SELECT 1 FROM public.aps_aims_entities WHERE workspace_id=v_ws AND entity_type='custody' AND payload->>'assetId'=p_asset_id::text AND payload->>'isOpen'='true' AND NOT archived) THEN RAISE EXCEPTION 'Asset already has an open custody record'; END IF;
 v_custody := jsonb_build_object('assetId',p_asset_id,'employeeId',p_target_id,'employeeName',coalesce(v_target.payload->>'displayName',v_target.payload->>'firstName',''),'issuedFromLocationId',v_asset.payload->>'currentLocationId','issuedFromLocationName',v_asset.payload->>'currentLocationName','issuedAt',v_now,'issueNotes',left(coalesce(p_notes,''),2000),'isOpen',true);
 INSERT INTO public.aps_aims_entities(workspace_id,entity_type,payload) VALUES(v_ws,'custody',v_custody);
 v_payload := v_asset.payload || jsonb_build_object('status','Issued','currentCustodianId',p_target_id,'currentCustodianName',coalesce(v_target.payload->>'displayName',v_target.payload->>'firstName',''));
 ELSE
 IF v_asset.payload->>'status' <> 'Issued' THEN RAISE EXCEPTION 'Only issued assets may be returned'; END IF;
 SELECT * INTO v_target FROM public.aps_aims_entities WHERE id=p_target_id AND workspace_id=v_ws AND entity_type='location' AND NOT archived AND coalesce((payload->>'isActive')::boolean,true);
 IF NOT FOUND THEN RAISE EXCEPTION 'Active return location not found'; END IF;
 SELECT * INTO v_open FROM public.aps_aims_entities WHERE workspace_id=v_ws AND entity_type='custody' AND payload->>'assetId'=p_asset_id::text AND payload->>'isOpen'='true' AND NOT archived ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open custody record not found'; END IF;
 UPDATE public.aps_aims_entities SET payload=v_open.payload || jsonb_build_object('isOpen',false,'returnedAt',v_now,'returnedToLocationId',p_target_id,'returnedToLocationName',v_target.payload->>'name','returnNotes',left(coalesce(p_notes,''),2000)) WHERE id=v_open.id;
 v_payload := v_asset.payload || jsonb_build_object('status','Available','currentCustodianId',null,'currentCustodianName',null,'currentLocationId',p_target_id,'currentLocationName',v_target.payload->>'name');
 END IF;
 UPDATE public.aps_aims_entities SET payload=v_payload WHERE id=p_asset_id;
 INSERT INTO public.aps_aims_entities(workspace_id,entity_type,payload) VALUES(v_ws,'transaction',jsonb_build_object('assetId',p_asset_id,'type',initcap(p_action),'fromStatus',v_asset.payload->>'status','toStatus',v_payload->>'status','fromCustodianId',v_asset.payload->>'currentCustodianId','toCustodianId',v_payload->>'currentCustodianId','fromLocationId',v_asset.payload->>'currentLocationId','toLocationId',v_payload->>'currentLocationId','notes',left(coalesce(p_notes,''),2000),'occurredAt',v_now));
 RETURN v_payload || jsonb_build_object('id',p_asset_id);
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_custody_transition(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aps_aims_custody_transition(uuid,text,uuid,text) TO authenticated;;
