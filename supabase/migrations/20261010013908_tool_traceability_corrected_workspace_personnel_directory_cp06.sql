
CREATE TABLE IF NOT EXISTS public.tool_traceability_personnel_v2 (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 id text NOT NULL,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
 role text NOT NULL CHECK (role IN ('Team Leader','Team Member')),
 team text NOT NULL CHECK (length(trim(team)) BETWEEN 2 AND 100),
 active boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 CONSTRAINT tool_traceability_personnel06_id CHECK (id ~ '^(eng-[1-9][0-9]{0,4}|tt-person-[0-9a-f-]{36})$')
);
ALTER TABLE public.tool_traceability_personnel_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tool_traceability_personnel_v2 FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS tool_traceability_personnel06_list ON public.tool_traceability_personnel_v2(workspace_id,role,team,name,id);
INSERT INTO public.tool_traceability_personnel_v2(workspace_id,id,name,role,team)
SELECT '00000000-0000-4000-8000-000000000001'::uuid,x.id,x.name,x.role,x.team
FROM (VALUES
 ('eng-1','Melchor R. Vasquez','Team Leader','Team Vasquez'),
 ('eng-2','Fabian D. Cataytay','Team Leader','Team Cataytay'),
 ('eng-3','Rodrigo S. Anonat','Team Member','Team Vasquez'),
 ('eng-4','Jelou D. Enson','Team Member','Team Vasquez'),
 ('eng-5','Dale M. Rusiana','Team Member','Team Vasquez'),
 ('eng-6','Joelito S. Catipay','Team Member','Team Vasquez'),
 ('eng-7','Mervin D. Premacio','Team Member','Team Vasquez'),
 ('eng-8','Edmundo C. Rosal','Team Member','Team Vasquez'),
 ('eng-9','Darril P. Humonong','Team Member','Team Cataytay'),
 ('eng-10','Archie P. Abucay','Team Member','Team Cataytay'),
 ('eng-11','Jeremias C. Enopia','Team Member','Team Cataytay'),
 ('eng-12','Ianikol N. De la Victoria','Team Member','Team Cataytay'),
 ('eng-13','Angelp A. Mallet','Team Member','Team Cataytay'),
 ('eng-14','Benjie R. Go','Team Member','Team Cataytay'),
 ('eng-15','Crizza Mae G. Luang','Team Member','Team Cataytay')
) AS x(id,name,role,team) ON CONFLICT(workspace_id,id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.tool_traceability_personnel_list_v2(p_workspace_id uuid,p_include_inactive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $f$
DECLARE v_rows jsonb;v_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN
  RAISE EXCEPTION 'Tool Traceability personnel access denied' USING ERRCODE='42501';END IF;
 IF coalesce(p_include_inactive,false) AND NOT private.tool_traceability_can_manage(p_workspace_id) THEN
  RAISE EXCEPTION 'Personnel administration permission required' USING ERRCODE='42501';END IF;
 SELECT count(*) INTO v_count FROM public.tool_traceability_personnel_v2
 WHERE workspace_id=p_workspace_id AND (active OR coalesce(p_include_inactive,false));
 IF v_count>200 THEN RAISE EXCEPTION 'Personnel directory exceeds current page capacity' USING ERRCODE='54000';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role,'team',p.team,'active',p.active,'version',p.version)
 ORDER BY p.role,p.team,p.name,p.id),'[]'::jsonb) INTO v_rows
 FROM public.tool_traceability_personnel_v2 p
 WHERE p.workspace_id=p_workspace_id AND (p.active OR coalesce(p_include_inactive,false));
 RETURN jsonb_build_object('items',v_rows,'total',v_count);
