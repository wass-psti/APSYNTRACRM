-- ACCESS-V2 APP ROLES RPC — REVIEW ONLY, NOT AUTO-APPLIED.
-- Prerequisite: ACCESS_MODEL_V2_REVIEW_ONLY.sql, seeded apps/features/admin role,
-- approved migration mapping, independent two-account PostgreSQL 17 acceptance.
-- No EXECUTE grants below until signed activation and RLS review.
BEGIN;

CREATE FUNCTION public.apsyntra_access_app_roles_snapshot_v2(
 p_workspace_id uuid,p_app_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $snapshot$
DECLARE v_actor uuid:=auth.uid();v_app access_v2.apps%ROWTYPE;v_rev bigint;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
 OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm
  JOIN public.profiles p ON p.id=wm.user_id
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=v_actor
   AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Signed app role workspace required' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_app FROM access_v2.apps a
  WHERE a.workspace_id=p_workspace_id AND a.key=p_app_key;
 IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'
  USING ERRCODE='P0002'; END IF;
 IF NOT access_v2.is_app_admin(v_actor,v_app.id) THEN
  RAISE EXCEPTION 'Application Administrator or System Admin required'
   USING ERRCODE='42501'; END IF;

 SELECT revision INTO v_rev FROM access_v2.app_revision WHERE app_id=v_app.id;
 IF v_rev IS NULL THEN RAISE EXCEPTION 'App role lifecycle seed missing'
  USING ERRCODE='42501'; END IF;

 RETURN (
 SELECT jsonb_build_object(
  'contract','apsyntra-app-roles-v2','authorized',true,
  'actorId',v_actor,'workspaceId',p_workspace_id,'appKey',p_app_key,
  'appId',v_app.id,'revision',v_rev,'canManage',true,
  'roles',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'key',r.role_key,'name',r.name,
    'description',r.description,'isAdminRole',r.is_admin_role,
    'memberCount',(SELECT count(*) FROM access_v2.app_role_members m
      JOIN public.workspace_members wm ON wm.user_id=m.user_id
       AND wm.workspace_id=p_workspace_id AND wm.active
      JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
      WHERE m.app_role_id=r.id AND m.app_id=r.app_id),
    'capabilities',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'featureKey',c.feature_key,'capability',c.capability,'allowed',c.allowed)
       ORDER BY c.feature_key,c.capability)
      FROM access_v2.app_role_capabilities c WHERE c.app_role_id=r.id),'[]'::jsonb)
   ) ORDER BY r.name)
   FROM access_v2.app_roles r WHERE r.app_id=v_app.id),'[]'::jsonb),
  'features',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'key',f.feature_key,'name',replace(f.feature_key,'_',' '),
    'availableCapabilities',f.allowed_actions)
    ORDER BY f.feature_key) FROM (
     SELECT feature_key,
      jsonb_agg(capability ORDER BY capability) AS allowed_actions
      FROM access_v2.app_features WHERE app_id=v_app.id GROUP BY feature_key
   ) f),'[]'::jsonb),
  'people',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'roleId',m.app_role_id,'userId',m.user_id,'name',p.display_name)
    ORDER BY p.display_name)
   FROM access_v2.app_role_members m
   JOIN public.workspace_members wm ON wm.user_id=m.user_id
     AND wm.workspace_id=p_workspace_id AND wm.active
   JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
   WHERE m.app_id=v_app.id),'[]'::jsonb),
  'directory',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'userId',p.id,'name',p.display_name,'email',p.email)
    ORDER BY p.display_name)
   FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=p_workspace_id AND wm.active),'[]'::jsonb)
 ));
