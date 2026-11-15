CREATE OR REPLACE FUNCTION public.aps_aims_transfer_asset(p_asset_id uuid,p_location_id uuid,p_notes text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_ws uuid;v_asset public.aps_aims_entities%ROWTYPE;v_location public.aps_aims_entities%ROWTYPE;v_payload jsonb;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) OR NOT public.has_module_access('aps-aims',auth.uid()) THEN RAISE EXCEPTION 'APS AIMS transfer permission denied' USING ERRCODE='42501'; END IF;
v_ws:=public.current_workspace_id(auth.uid());
IF v_ws IS NULL OR p_asset_id IS NULL OR p_location_id IS NULL THEN RAISE EXCEPTION 'Invalid transfer request'; END IF;
SELECT * INTO v_asset FROM public.aps_aims_entities WHERE id=p_asset_id AND workspace_id=v_ws AND entity_type='asset' AND NOT archived FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;
IF v_asset.payload->>'status'<>'Available' OR nullif(v_asset.payload->>'currentCustodianId','') IS NOT NULL THEN RAISE EXCEPTION 'Only available, unassigned assets may be transferred'; END IF;
SELECT * INTO v_location FROM public.aps_aims_entities WHERE id=p_location_id AND workspace_id=v_ws AND entity_type='location' AND NOT archived AND coalesce((payload->>'isActive')::boolean,true);
IF NOT FOUND THEN RAISE EXCEPTION 'Destination location not found'; END IF;
IF v_asset.payload->>'currentLocationId'=p_location_id::text THEN RAISE EXCEPTION 'Asset is already in this location'; END IF;
v_payload:=v_asset.payload||jsonb_build_object('currentLocationId',p_location_id,'currentLocationName',v_location.payload->>'name');
UPDATE public.aps_aims_entities SET payload=v_payload WHERE id=p_asset_id;
INSERT INTO public.aps_aims_entities(workspace_id,entity_type,payload) VALUES(v_ws,'transaction',jsonb_build_object('assetId',p_asset_id,'type','Transfer','fromStatus',v_asset.payload->>'status','toStatus',v_payload->>'status','fromLocationId',v_asset.payload->>'currentLocationId','toLocationId',p_location_id,'notes',left(coalesce(p_notes,''),2000),'occurredAt',transaction_timestamp()));
RETURN v_payload||jsonb_build_object('id',p_asset_id);
END $$;
REVOKE ALL ON FUNCTION public.aps_aims_transfer_asset(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aps_aims_transfer_asset(uuid,uuid,text) TO authenticated;;