END;$f$;
REVOKE ALL ON FUNCTION public.tool_traceability_personnel_list_v2(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_personnel_list_v2(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.tool_traceability_personnel_manage_v2(
 p_workspace_id uuid,p_person_id text,p_name text,p_person_role text,p_team text,p_active boolean,p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $f$
DECLARE v_actor uuid:=auth.uid();v_row public.tool_traceability_personnel_v2%rowtype;v_id text;v_count integer;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_can_manage(p_workspace_id) THEN
  RAISE EXCEPTION 'Only active module ADMIN/LOGISTICS may manage personnel' USING ERRCODE='42501';END IF;
 IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 2 AND 160 OR p_person_role NOT IN ('Team Leader','Team Member') OR
 p_team IS NULL OR length(trim(p_team)) NOT BETWEEN 2 AND 100 OR p_active IS NULL THEN
  RAISE EXCEPTION 'Invalid personnel data' USING ERRCODE='22023';END IF;
 IF p_person_id IS NULL THEN
  IF p_expected_version IS NOT NULL OR p_active=false THEN RAISE EXCEPTION 'New personnel must be active and unversioned' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO v_count FROM public.tool_traceability_personnel_v2 WHERE workspace_id=p_workspace_id;
  IF v_count>=200 THEN RAISE EXCEPTION 'Personnel directory capacity reached' USING ERRCODE='54000';END IF;
  v_id:='tt-person-'||gen_random_uuid()::text;
  INSERT INTO public.tool_traceability_personnel_v2(workspace_id,id,name,role,team,active)
   VALUES(p_workspace_id,v_id,trim(p_name),p_person_role,trim(p_team),p_active) RETURNING * INTO v_row;
 ELSE
  IF p_person_id !~ '^(eng-[1-9][0-9]{0,4}|tt-person-[0-9a-f-]{36})$' OR p_expected_version IS NULL OR p_expected_version<1 THEN
   RAISE EXCEPTION 'Invalid personnel identity or version' USING ERRCODE='22023';END IF;
  UPDATE public.tool_traceability_personnel_v2 SET name=trim(p_name),role=p_person_role,team=trim(p_team),active=p_active,
   version=version+1,updated_at=clock_timestamp()
  WHERE workspace_id=p_workspace_id AND id=p_person_id AND version=p_expected_version RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personnel changed, missing, or version conflict' USING ERRCODE='40001';END IF;
 END IF;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'personnel',v_row.id,v_actor,'personnel_configured',jsonb_build_object('role',v_row.role,'active',v_row.active,'version',v_row.version));
 RETURN jsonb_build_object('id',v_row.id,'name',v_row.name,'role',v_row.role,'team',v_row.team,'active',v_row.active,'version',v_row.version);
END;$f$;
REVOKE ALL ON FUNCTION public.tool_traceability_personnel_manage_v2(uuid,text,text,text,text,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_personnel_manage_v2(uuid,text,text,text,text,boolean,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.tool_traceability_set_team_v2(
 p_workspace_id uuid,p_request_id text,p_leader_id text,p_member_ids jsonb,p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $f$
DECLARE v_actor uuid:=auth.uid();v_req public.tool_traceability_requests%rowtype;
 v_leader jsonb:='[]'::jsonb;v_members jsonb:='[]'::jsonb;
 v_person public.tool_traceability_personnel_v2%rowtype;v_id text;v_index integer;v_seen text[]:=ARRAY[]::text[];
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR
 (NOT private.tool_traceability_can_manage(p_workspace_id) AND NOT private.tool_traceability_can_create(p_workspace_id)) THEN
  RAISE EXCEPTION 'Team assignment access denied' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_request_id !~ '^tt-req-[a-zA-Z0-9-]{20,100}$' OR
 p_expected_version IS NULL OR p_expected_version<1 OR p_member_ids IS NULL OR
 jsonb_typeof(p_member_ids)<>'array' OR jsonb_array_length(p_member_ids)>15 THEN
  RAISE EXCEPTION 'Invalid team assignment' USING ERRCODE='22023';END IF;
 SELECT * INTO v_req FROM public.tool_traceability_requests WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002';END IF;
 IF NOT private.tool_traceability_can_manage(p_workspace_id) AND v_req.creator_user_id IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Only requester or module manager may assign this team' USING ERRCODE='42501';END IF;
 IF v_req.request_status<>'Pending Approval' THEN RAISE EXCEPTION 'Request is not pending' USING ERRCODE='22023';END IF;
 IF v_req.version<>p_expected_version THEN RAISE EXCEPTION 'Stale request version' USING ERRCODE='40001';END IF;
 IF coalesce(p_leader_id,'')<>'' THEN
  SELECT * INTO v_person FROM public.tool_traceability_personnel_v2
   WHERE workspace_id=p_workspace_id AND id=p_leader_id AND role='Team Leader' AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive or unknown team leader' USING ERRCODE='22023';END IF;
  v_leader:=jsonb_build_array(jsonb_build_object('id',v_person.id,'name',v_person.name,'role',v_person.role,'team',v_person.team));
 END IF;
 FOR v_index IN 0..jsonb_array_length(p_member_ids)-1 LOOP
  IF jsonb_typeof(p_member_ids->v_index)<>'string' THEN RAISE EXCEPTION 'Invalid member identity' USING ERRCODE='22023';END IF;
  v_id:=p_member_ids->>v_index;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate team member' USING ERRCODE='22023';END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_person FROM public.tool_traceability_personnel_v2
   WHERE workspace_id=p_workspace_id AND id=v_id AND role='Team Member' AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive or unknown team member' USING ERRCODE='22023';END IF;
  v_members:=v_members||jsonb_build_array(jsonb_build_object('id',v_person.id,'name',v_person.name,'role',v_person.role,'team',v_person.team));
 END LOOP;
 RETURN public.tool_traceability_update_request(p_workspace_id,p_request_id,
  jsonb_build_object('teamLeader',v_leader,'teamMembers',v_members),p_expected_version);
END;$f$;
REVOKE ALL ON FUNCTION public.tool_traceability_set_team_v2(uuid,text,text,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_set_team_v2(uuid,text,text,jsonb,bigint) TO authenticated;
;
