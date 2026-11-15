-- Native CP05, source-compatible personnel team-assignment RPC
CREATE OR REPLACE FUNCTION public.tool_traceability_set_team_v1(
p_workspace_id uuid,p_request_id text,p_leader_id text,p_member_ids jsonb,p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE
 v_actor uuid:=auth.uid(); v_req public.tool_traceability_requests%rowtype;
 v_leader jsonb:='[]'::jsonb;v_members jsonb:='[]'::jsonb;
 v_member text;v_index integer;v_person jsonb;v_ids text[]:=ARRAY[]::text[];
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR
 (NOT private.tool_traceability_can_manage(p_workspace_id) AND NOT private.tool_traceability_can_create(p_workspace_id)) THEN
 RAISE EXCEPTION 'Tool Traceability team assignment denied' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$'
 OR p_expected_version IS NULL OR p_expected_version<1 OR p_member_ids IS NULL
 OR jsonb_typeof(p_member_ids)<>'array' OR jsonb_array_length(p_member_ids)>15
 OR (p_leader_id IS NOT NULL AND length(p_leader_id)>20) THEN
 RAISE EXCEPTION 'Invalid team-assignment request' USING ERRCODE='22023';END IF;
 SELECT * INTO v_req FROM public.tool_traceability_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002';END IF;
 IF NOT private.tool_traceability_can_manage(p_workspace_id) AND v_req.creator_user_id IS DISTINCT FROM v_actor THEN
 RAISE EXCEPTION 'Only the requester or a module manager can edit this team' USING ERRCODE='42501';END IF;
 IF v_req.request_status<>'Pending Approval' THEN
 RAISE EXCEPTION 'Team assignments can only be changed while pending approval' USING ERRCODE='22023';END IF;
 IF v_req.version<>p_expected_version THEN RAISE EXCEPTION 'Stale request version' USING ERRCODE='40001';END IF;
 IF p_leader_id IS NOT NULL AND p_leader_id<>'' THEN
 SELECT jsonb_build_object('id',x.id,'name',x.name,'role',x.person_role,'team',x.team)
 INTO v_person FROM (VALUES
 ('eng-1','Melchor R. Vasquez','Team Leader','Team Vasquez'),
 ('eng-2','Joelito S. Catipay','Team Leader','Team Catipay'),
 ('eng-3','Jeremias C. Enopia','Team Leader','Team Enopia'),
 ('eng-4','Rodigo S. Anonat','Team Member','Team Vasquez'),
 ('eng-5','Fabian D. Cataytay','Team Member','Team Vasquez'),
 ('eng-6','Jeffrey Inot','Team Member','Team Vasquez'),
 ('eng-7','Jelou D. Enson','Team Member','Team Vasquez'),
 ('eng-8','Dale Rusiana','Team Member','Team Vasquez'),
 ('eng-9','Mervin D. Premacio','Team Member','Team Catipay'),
 ('eng-10','Edmundo C. Rosal','Team Member','Team Catipay'),
 ('eng-11','Darril P. Humonong','Team Member','Team Catipay'),
 ('eng-12','Archie P. Abucay','Team Member','Team Catipay'),
 ('eng-13','Ianikol N. Dela Victoria','Team Member','Team Enopia'),
 ('eng-14','Angelo A. Malait','Team Member','Team Enopia'),
 ('eng-15','Benjie R. Go','Team Member','Team Enopia'),
 ('eng-16','Crizza Mae G. Luang','Team Member','Team Enopia'),
 ('eng-17','Raymund Roy M. Perez','Team Member','Team Enopia'),
 ('eng-18','Lexter Jay B. Señagan','Team Member','Team Enopia')
 ) AS x(id,name,person_role,team) WHERE x.id=p_leader_id AND x.person_role='Team Leader';
 IF v_person IS NULL THEN RAISE EXCEPTION 'Unknown source team leader' USING ERRCODE='22023'; END IF;
 v_leader:=jsonb_build_array(v_person);END IF;
 FOR v_index IN 0..jsonb_array_length(p_member_ids)-1 LOOP
 IF jsonb_typeof(p_member_ids->v_index)<>'string' THEN RAISE EXCEPTION 'Invalid team member ID' USING ERRCODE='22023';END IF;
 v_member:=p_member_ids->>v_index;
 IF v_member=ANY(v_ids) THEN RAISE EXCEPTION 'Duplicate team member ID' USING ERRCODE='22023';END IF;
 v_ids:=array_append(v_ids,v_member);v_person:=NULL;
 SELECT jsonb_build_object('id',x.id,'name',x.name,'role',x.person_role,'team',x.team)
 INTO v_person FROM (VALUES
 ('eng-1','Melchor R. Vasquez','Team Leader','Team Vasquez'),
 ('eng-2','Joelito S. Catipay','Team Leader','Team Catipay'),
 ('eng-3','Jeremias C. Enopia','Team Leader','Team Enopia'),
 ('eng-4','Rodigo S. Anonat','Team Member','Team Vasquez'),
 ('eng-5','Fabian D. Cataytay','Team Member','Team Vasquez'),
 ('eng-6','Jeffrey Inot','Team Member','Team Vasquez'),
 ('eng-7','Jelou D. Enson','Team Member','Team Vasquez'),
 ('eng-8','Dale Rusiana','Team Member','Team Vasquez'),
 ('eng-9','Mervin D. Premacio','Team Member','Team Catipay'),
 ('eng-10','Edmundo C. Rosal','Team Member','Team Catipay'),
 ('eng-11','Darril P. Humonong','Team Member','Team Catipay'),
 ('eng-12','Archie P. Abucay','Team Member','Team Catipay'),
 ('eng-13','Ianikol N. Dela Victoria','Team Member','Team Enopia'),
 ('eng-14','Angelo A. Malait','Team Member','Team Enopia'),
 ('eng-15','Benjie R. Go','Team Member','Team Enopia'),
 ('eng-16','Crizza Mae G. Luang','Team Member','Team Enopia'),
 ('eng-17','Raymund Roy M. Perez','Team Member','Team Enopia'),
 ('eng-18','Lexter Jay B. Señagan','Team Member','Team Enopia')
 ) AS x(id,name,person_role,team) WHERE x.id=v_member AND x.person_role='Team Member';
 IF v_person IS NULL THEN RAISE EXCEPTION 'Unknown source team member' USING ERRCODE='22023'; END IF;
 v_members:=v_members||jsonb_build_array(v_person);
 END LOOP;
 RETURN public.tool_traceability_update_request(p_workspace_id,p_request_id,
 jsonb_build_object('teamLeader',v_leader,'teamMembers',v_members),p_expected_version);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_set_team_v1(uuid,text,text,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_set_team_v1(uuid,text,text,jsonb,bigint) TO authenticated;;
