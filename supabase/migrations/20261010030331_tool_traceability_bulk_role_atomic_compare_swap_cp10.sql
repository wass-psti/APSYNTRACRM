CREATE OR REPLACE FUNCTION public.tool_traceability_roles_bulk_update_v1(p_workspace_id uuid,p_assignments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_item jsonb;v_seen uuid[]:=ARRAY[]::uuid[];v_id uuid;v_role text;v_enabled boolean;v_stamp timestamptz;v_result jsonb;v_receipts jsonb:='[]'::jsonb;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN RAISE EXCEPTION 'Tool Traceability administrator required' USING ERRCODE='42501';END IF;
 IF p_assignments IS NULL OR jsonb_typeof(p_assignments)<>'array' OR jsonb_array_length(p_assignments) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Select 1 to 20 Workspace members' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('tool_traceability_roles09'),hashtext(p_workspace_id::text));
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_assignments) AS selected(value) LOOP
  IF jsonb_typeof(v_item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_item))<>4 OR
   NOT(v_item ?& ARRAY['user_id','role','enabled','expected_updated_at']) OR
   jsonb_typeof(v_item->'user_id')<>'string' OR
   (v_item->>'user_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
   jsonb_typeof(v_item->'role')<>'string' OR
   (v_item->>'role') NOT IN('ADMIN','LOGISTICS','USER','VIEWER') OR
   jsonb_typeof(v_item->'enabled')<>'boolean' OR
   jsonb_typeof(v_item->'expected_updated_at') NOT IN('string','null') THEN
   RAISE EXCEPTION 'Invalid bulk role assignment entry' USING ERRCODE='22023';END IF;
  v_id:=(v_item->>'user_id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate Workspace member selected' USING ERRCODE='22023';END IF;
  v_seen:=array_append(v_seen,v_id);
  IF jsonb_typeof(v_item->'expected_updated_at')='string' THEN
   IF length(v_item->>'expected_updated_at')>70 THEN RAISE EXCEPTION 'Invalid membership version timestamp' USING ERRCODE='22023';END IF;
   BEGIN v_stamp:=(v_item->>'expected_updated_at')::timestamptz;
   EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid membership version timestamp' USING ERRCODE='22023';END;
  END IF;
 END LOOP;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_assignments) AS selected(value) LOOP
  v_id:=(v_item->>'user_id')::uuid;v_role:=v_item->>'role';v_enabled:=(v_item->>'enabled')::boolean;
  v_stamp:=CASE WHEN v_item->>'expected_updated_at' IS NULL THEN NULL ELSE (v_item->>'expected_updated_at')::timestamptz END;
  v_result:=public.tool_traceability_roles_update_v2(p_workspace_id,v_id,v_role,v_enabled,v_stamp);
  IF v_result->>'user_id' IS DISTINCT FROM v_id::text OR v_result->>'role' IS DISTINCT FROM v_role OR
   (v_result->>'enabled')::boolean IS DISTINCT FROM v_enabled OR v_result->>'updated_at' IS NULL THEN
   RAISE EXCEPTION 'Bulk assignment acknowledgement mismatch' USING ERRCODE='40001';END IF;
  v_receipts:=v_receipts||jsonb_build_array(v_result);
 END LOOP;
 RETURN jsonb_build_object('items',v_receipts,'updated',jsonb_array_length(v_receipts),'atomic',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_roles_bulk_update_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_roles_bulk_update_v1(uuid,jsonb) TO authenticated;;
