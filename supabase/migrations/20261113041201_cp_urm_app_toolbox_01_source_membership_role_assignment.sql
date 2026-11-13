-- CP-URM-APP-TOOLBOX-01
-- Route CRM-admin Toolbox Issues assignment through its existing workspace-scoped
-- membership authority. Keep all other application-role contracts unchanged.
BEGIN;

DO $toolbox_role_dispatch$
DECLARE
 v_definition text;
 v_old text;
 v_new text;
 v_signature regprocedure :=
  'public.apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz)'::regprocedure;
BEGIN
 v_definition:=pg_get_functiondef(v_signature);

 -- Toolbox membership is keyed by (workspace_id,user_id), so it remains safe
 -- for members who belong to more than one active workspace. Other legacy
 -- globally keyed application roles retain their existing single-workspace gate.
 v_old:=$old$   IF p_resource_id<>'material-request-hub' AND
      (SELECT count(*) FROM public.workspace_members wm
       WHERE wm.user_id=p_target_user_id AND wm.active)<>1 THEN$old$;
 v_new:=$new$   IF p_resource_id NOT IN ('material-request-hub','toolbox-issues') AND
      (SELECT count(*) FROM public.workspace_members wm
       WHERE wm.user_id=p_target_user_id AND wm.active)<>1 THEN$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected central application workspace-scope guard';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 -- Read and lock the source membership revision rather than a global shadow row.
 v_old:=$old$   IF p_resource_id='material-request-hub' THEN
     SELECT role,updated_at INTO v_existing_role,v_existing_at
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
   ELSE
     SELECT role,updated_at INTO v_existing_role,v_existing_at
       FROM public.module_role_assignments
       WHERE user_id=p_target_user_id AND module_id=p_resource_id FOR UPDATE;
   END IF;$old$;
 v_new:=$new$   IF p_resource_id='material-request-hub' THEN
     SELECT role,updated_at INTO v_existing_role,v_existing_at
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
   ELSIF p_resource_id='toolbox-issues' THEN
     SELECT role,updated_at INTO v_existing_role,v_existing_at
       FROM public.toolbox_issues_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE;
   ELSE
     SELECT role,updated_at INTO v_existing_role,v_existing_at
       FROM public.module_role_assignments
       WHERE user_id=p_target_user_id AND module_id=p_resource_id FOR UPDATE;
   END IF;$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected central application role revision lookup';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 -- Preserve the source membership's previous role and enabled state in audit.
 v_old:=$old$   IF p_resource_id='material-request-hub' THEN
     SELECT CASE WHEN v_existing_at IS NULL THEN NULL ELSE
       jsonb_build_object('role',role,'enabled',enabled,'status',status) END
       INTO v_previous
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSE
     v_previous:=CASE WHEN v_existing_at IS NULL THEN NULL ELSE
       jsonb_build_object('role',v_existing_role,'enabled',
         (SELECT enabled FROM public.module_role_assignments
           WHERE user_id=p_target_user_id AND module_id=p_resource_id)) END;
   END IF;$old$;
 v_new:=$new$   IF p_resource_id='material-request-hub' THEN
     SELECT CASE WHEN v_existing_at IS NULL THEN NULL ELSE
       jsonb_build_object('role',role,'enabled',enabled,'status',status) END
       INTO v_previous
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSIF p_resource_id='toolbox-issues' THEN
     SELECT CASE WHEN v_existing_at IS NULL THEN NULL ELSE
       jsonb_build_object('role',role,'enabled',enabled) END
       INTO v_previous
       FROM public.toolbox_issues_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSE
     v_previous:=CASE WHEN v_existing_at IS NULL THEN NULL ELSE
       jsonb_build_object('role',v_existing_role,'enabled',
         (SELECT enabled FROM public.module_role_assignments
           WHERE user_id=p_target_user_id AND module_id=p_resource_id)) END;
   END IF;$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected central application previous-role audit lookup';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 -- Use the current Toolbox contract (admin/supervisor/employee/viewer) and
 -- write only its authoritative workspace-scoped membership row.
 v_old:=$old$   ELSIF p_resource_id IN ('time-tracker','fueltrack-plus','tradelink','fund-released-tracker',
     'tool-traceability') THEN
     v_result:=public.wm_admin_set_application_role(p_target_user_id,p_resource_id,p_role,p_enabled);
   ELSE$old$;
 v_new:=$new$   ELSIF p_resource_id='toolbox-issues' THEN
     IF p_role NOT IN ('admin','supervisor','employee','viewer') THEN
       RAISE EXCEPTION 'Unsupported Toolbox Issues role' USING ERRCODE='22023';
     END IF;
     IF p_enabled THEN
       INSERT INTO public.toolbox_issues_memberships(
         workspace_id,user_id,role,enabled,assigned_by,updated_at)
       VALUES(p_workspace_id,p_target_user_id,p_role,true,v_actor,clock_timestamp())
       ON CONFLICT(workspace_id,user_id) DO UPDATE SET
         role=EXCLUDED.role,enabled=true,assigned_by=v_actor,updated_at=clock_timestamp();
     ELSE
       UPDATE public.toolbox_issues_memberships
       SET enabled=false,assigned_by=v_actor,updated_at=clock_timestamp()
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id AND enabled IS TRUE;
       IF NOT FOUND THEN
         RAISE EXCEPTION 'No active Toolbox Issues membership available to revoke'
           USING ERRCODE='PT409';
       END IF;
     END IF;
     INSERT INTO public.toolbox_issues_activity(
       workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
     VALUES(p_workspace_id,'membership',p_target_user_id::text,v_actor,
       CASE WHEN p_enabled THEN 'role_changed' ELSE 'role_revoked' END,
       jsonb_build_object('role',p_role,'enabled',p_enabled,'authority','APSYNTRA'));
   ELSIF p_resource_id IN ('time-tracker','fueltrack-plus','tradelink','fund-released-tracker',
     'tool-traceability') THEN
     v_result:=public.wm_admin_set_application_role(p_target_user_id,p_resource_id,p_role,p_enabled);
   ELSE$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected central application role dispatch branch';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 -- Remove the previous Toolbox-specific rejection/revocation shim from the
 -- generic global module_role_assignments branch. Toolbox is handled above.
 v_old:=$old$   ELSE
     IF p_resource_id='toolbox-issues' AND NOT p_enabled THEN
       -- Preserve the actual Toolbox membership backend as a mandatory gate;
       -- a disabled central row alone would not revoke source access.
       UPDATE public.toolbox_issues_memberships m
       SET enabled=false,assigned_by=v_actor,updated_at=clock_timestamp()
       WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id AND m.enabled;
       IF NOT FOUND THEN
         RAISE EXCEPTION 'No active Toolbox source membership available to revoke'
           USING ERRCODE='42501';
       END IF;
       INSERT INTO public.toolbox_issues_activity(
         workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
       VALUES(p_workspace_id,'membership',p_target_user_id::text,
         v_actor,'role_revoked',
         jsonb_build_object('role',p_role,'enabled',false,'authority','APSYNTRA'));
     END IF;
     IF p_resource_id='toolbox-issues' AND p_enabled THEN
       -- Source Toolbox membership is a separate operational prerequisite.
       RAISE EXCEPTION 'Toolbox source membership must be reconciled before enabling this role'
         USING ERRCODE='42501';
     END IF;
     INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled,assigned_by,updated_at)
       VALUES(p_target_user_id,p_resource_id,p_role,p_enabled,v_actor,clock_timestamp())
       ON CONFLICT(user_id,module_id) DO UPDATE SET
          role=EXCLUDED.role,enabled=EXCLUDED.enabled,assigned_by=EXCLUDED.assigned_by,
          updated_at=clock_timestamp();
   END IF;$old$;
 v_new:=$new$   ELSE
     INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled,assigned_by,updated_at)
       VALUES(p_target_user_id,p_resource_id,p_role,p_enabled,v_actor,clock_timestamp())
       ON CONFLICT(user_id,module_id) DO UPDATE SET
          role=EXCLUDED.role,enabled=EXCLUDED.enabled,assigned_by=EXCLUDED.assigned_by,
          updated_at=clock_timestamp();
   END IF;$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected legacy Toolbox role rejection branch';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 -- Return the persisted Toolbox source row and its revision to the caller.
 v_old:=$old$   IF p_resource_id='material-request-hub' THEN
     SELECT jsonb_build_object('role',role,'enabled',enabled AND status='active',
       'status',status,'updatedAt',updated_at),updated_at
       INTO v_current,v_existing_at
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSE
     SELECT jsonb_build_object('role',role,'enabled',enabled,'updatedAt',updated_at),
       updated_at INTO v_current,v_existing_at
       FROM public.module_role_assignments
       WHERE user_id=p_target_user_id AND module_id=p_resource_id;
   END IF;$old$;
 v_new:=$new$   IF p_resource_id='material-request-hub' THEN
     SELECT jsonb_build_object('role',role,'enabled',enabled AND status='active',
       'status',status,'updatedAt',updated_at),updated_at
       INTO v_current,v_existing_at
       FROM public.material_request_hub_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSIF p_resource_id='toolbox-issues' THEN
     SELECT jsonb_build_object('role',role,'enabled',enabled,'updatedAt',updated_at),
       updated_at INTO v_current,v_existing_at
       FROM public.toolbox_issues_memberships
       WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
   ELSE
     SELECT jsonb_build_object('role',role,'enabled',enabled,'updatedAt',updated_at),
       updated_at INTO v_current,v_existing_at
       FROM public.module_role_assignments
       WHERE user_id=p_target_user_id AND module_id=p_resource_id;
   END IF;$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected central application current-role lookup';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 IF position('public.toolbox_issues_memberships' IN v_definition)=0
   OR position('No active Toolbox Issues membership available to revoke' IN v_definition)=0
   OR position('Ambiguous multi-workspace application role target' IN v_definition)=0 THEN
  RAISE EXCEPTION 'Toolbox Issues source-role dispatch verification failed';
 END IF;
 EXECUTE v_definition;
