-- CP-URM-SCOPED-02C Charter domain + TimeTracker team directory parity.
-- Follows scoped-six migration. No historical role backfill or policy relaxation.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.apsyntra_charter_workspace_roles(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('admin','user')),
 enabled boolean NOT NULL DEFAULT true,
 assigned_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
ALTER TABLE public.apsyntra_charter_workspace_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.apsyntra_charter_workspace_roles FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_charter_current_role(p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $role$
 SELECT CASE
 WHEN EXISTS(SELECT 1 FROM public.apsyntra_charter_workspace_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id)
 THEN (SELECT CASE WHEN s.enabled THEN s.role ELSE NULL END
   FROM public.apsyntra_charter_workspace_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id)
 ELSE (SELECT CASE WHEN m.role IN ('admin','user') THEN m.role ELSE NULL END
   FROM public.module_role_assignments m WHERE m.user_id=p_user_id
     AND m.module_id='charter-navigator' AND m.enabled IS TRUE) END
 WHERE p_user_id IS NOT NULL AND p_workspace_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.workspace_members w
 JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
 WHERE w.workspace_id=p_workspace_id AND w.user_id=p_user_id AND w.active IS TRUE);
$role$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_charter_workspace_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $rpc$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN pg_catalog.jsonb_build_object('contract','cp-urm-charter-workspace-v1',
 'workspaceId',p_workspace_id,
 'assignments',COALESCE((SELECT pg_catalog.jsonb_agg(
 pg_catalog.jsonb_build_object('userId',s.user_id,'moduleId','charter-navigator',
 'role',s.role,'enabled',s.enabled,'updatedAt',s.updated_at)
 ORDER BY s.user_id)
 FROM public.apsyntra_charter_workspace_roles s
 JOIN public.workspace_members w ON w.workspace_id=s.workspace_id AND w.user_id=s.user_id AND w.active
 JOIN public.profiles p ON p.id=s.user_id AND p.status='active'
 WHERE s.workspace_id=p_workspace_id),'[]'::jsonb));
END;$rpc$;

CREATE OR REPLACE FUNCTION public.apsyntra_role_charter_workspace_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $rpc$
DECLARE v_actor uuid:=auth.uid();
 old_row public.apsyntra_charter_workspace_roles%rowtype;
 new_row public.apsyntra_charter_workspace_roles%rowtype;
 v_change uuid;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR
 p_role IS NULL OR p_role NOT IN ('admin','user') OR p_enabled IS NULL OR
 EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=p_target_user_id) THEN
 RAISE EXCEPTION 'Invalid, self or protected Charter target' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members w
 JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
 WHERE w.workspace_id=p_workspace_id AND w.user_id=p_target_user_id AND w.active) THEN
 RAISE EXCEPTION 'Charter target not active in workspace' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 p_workspace_id::text||':charter:'||p_target_user_id::text,0));
 SELECT * INTO old_row FROM public.apsyntra_charter_workspace_roles
 WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
 IF old_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
 RAISE EXCEPTION 'Charter role changed; refresh before retrying' USING ERRCODE='PT409';
 END IF;
 IF NOT p_enabled AND old_row.user_id IS NULL AND NOT EXISTS(
 SELECT 1 FROM public.module_role_assignments m WHERE m.user_id=p_target_user_id
 AND m.module_id='charter-navigator' AND m.enabled AND m.role IN ('admin','user')) THEN
 RAISE EXCEPTION 'No active Charter role to revoke' USING ERRCODE='PT409';END IF;
 INSERT INTO public.apsyntra_charter_workspace_roles(
 workspace_id,user_id,role,enabled,assigned_by,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_role,p_enabled,v_actor,pg_catalog.clock_timestamp())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET
 role=EXCLUDED.role,enabled=EXCLUDED.enabled,assigned_by=EXCLUDED.assigned_by,
 updated_at=pg_catalog.clock_timestamp()
 RETURNING * INTO new_row;
 INSERT INTO public.apsyntra_role_change_requests(workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,
 CASE WHEN p_enabled THEN 'assignment.assign' ELSE 'assignment.revoke' END,
 pg_catalog.jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
 'resourceId','charter-navigator','source','charter_workspace_roles',
 'previousRole',old_row.role,'previousEnabled',old_row.enabled,
 'result',pg_catalog.jsonb_build_object('role',new_row.role,'enabled',new_row.enabled,
 'updatedAt',new_row.updated_at)),'applied') RETURNING id INTO v_change;
 INSERT INTO public.apsyntra_role_change_audit(change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change,p_workspace_id,v_actor,'applied',pg_catalog.jsonb_build_object(
 'targetUserId',p_target_user_id,'scope','module','resourceId','charter-navigator',
 'source','charter_workspace_roles','before',old_row.role,'after',new_row.role,
 'enabled',new_row.enabled));
 RETURN pg_catalog.jsonb_build_object('effective',true,'workspaceId',p_workspace_id,
 'targetUserId',p_target_user_id,'moduleId','charter-navigator','role',new_row.role,
 'enabled',new_row.enabled,'updatedAt',new_row.updated_at,'changeId',v_change);
