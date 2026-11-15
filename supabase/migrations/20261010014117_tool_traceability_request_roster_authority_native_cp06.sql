CREATE OR REPLACE FUNCTION public.tool_traceability_create_request_with_team_v2(p_workspace_id uuid,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $f$
DECLARE v_leader jsonb:='[]'::jsonb;v_members jsonb:='[]'::jsonb;v_id text;v_index integer;v_row public.tool_traceability_personnel_v2%rowtype;v_seen text[]:=ARRAY[]::text[];v_id_array jsonb;v_leaders jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_can_create(p_workspace_id) THEN RAISE EXCEPTION 'Request creation denied' USING ERRCODE='42501';END IF;
 IF p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' THEN RAISE EXCEPTION 'Invalid request fields' USING ERRCODE='22023';END IF;
 v_leaders:=coalesce(p_fields->'teamLeader','[]'::jsonb);v_id_array:=coalesce(p_fields->'teamMembers','[]'::jsonb);
 IF jsonb_typeof(v_leaders)<>'array' OR jsonb_array_length(v_leaders)>1 OR jsonb_typeof(v_id_array)<>'array' OR jsonb_array_length(v_id_array)>15 THEN RAISE EXCEPTION 'Invalid personnel arrays' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(v_leaders)=1 THEN
  v_id:=v_leaders->0->>'id';
  SELECT * INTO v_row FROM public.tool_traceability_personnel_v2 WHERE workspace_id=p_workspace_id AND id=v_id AND active AND role='Team Leader' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive or unknown leader' USING ERRCODE='22023';END IF;
  v_leader:=jsonb_build_array(jsonb_build_object('id',v_row.id,'name',v_row.name,'role',v_row.role,'team',v_row.team));
 END IF;
 FOR v_index IN 0..jsonb_array_length(v_id_array)-1 LOOP
  IF jsonb_typeof(v_id_array->v_index)<>'object' THEN RAISE EXCEPTION 'Invalid member selection' USING ERRCODE='22023';END IF;
  v_id:=v_id_array->v_index->>'id';
  IF v_id IS NULL OR v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate/invalid member' USING ERRCODE='22023';END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_row FROM public.tool_traceability_personnel_v2 WHERE workspace_id=p_workspace_id AND id=v_id AND active AND role='Team Member' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive or unknown member' USING ERRCODE='22023';END IF;
  v_members:=v_members||jsonb_build_array(jsonb_build_object('id',v_row.id,'name',v_row.name,'role',v_row.role,'team',v_row.team));
 END LOOP;
 RETURN public.tool_traceability_create_item(p_workspace_id,'requests',(p_fields-'teamLeader'-'teamMembers')||jsonb_build_object('teamLeader',v_leader,'teamMembers',v_members));
END;$f$;
REVOKE ALL ON FUNCTION public.tool_traceability_create_request_with_team_v2(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_create_request_with_team_v2(uuid,jsonb) TO authenticated;;