END;
$toolbox_role_dispatch$;

DO $toolbox_role_snapshot$
DECLARE
 v_definition text;
 v_old text;
 v_new text;
 v_signature regprocedure :=
  'public.apsyntra_role_user_management_snapshot(uuid)'::regprocedure;
BEGIN
 v_definition:=pg_get_functiondef(v_signature);

 -- Source Toolbox memberships replace any stale global shadow row in the
 -- central UI snapshot. Memberships remain scoped to the requested workspace.
 v_old:=$old$      WHERE a.module_id<>'material-request-hub'
      UNION ALL
      SELECT jsonb_build_object('userId',mr.user_id,'moduleId','material-request-hub',
        'role',mr.role,'enabled',(mr.enabled AND mr.status='active'),
        'status',mr.status,'updatedAt',mr.updated_at) AS x
      FROM public.material_request_hub_memberships mr
      JOIN public.workspace_members m ON m.user_id=mr.user_id
        AND m.workspace_id=mr.workspace_id AND m.active
      WHERE mr.workspace_id=p_workspace_id$old$;
 v_new:=$new$      WHERE a.module_id NOT IN ('material-request-hub','toolbox-issues')
      UNION ALL
      SELECT jsonb_build_object('userId',ti.user_id,'moduleId','toolbox-issues',
        'role',ti.role,'enabled',ti.enabled,'updatedAt',ti.updated_at) AS x
      FROM public.toolbox_issues_memberships ti
      JOIN public.workspace_members m ON m.user_id=ti.user_id
        AND m.workspace_id=ti.workspace_id AND m.active
      WHERE ti.workspace_id=p_workspace_id
      UNION ALL
      SELECT jsonb_build_object('userId',mr.user_id,'moduleId','material-request-hub',
        'role',mr.role,'enabled',(mr.enabled AND mr.status='active'),
        'status',mr.status,'updatedAt',mr.updated_at) AS x
      FROM public.material_request_hub_memberships mr
      JOIN public.workspace_members m ON m.user_id=mr.user_id
        AND m.workspace_id=mr.workspace_id AND m.active
      WHERE mr.workspace_id=p_workspace_id$new$;
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'Unexpected CRM role snapshot module assignment contract';
 END IF;
 v_definition:=replace(v_definition,v_old,v_new);
 IF position('public.toolbox_issues_memberships' IN v_definition)=0
   OR position('toolbox-issues' IN v_definition)=0 THEN
  RAISE EXCEPTION 'Toolbox Issues source membership snapshot verification failed';
 END IF;
 EXECUTE v_definition;
END;
$toolbox_role_snapshot$;

COMMIT;