END;$rpc$;

-- Route genuine Charter operational permission resolution through the same role.
DO $patch$
DECLARE s text;t text;
BEGIN
 s:=pg_catalog.pg_get_functiondef(
 'public.charter_dispatch(uuid,text,text,jsonb)'::regprocedure);
 IF position('JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id=''charter-navigator'' AND m.enabled' IN s)=0 THEN
 RAISE EXCEPTION 'Charter dispatch source drift' USING ERRCODE='55000';END IF;
 t:=pg_catalog.replace(s,
 'SELECT p.display_name,p.email,m.role INTO v_name,v_email,role_name',
 'SELECT p.display_name,p.email,public.apsyntra_charter_current_role(p.id,p_workspace_id) INTO v_name,v_email,role_name');
 t:=pg_catalog.replace(t,
 ' JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id=''charter-navigator'' AND m.enabled',
 '');
 t:=pg_catalog.replace(t,'WHERE p.id=uid AND p.status=''active'' AND m.role IN (''admin'',''user'')',
 'WHERE p.id=uid AND p.status=''active''');
 t:=pg_catalog.replace(t,
 ' JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id=''charter-navigator'' AND m.enabled AND m.role IN (''admin'',''user'')',
 '');
 -- Subscriber list is an independently executed query, not covered by actor role lookup.
 t:=pg_catalog.replace(t,
 'WHERE p.status=''active''),''[]''::jsonb)',
 'WHERE p.status=''active'' AND public.apsyntra_charter_current_role(p.id,p_workspace_id) IS NOT NULL),''[]''::jsonb)');
 IF t=s OR position('m.role IN (''admin'',''user'')' IN t)>0 OR
 position('public.apsyntra_charter_current_role(p.id,p_workspace_id)' IN t)=0 THEN
 RAISE EXCEPTION 'Charter domain patch incomplete' USING ERRCODE='55000';END IF;
 EXECUTE t;

 s:=pg_catalog.pg_get_functiondef('public.module_role_for(text,uuid)'::regprocedure);
 IF position('public.apsyntra_scoped_module_role(' IN s)=0 THEN
 RAISE EXCEPTION 'Scoped module resolver prerequisite not present' USING ERRCODE='55000';END IF;
 t:=pg_catalog.replace(s,
 'public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id))',
 '(CASE WHEN p_module_id=''charter-navigator'' THEN public.apsyntra_charter_current_role(p_user_id,public.current_workspace_id(p_user_id)) ELSE public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id)) END)');
 IF t=s THEN RAISE EXCEPTION 'Shared module resolver patch missing' USING ERRCODE='55000';END IF;
 EXECUTE t;
 s:=pg_catalog.pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure);
 t:=pg_catalog.replace(s,
 'public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id))',
 '(CASE WHEN p_module_id=''charter-navigator'' THEN public.apsyntra_charter_current_role(p_user_id,public.current_workspace_id(p_user_id)) ELSE public.apsyntra_scoped_module_role(p_module_id,p_user_id,public.current_workspace_id(p_user_id)) END)');
 IF t=s THEN RAISE EXCEPTION 'Shared module access patch missing' USING ERRCODE='55000';END IF;
 EXECUTE t;

 s:=pg_catalog.pg_get_functiondef('public.apsyntra_crm_my_effective_access()'::regprocedure);
 IF position('WHEN ''tool-traceability'' THEN traceability.role' IN s)=0 THEN
 RAISE EXCEPTION 'CRM access projection source drift' USING ERRCODE='55000';END IF;
 t:=pg_catalog.replace(s,
 'WHEN ''tool-traceability'' THEN traceability.role',
 'WHEN ''tool-traceability'' THEN traceability.role'||
 E'\n        WHEN ''charter-navigator'' THEN public.apsyntra_charter_current_role(v_actor,v_workspace)');
 IF t=s THEN RAISE EXCEPTION 'CRM Charter role projection incomplete' USING ERRCODE='55000';END IF;
 EXECUTE t;

 s:=pg_catalog.pg_get_functiondef('public.wm_auth_access_context()'::regprocedure);
 IF position('from public.module_role_assignments m' IN s)=0 OR
 position('from public.material_tracker_memberships mt' IN s)=0 THEN
 RAISE EXCEPTION 'Workspace bootstrap source drift' USING ERRCODE='55000';END IF;
 t:=pg_catalog.replace(s,
 E'    where m.user_id = v_actor',
 E'    where m.user_id = v_actor'||
 E'\n      and not exists (select 1 from public.apsyntra_charter_workspace_roles charter'||
 E'\n        where charter.user_id=v_actor and charter.workspace_id=public.current_workspace_id(v_actor)'||
 E'\n          and m.module_id=''charter-navigator'')');
 t:=pg_catalog.replace(t,
 E'    select mt.user_id,',
 E'    select charter.user_id,''charter-navigator''::text,charter.role,charter.enabled,charter.updated_at'||
 E'\n    from public.apsyntra_charter_workspace_roles charter'||
 E'\n    join public.workspace_members w on w.user_id=charter.user_id and w.workspace_id=charter.workspace_id and w.active'||
 E'\n    where charter.user_id=v_actor and charter.workspace_id=public.current_workspace_id(v_actor)'||
 E'\n    union all'||
 E'\n    select mt.user_id,');
 IF t=s OR position('select charter.user_id,''charter-navigator''' IN t)=0 THEN
 RAISE EXCEPTION 'Workspace bootstrap Charter patch incomplete' USING ERRCODE='55000';END IF;
 EXECUTE t;