END;
$snapshot$;
REVOKE ALL ON FUNCTION public.apsyntra_access_app_roles_snapshot_v2(uuid,text)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.apsyntra_access_app_roles_change_v2(
 p_workspace_id uuid,p_app_key text,p_action text,p_role_id uuid,
 p_name text,p_description text,p_target_user_id uuid,
 p_capability_patch jsonb,p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $change$
DECLARE
 v_actor uuid:=auth.uid();v_app access_v2.apps%ROWTYPE;
 v_role access_v2.app_roles%ROWTYPE;v_revision bigint;v_new_role uuid;
 v_patch jsonb;v_feature text;v_cap text;v_allowed boolean;v_key text;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_action NOT IN ('create','rename','description','duplicate','delete',
    'update_capabilities','assign_member','remove_member')
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.workspace_id=p_workspace_id AND wm.user_id=v_actor
    AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Verified and valid app role request required'
  USING ERRCODE='42501'; END IF;
 SELECT * INTO v_app FROM access_v2.apps a
 WHERE a.workspace_id=p_workspace_id AND a.key=p_app_key;
 IF v_app.id IS NULL THEN RAISE EXCEPTION 'App not found' USING ERRCODE='P0002'; END IF;
 IF NOT access_v2.is_app_admin(v_actor,v_app.id)
 THEN RAISE EXCEPTION 'Only the app Administrator or System Admin can edit roles'
   USING ERRCODE='42501'; END IF;

 -- Serializes app role edits across users; prevents last-write-wins on stale UI.
 PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('apsyntra-access-v2-app'),
  hashtext(v_app.id::text));
 SELECT revision INTO v_revision FROM access_v2.app_revision
 WHERE app_id=v_app.id FOR UPDATE;
 IF v_revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'App roles changed in another session'
  USING ERRCODE='PT409'; END IF;

 SELECT * INTO v_role FROM access_v2.app_roles r
 WHERE r.id=p_role_id AND r.app_id=v_app.id FOR UPDATE;
 IF p_action='create' THEN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Valid role name required' USING ERRCODE='22023'; END IF;
  v_key:='custom_'||lower(left(regexp_replace(btrim(p_name),'[^a-zA-Z0-9]+','_','g'),85));
  IF v_key !~ '^[a-z0-9][a-z0-9_-]{0,99}$'
  THEN RAISE EXCEPTION 'Invalid role key' USING ERRCODE='22023'; END IF;
  INSERT INTO access_v2.app_roles(app_id,role_key,name,description,is_admin_role)
  VALUES(v_app.id,v_key,btrim(p_name),coalesce(p_description,''),false)
  RETURNING id INTO v_new_role;
 ELSIF v_role.id IS NULL THEN
  RAISE EXCEPTION 'App role is missing or not in this app' USING ERRCODE='P0002';
 ELSIF p_action='rename' THEN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
   THEN RAISE EXCEPTION 'Invalid role name' USING ERRCODE='22023'; END IF;
  UPDATE access_v2.app_roles SET name=btrim(p_name),revision=revision+1
  WHERE id=v_role.id;
 ELSIF p_action='description' THEN
  IF p_description IS NULL OR length(p_description)>500
   THEN RAISE EXCEPTION 'Invalid description' USING ERRCODE='22023'; END IF;
  UPDATE access_v2.app_roles SET description=p_description,revision=revision+1
  WHERE id=v_role.id;
 ELSIF p_action='duplicate' THEN
  INSERT INTO access_v2.app_roles(app_id,role_key,name,description,is_admin_role)
  VALUES(v_app.id,
   left('copy_'||replace(v_role.id::text,'-',''),99),
   left(v_role.name||' (copy)',100),v_role.description,false)
  RETURNING id INTO v_new_role;
  INSERT INTO access_v2.app_role_capabilities(
   app_role_id,app_id,feature_key,capability,allowed,updated_by)
  SELECT v_new_role,v_app.id,feature_key,capability,allowed,v_actor
  FROM access_v2.app_role_capabilities WHERE app_role_id=v_role.id;
 ELSIF p_action='delete' THEN
  IF v_role.is_admin_role OR EXISTS(
   SELECT 1 FROM access_v2.app_role_members WHERE app_role_id=v_role.id)
  THEN RAISE EXCEPTION 'Reassign members first; App administrator role is protected'
   USING ERRCODE='PT409'; END IF;
  DELETE FROM access_v2.app_roles WHERE id=v_role.id;
 ELSIF p_action='update_capabilities' THEN
  IF p_capability_patch IS NULL OR jsonb_typeof(p_capability_patch->'patch')<>'array'
   OR jsonb_array_length(p_capability_patch->'patch')>300
  THEN RAISE EXCEPTION 'Invalid capability patch' USING ERRCODE='22023'; END IF;
  FOR v_patch IN SELECT value FROM jsonb_array_elements(p_capability_patch->'patch')
  LOOP
   IF jsonb_typeof(v_patch)<>'object'
    OR jsonb_typeof(v_patch->'featureKey')<>'string'
    OR jsonb_typeof(v_patch->'capability')<>'string'
    OR jsonb_typeof(v_patch->'allowed')<>'boolean'
   THEN RAISE EXCEPTION 'Invalid capability row' USING ERRCODE='22023'; END IF;
   v_feature:=v_patch->>'featureKey';v_cap:=v_patch->>'capability';
   v_allowed:=(v_patch->>'allowed')::boolean;
   IF NOT EXISTS(SELECT 1 FROM access_v2.app_features f
     WHERE f.app_id=v_app.id AND f.feature_key=v_feature
      AND f.capability::text=v_cap)
   THEN RAISE EXCEPTION 'Capability not defined by this application'
    USING ERRCODE='42501'; END IF;
   INSERT INTO access_v2.app_role_capabilities(
      app_role_id,app_id,feature_key,capability,allowed,updated_by)
   VALUES(v_role.id,v_app.id,v_feature,v_cap::access_v2.capability,
    v_allowed,v_actor)
   ON CONFLICT(app_role_id,feature_key,capability)
   DO UPDATE SET allowed=EXCLUDED.allowed,
    updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
  END LOOP;
  UPDATE access_v2.app_roles SET revision=revision+1 WHERE id=v_role.id;
 ELSIF p_action IN ('assign_member','remove_member') THEN
  IF p_target_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
    WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_target_user_id AND wm.active)
  THEN RAISE EXCEPTION 'Active workspace user required' USING ERRCODE='42501'; END IF;
  IF p_action='assign_member' THEN
   INSERT INTO access_v2.app_role_members(app_role_id,app_id,user_id,assigned_by)
   VALUES(v_role.id,v_app.id,p_target_user_id,v_actor);
  ELSE
   DELETE FROM access_v2.app_role_members
   WHERE app_role_id=v_role.id AND user_id=p_target_user_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Member assignment not found'
    USING ERRCODE='PT409'; END IF;
  END IF;
 END IF;

 UPDATE access_v2.app_revision SET revision=revision+1
 WHERE app_id=v_app.id RETURNING revision INTO v_revision;
 INSERT INTO access_v2.audit_log(workspace_id,actor_id,action,target_type,target_id,metadata)
 VALUES(p_workspace_id,v_actor,'app_role_'||p_action,'app_role',coalesce(v_new_role,p_role_id),
  jsonb_build_object('appId',v_app.id,'appKey',p_app_key,
   'targetUserId',p_target_user_id,'revision',v_revision));
 RETURN jsonb_build_object('contract','apsyntra-app-roles-change-v2',
  'state','committed','workspaceId',p_workspace_id,'actorId',v_actor,
  'appKey',p_app_key,'appId',v_app.id,'action',p_action,
  'revision',v_revision,'roleId',coalesce(v_new_role,p_role_id));
END;
$change$;
REVOKE ALL ON FUNCTION public.apsyntra_access_app_roles_change_v2(
 uuid,text,text,uuid,text,text,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;

-- Neither function is granted to browser roles. Review, test and explicitly
-- grant EXECUTE only in a separate approved, reversible release.
NOTIFY pgrst,'reload schema';
COMMIT;
