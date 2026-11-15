CREATE OR REPLACE FUNCTION public.tool_traceability_set_extension(
p_workspace_id uuid,p_request_id text,p_state text,p_new_to date DEFAULT NULL::date,p_expected_version bigint DEFAULT NULL::bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private','pg_temp' AS $function$
DECLARE existing public.tool_traceability_requests%ROWTYPE; patch jsonb;
BEGIN
 SELECT * INTO existing FROM public.tool_traceability_requests WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE='P0002'; END IF;
 IF p_state='Extension Requested' THEN
  IF existing.request_status<>'Borrowed' OR existing.extension_state NOT IN ('None','Extension Approved','Extension Denied') THEN
   RAISE EXCEPTION 'extension request requires eligible borrowed request' USING ERRCODE='22023'; END IF;
  patch:=jsonb_build_object('extensionState',p_state);
 ELSIF p_state='Extension Approved' THEN
  IF existing.request_status<>'Borrowed' OR existing.extension_state<>'Extension Requested' THEN
   RAISE EXCEPTION 'approval requires a pending borrowed extension' USING ERRCODE='22023'; END IF;
  IF existing.borrow_from IS NULL OR existing.borrow_to IS NULL OR p_new_to IS NULL OR p_new_to<=existing.borrow_to THEN
   RAISE EXCEPTION 'extension deadline must be later than current return date' USING ERRCODE='22023'; END IF;
  patch:=jsonb_build_object('extensionState',p_state,'borrowWindow',jsonb_build_object('from',existing.borrow_from,'to',p_new_to));
 ELSIF p_state='Extension Denied' THEN
  IF existing.request_status<>'Borrowed' OR existing.extension_state<>'Extension Requested' THEN
   RAISE EXCEPTION 'denial requires a pending borrowed extension' USING ERRCODE='22023'; END IF;
  IF p_new_to IS NOT NULL THEN RAISE EXCEPTION 'denied extension cannot modify return date' USING ERRCODE='22023'; END IF;
  patch:=jsonb_build_object('extensionState',p_state);
 ELSE RAISE EXCEPTION 'unsupported extension state' USING ERRCODE='22023'; END IF;
 RETURN public.tool_traceability_update_request(p_workspace_id,p_request_id,patch,p_expected_version);
END; $function$;;