END;$patch$;

-- Match the TimeTracker team-directory assignment readback to its actual
-- workspace role source while retaining the existing bootstrap scope guard.
DO $team$
DECLARE s text;t text;
BEGIN
 s:=pg_catalog.pg_get_functiondef(
  'public.timetracker_team_directory_snapshot(uuid)'::regprocedure);
 IF position('public.apsyntra_role_require_bootstrap_scope(p_workspace_id)' IN s)=0 OR
 position('FROM public.module_role_assignments a JOIN public.workspace_members wm' IN s)=0 THEN
 RAISE EXCEPTION 'TimeTracker directory source drift' USING ERRCODE='55000';END IF;
 t:=pg_catalog.replace(s,
 'FROM public.module_role_assignments a JOIN public.workspace_members wm',
 'FROM public.module_role_assignments a JOIN public.workspace_members wm');
 t:=pg_catalog.replace(t,
 'WHERE a.module_id=''time-tracker''',
 'WHERE a.module_id=''time-tracker'' AND NOT EXISTS ('||
 'SELECT 1 FROM public.apsyntra_workspace_module_roles scoped WHERE scoped.workspace_id=p_workspace_id'||
 ' AND scoped.user_id=a.user_id AND scoped.module_id=''time-tracker'')');
 t:=pg_catalog.replace(t,
 'FROM public.module_role_assignments a JOIN public.workspace_members wm',
 'FROM (SELECT legacy.user_id,legacy.module_id,legacy.role,legacy.enabled,legacy.updated_at'||
 ' FROM public.module_role_assignments legacy WHERE legacy.module_id=''time-tracker'''||
 ' AND NOT EXISTS (SELECT 1 FROM public.apsyntra_workspace_module_roles scoped'||
 ' WHERE scoped.workspace_id=p_workspace_id AND scoped.user_id=legacy.user_id'||
 ' AND scoped.module_id=''time-tracker'') UNION ALL'||
 ' SELECT scoped.user_id,scoped.module_id,scoped.role,scoped.enabled,scoped.updated_at'||
 ' FROM public.apsyntra_workspace_module_roles scoped WHERE scoped.workspace_id=p_workspace_id'||
 ' AND scoped.module_id=''time-tracker'') a JOIN public.workspace_members wm');
 -- Source uses filter on union output; preserve it. Any explicit scoped
 -- membership (including disabled) takes precedence over the legacy global row.
 IF t=s OR position('UNION ALL SELECT scoped' IN t)=0 THEN
 RAISE EXCEPTION 'TimeTracker directory patch incomplete' USING ERRCODE='55000';END IF;
 EXECUTE t;
