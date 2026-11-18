-- CP-URM-SCOPED-02B: workspace source for six shared-guard applications.
-- Charter Navigator's direct domain resolver is deliberately excluded.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

CREATE TABLE IF NOT EXISTS public.apsyntra_workspace_module_roles(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 module_id text NOT NULL CHECK(module_id IN
 ('time-tracker','fueltrack-plus','tradelink','order-intake','employee-eval','aps-aims')),
 role text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 assigned_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,module_id)
);
ALTER TABLE public.apsyntra_workspace_module_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.apsyntra_workspace_module_roles FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $read$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.apsyntra_workspace_module_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.module_id=p_module_id)
  THEN (SELECT CASE WHEN s.enabled THEN s.role ELSE NULL END
        FROM public.apsyntra_workspace_module_roles s
        WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.module_id=p_module_id)
  ELSE (SELECT m.role FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled IS TRUE)
 END
 WHERE p_user_id IS NOT NULL AND p_workspace_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
    WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id AND wm.active IS TRUE);
$read$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_scoped_six_snapshot(
 p_workspace_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $rpc$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN pg_catalog.jsonb_build_object('contract','cp-urm-scoped-six-v1',
 'workspaceId',p_workspace_id,'assignments',COALESCE((
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'userId',s.user_id,'moduleId',s.module_id,'role',s.role,
  'enabled',s.enabled,'updatedAt',s.updated_at) ORDER BY s.user_id,s.module_id)
 FROM public.apsyntra_workspace_module_roles s
 JOIN public.workspace_members wm ON wm.workspace_id=s.workspace_id
  AND wm.user_id=s.user_id AND wm.active IS TRUE
 JOIN public.profiles p ON p.id=s.user_id AND p.status='active'
 WHERE s.workspace_id=p_workspace_id
 ),'[]'::jsonb));
END;
$rpc$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_scoped_six_set(
 p_workspace_id uuid,p_target_user_id uuid,p_module_id text,p_role text,
 p_enabled boolean,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $rpc$
DECLARE
 v_actor uuid:=auth.uid();
 v_prior public.apsyntra_workspace_module_roles%rowtype;
 v_result public.apsyntra_workspace_module_roles%rowtype;
 v_change uuid;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR
 p_enabled IS NULL OR p_module_id IS NULL OR p_role IS NULL OR
 EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
  WHERE b.user_id=p_target_user_id) THEN
  RAISE EXCEPTION 'Invalid, self or protected role target' USING ERRCODE='42501';
 END IF;
 IF NOT (CASE p_module_id
 WHEN 'time-tracker' THEN p_role=ANY(ARRAY['Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator'])
 WHEN 'fueltrack-plus' THEN p_role=ANY(ARRAY['User','Pump Attendant','Admin'])
 WHEN 'tradelink' THEN p_role=ANY(ARRAY['User','Sales Supervisor','General Manager'])
 WHEN 'order-intake' THEN p_role=ANY(ARRAY['Admin','User','Viewer'])
 WHEN 'employee-eval' THEN p_role=ANY(ARRAY['admin','supervisor','employee'])
 WHEN 'aps-aims' THEN p_role=ANY(ARRAY['Administrator','AssetManager','Custodian','Viewer'])
 ELSE FALSE END) THEN
  RAISE EXCEPTION 'Unsupported application role' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
 WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_target_user_id
 AND wm.active IS TRUE) THEN
  RAISE EXCEPTION 'Target is not an active member of this workspace' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 p_workspace_id::text||':'||p_target_user_id::text||':'||p_module_id,0));
 SELECT * INTO v_prior FROM public.apsyntra_workspace_module_roles
 WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id
 AND module_id=p_module_id FOR UPDATE;
 IF v_prior.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Application role changed; refresh before retrying' USING ERRCODE='PT409';
 END IF;
 IF NOT p_enabled AND v_prior.user_id IS NULL AND NOT EXISTS(
  SELECT 1 FROM public.module_role_assignments a WHERE a.user_id=p_target_user_id
  AND a.module_id=p_module_id AND a.enabled IS TRUE) THEN
  RAISE EXCEPTION 'No enabled application role to revoke' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.apsyntra_workspace_module_roles(
 workspace_id,user_id,module_id,role,enabled,assigned_by,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_module_id,p_role,p_enabled,v_actor,
 pg_catalog.clock_timestamp())
 ON CONFLICT(workspace_id,user_id,module_id) DO UPDATE SET
 role=EXCLUDED.role,enabled=EXCLUDED.enabled,assigned_by=EXCLUDED.assigned_by,
 updated_at=pg_catalog.clock_timestamp() RETURNING * INTO v_result;
 INSERT INTO public.apsyntra_role_change_requests(
 workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,
 CASE WHEN p_enabled THEN 'assignment.assign' ELSE 'assignment.revoke' END,
 pg_catalog.jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
 'resourceId',p_module_id,'previousRole',v_prior.role,
 'previousEnabled',v_prior.enabled,'result',
 pg_catalog.jsonb_build_object('role',v_result.role,'enabled',v_result.enabled,
 'updatedAt',v_result.updated_at),'source','workspace_module_roles'),'applied')
 RETURNING id INTO v_change;
 INSERT INTO public.apsyntra_role_change_audit(change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change,p_workspace_id,v_actor,'applied',
 pg_catalog.jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
 'resourceId',p_module_id,'before',v_prior.role,'after',v_result.role,
 'enabled',v_result.enabled,'source','workspace_module_roles'));
 RETURN pg_catalog.jsonb_build_object(
 'effective',true,'workspaceId',p_workspace_id,'targetUserId',p_target_user_id,
 'moduleId',p_module_id,'role',v_result.role,'enabled',v_result.enabled,
 'updatedAt',v_result.updated_at,'changeId',v_change);