END;$team$;

CREATE OR REPLACE FUNCTION public.charter_admin_roles()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $admin$
DECLARE v_actor uuid:=auth.uid();v_workspace uuid;v_roles jsonb;
BEGIN
 IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
 RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id
 WHERE w.user_id=v_actor AND w.workspace_id=v_workspace AND w.active AND p.status='active') THEN
 RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501';END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'user_id',w.user_id,'role',COALESCE(s.role,m.role),
 'enabled',CASE WHEN s.user_id IS NOT NULL THEN s.enabled ELSE m.enabled END,
 'updated_at',COALESCE(s.updated_at,m.updated_at)) ORDER BY w.user_id),'[]'::jsonb)
 INTO v_roles FROM public.workspace_members w
 LEFT JOIN public.apsyntra_charter_workspace_roles s ON s.workspace_id=w.workspace_id AND s.user_id=w.user_id
 LEFT JOIN public.module_role_assignments m ON m.user_id=w.user_id AND m.module_id='charter-navigator'
 WHERE w.workspace_id=v_workspace AND w.active AND (s.user_id IS NOT NULL OR m.user_id IS NOT NULL);
 RETURN v_roles;
END;$admin$;

-- Existing Charter admin editor persists using workspace source; keep RPC shape.
CREATE OR REPLACE FUNCTION public.charter_admin_set_role(p_user_id uuid,p_role text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $admin$
DECLARE w uuid:=public.current_workspace_id(auth.uid());revision timestamptz;res jsonb;
BEGIN
 SELECT updated_at INTO revision FROM public.apsyntra_charter_workspace_roles
 WHERE workspace_id=w AND user_id=p_user_id;
 res:=public.apsyntra_role_charter_workspace_set(w,p_user_id,p_role,p_enabled,revision);
 RETURN pg_catalog.jsonb_build_object('user_id',p_user_id,'role',res->>'role',
 'enabled',res->'enabled','updated_at',res->'updatedAt');
END;$admin$;

REVOKE ALL ON FUNCTION public.apsyntra_charter_current_role(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apsyntra_role_charter_workspace_snapshot(uuid)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apsyntra_role_charter_workspace_set(uuid,uuid,text,boolean,timestamptz)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_charter_workspace_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_charter_workspace_set(uuid,uuid,text,boolean,timestamptz) TO authenticated;
COMMIT;