END;
$rpc$;

-- Patch the currently deployed central resolvers rather than replacing
-- their existing platform-role ceilings or administrator behavior.
DO $patch$
DECLARE s text;t text;
BEGIN
 s:=pg_catalog.pg_get_functiondef('public.module_role_for(text,uuid)'::regprocedure);
 IF position('public.module_role_assignments' IN s)=0 OR
    position('public.apsyntra_crm_module_role_rank' IN s)=0 THEN
  RAISE EXCEPTION 'module_role_for source drift' USING ERRCODE='55000';
 END IF;
 t:=regexp_replace(s,
 '\(SELECT m\.role FROM public\.module_role_assignments m\s+WHERE m\.user_id=p_user_id AND m\.module_id=p_module_id AND m\.enabled=true\)',
 '(SELECT public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id)))','g');
 IF t=s OR position('module_role_assignments' IN t)>0 THEN
  RAISE EXCEPTION 'module_role_for source patch incomplete' USING ERRCODE='55000';
 END IF;
 EXECUTE t;

 s:=pg_catalog.pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure);
 IF position('public.module_role_assignments' IN s)=0 OR
    position('public.module_role_for' IN s)=0 THEN
  RAISE EXCEPTION 'has_module_access source drift' USING ERRCODE='55000';
 END IF;
 t:=regexp_replace(s,
 'EXISTS\(\s*SELECT 1 FROM public\.module_role_assignments m\s+WHERE m\.user_id=p_user_id AND m\.module_id=p_module_id AND m\.enabled=true\)',
 '(public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id)) IS NOT NULL)','g');
 IF t=s OR position('module_role_assignments' IN t)>0 THEN
  RAISE EXCEPTION 'has_module_access source patch incomplete' USING ERRCODE='55000';
 END IF;
 EXECUTE t;

 s:=pg_catalog.pg_get_functiondef('public.apsyntra_crm_my_effective_access()'::regprocedure);
 IF position('WHEN ''tool-traceability'' THEN traceability.role' IN s)=0 OR
    position('public.apsyntra_crm_module_role_rank' IN s)=0 THEN
  RAISE EXCEPTION 'CRM effective-access source drift' USING ERRCODE='55000';
 END IF;
 t:=pg_catalog.replace(s,'WHEN ''tool-traceability'' THEN traceability.role',
  'WHEN ''tool-traceability'' THEN traceability.role'||
  E'\n        WHEN ''time-tracker'' THEN public.apsyntra_scoped_module_role(''time-tracker'',v_actor,v_workspace)'||
  E'\n        WHEN ''fueltrack-plus'' THEN public.apsyntra_scoped_module_role(''fueltrack-plus'',v_actor,v_workspace)'||
  E'\n        WHEN ''tradelink'' THEN public.apsyntra_scoped_module_role(''tradelink'',v_actor,v_workspace)'||
  E'\n        WHEN ''order-intake'' THEN public.apsyntra_scoped_module_role(''order-intake'',v_actor,v_workspace)'||
  E'\n        WHEN ''employee-eval'' THEN public.apsyntra_scoped_module_role(''employee-eval'',v_actor,v_workspace)'||
  E'\n        WHEN ''aps-aims'' THEN public.apsyntra_scoped_module_role(''aps-aims'',v_actor,v_workspace)');
 IF t=s THEN RAISE EXCEPTION 'CRM effective-access patch not applied' USING ERRCODE='55000';END IF;
 EXECUTE t;
END;
$patch$;


-- Workspace bootstrap must present scoped assignments consistently with
-- module authorization. Preserve Material Tracker's separate projection.
DO $session$
DECLARE s text;t text;
BEGIN
 s:=pg_catalog.pg_get_functiondef('public.wm_auth_access_context()'::regprocedure);
 IF position('from public.module_role_assignments m' IN s)=0 OR
    position('from public.material_tracker_memberships mt' IN s)=0 THEN
  RAISE EXCEPTION 'Signed workspace source drift' USING ERRCODE='55000';
 END IF;
 t:=pg_catalog.replace(s,
  E'    where m.user_id = v_actor\n    union all',
  E'    where m.user_id = v_actor'||
  E'\n      and not exists (select 1 from public.apsyntra_workspace_module_roles scoped'||
  E'\n        where scoped.user_id = v_actor and scoped.module_id = m.module_id'||
  E'\n          and scoped.workspace_id = public.current_workspace_id(v_actor))'||
  E'\n    union all'||
  E'\n    select scoped.user_id,scoped.module_id,scoped.role,scoped.enabled,scoped.updated_at'||
  E'\n    from public.apsyntra_workspace_module_roles scoped'||
  E'\n    join public.workspace_members wm on wm.user_id=scoped.user_id'||
  E'\n      and wm.workspace_id=scoped.workspace_id and wm.active is true'||
  E'\n    where scoped.user_id=v_actor'||
  E'\n      and scoped.workspace_id=public.current_workspace_id(v_actor)'||
  E'\n    union all');
 IF t=s OR position('and not exists (select 1 from public.apsyntra_workspace_module_roles scoped' IN t)=0 THEN
  RAISE EXCEPTION 'Signed workspace projection patch incomplete' USING ERRCODE='55000';
 END IF;
 EXECUTE t;
END;
$session$;

REVOKE ALL ON FUNCTION public.apsyntra_scoped_module_role(text,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apsyntra_role_scoped_six_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apsyntra_role_scoped_six_set(uuid,uuid,text,text,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_scoped_six_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_scoped_six_set(uuid,uuid,text,text,boolean,timestamptz) TO authenticated;
COMMIT;
