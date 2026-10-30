-- CP-RC02: Bootstrap-only effective user/module and board role management.
-- Extends the EXISTING role/board tables; does not introduce a second role store.
-- No application user data, memberships or active assignments are mutated by installation.
BEGIN;

-- Remove the original five-module restriction ONLY to permit exact existing module keys
-- used by the twelve CRM boards; preserve the old five role vocabularies.
ALTER TABLE public.module_role_assignments DROP CONSTRAINT module_role_assignments_module_id_check;
ALTER TABLE public.module_role_assignments ADD CONSTRAINT module_role_assignments_module_id_check
CHECK (module_id IN ('time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake','tool-traceability',
 'material-request-hub','aps-aims','employee-eval','charter-navigator'));

ALTER TABLE public.module_role_assignments DROP CONSTRAINT valid_module_role;
ALTER TABLE public.module_role_assignments ADD CONSTRAINT valid_module_role CHECK (
 (module_id='time-tracker' AND role IN ('Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator'))
 OR (module_id='fueltrack-plus' AND role IN ('User','Pump Attendant','Admin'))
 OR (module_id='tradelink' AND role IN ('User','Sales Supervisor','General Manager'))
 OR (module_id='toolbox-issues' AND role IN ('admin','supervisor','employee','viewer'))
 OR (module_id='fund-released-tracker' AND role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
 OR (module_id='tool-traceability' AND role IN ('ADMIN','LOGISTICS','USER','VIEWER'))
 OR (module_id='material-request-hub' AND role IN ('ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER'))
 OR (module_id='aps-aims' AND role IN ('Administrator','AssetManager','Custodian','Viewer'))
 OR (module_id='employee-eval' AND role IN ('admin','supervisor','employee'))
 OR (module_id='fueltrans' AND role IN ('Admin','User','Viewer'))
 OR (module_id='order-intake' AND role IN ('Admin','User','Viewer'))
 OR (module_id='charter-navigator' AND role IN ('Admin','Supervisor','Employee','Viewer'))
);

-- Preserve original append-only audit trigger and history; add two true state transitions.
ALTER TABLE public.apsyntra_role_change_requests DROP CONSTRAINT apsyntra_role_change_requests_status_check;
ALTER TABLE public.apsyntra_role_change_requests ADD CONSTRAINT apsyntra_role_change_requests_status_check
CHECK(status IN ('proposed','applied'));
ALTER TABLE public.apsyntra_role_change_audit DROP CONSTRAINT apsyntra_role_change_audit_event_check;
ALTER TABLE public.apsyntra_role_change_audit ADD CONSTRAINT apsyntra_role_change_audit_event_check
CHECK(event IN ('proposed','applied'));

-- A single SECURITY DEFINER boundary reuses the existing bootstrap scope guard,
-- central application-role setter, module assignment store and board memberships.
CREATE OR REPLACE FUNCTION public.apsyntra_role_manage_user_access(
 p_workspace_id uuid,
 p_target_user_id uuid,
 p_scope text,
 p_resource_id text,
 p_role text,
 p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $rpc$
DECLARE
 v_actor uuid:=auth.uid();
 v_previous jsonb;
 v_current jsonb;
 v_changed boolean;
 v_board_id uuid;
 v_existing_role text;
 v_existing_at timestamptz;
 v_change_id uuid;
 v_operation text;
 v_result jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR p_scope NOT IN ('module','board')
    OR p_resource_id IS NULL OR p_enabled IS NULL
    OR p_role IS NULL
    OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=p_target_user_id)
    OR public.is_platform_admin(p_target_user_id)
 THEN RAISE EXCEPTION 'Protected, self, or invalid role target' USING ERRCODE='42501'; END IF;

 IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
    WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_target_user_id
      AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Target outside active workspace' USING ERRCODE='42501'; END IF;

 -- Serializes per-user changes and guards optimistic expected revision.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_target_user_id::text||':'||p_scope||':'||p_resource_id,0));

 IF p_scope='module' THEN
   -- Legacy module_role_assignments is keyed by (user_id,module_id) without a
   -- workspace ID. Reject multi-workspace users to avoid an accidental cross-
   -- workspace role grant until the original backend supports scoped roles.
   IF (SELECT count(*) FROM public.workspace_members wm
       WHERE wm.user_id=p_target_user_id AND wm.active)<>1 THEN
     RAISE EXCEPTION 'Ambiguous multi-workspace application role target'
       USING ERRCODE='42501';
   END IF;
   IF p_resource_id NOT IN (
     'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
     'fund-released-tracker','fueltrans','order-intake','tool-traceability',
     'material-request-hub','aps-aims','employee-eval','charter-navigator')
   THEN RAISE EXCEPTION 'Unregistered application' USING ERRCODE='22023'; END IF;
   SELECT role,updated_at INTO v_existing_role,v_existing_at
      FROM public.module_role_assignments WHERE user_id=p_target_user_id AND module_id=p_resource_id FOR UPDATE;
   IF v_existing_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Stale module role assignment' USING ERRCODE='PT409'; END IF;
   IF NOT p_enabled AND v_existing_at IS NULL THEN
     RAISE EXCEPTION 'No application role exists to revoke' USING ERRCODE='PT409'; END IF;
   v_previous:=CASE WHEN v_existing_at IS NULL THEN NULL ELSE
     jsonb_build_object('role',v_existing_role,'enabled',
       (SELECT enabled FROM public.module_role_assignments
         WHERE user_id=p_target_user_id AND module_id=p_resource_id)) END;

   -- Domain-specific backends that are already delegated by this RPC remain delegated.
   -- Other modules still use the same authoritative module_role_assignments table,
   -- but application-specific workflow enforcement must be independently certified.
   IF p_resource_id IN ('time-tracker','fueltrack-plus','tradelink','fund-released-tracker',
     'tool-traceability','material-request-hub') THEN
     v_result:=public.wm_admin_set_application_role(p_target_user_id,p_resource_id,p_role,p_enabled);
   ELSE
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
   END IF;
   SELECT jsonb_build_object('role',role,'enabled',enabled,'updatedAt',updated_at),
     updated_at INTO v_current,v_existing_at
     FROM public.module_role_assignments WHERE user_id=p_target_user_id AND module_id=p_resource_id;
 ELSE
   IF p_resource_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     THEN RAISE EXCEPTION 'Invalid board identifier' USING ERRCODE='22023'; END IF;
   v_board_id:=p_resource_id::uuid;
   IF NOT EXISTS (SELECT 1 FROM public.work_boards b WHERE b.id=v_board_id
     AND b.workspace_id=p_workspace_id AND b.status='active'
     AND b.trashed_at IS NULL AND b.archived_at IS NULL)
   THEN RAISE EXCEPTION 'Board outside active workspace' USING ERRCODE='42501'; END IF;
   SELECT role,updated_at INTO v_existing_role,v_existing_at
     FROM public.work_board_members WHERE board_id=v_board_id AND user_id=p_target_user_id FOR UPDATE;
   IF v_existing_role='owner' OR (p_enabled AND p_role NOT IN ('viewer','editor'))
      OR (NOT p_enabled AND p_role NOT IN ('viewer','editor'))
   THEN RAISE EXCEPTION 'Protected board owner or unsupported board role' USING ERRCODE='42501'; END IF;
   IF v_existing_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Stale board membership' USING ERRCODE='PT409'; END IF;
   IF NOT p_enabled AND v_existing_at IS NULL THEN
     RAISE EXCEPTION 'No board membership exists to revoke' USING ERRCODE='PT409'; END IF;
   v_previous:=CASE WHEN v_existing_at IS NULL THEN NULL ELSE
      jsonb_build_object('role',v_existing_role,'enabled',true) END;
   IF p_enabled THEN
      INSERT INTO public.work_board_members(board_id,user_id,role,added_by,updated_at)
       VALUES(v_board_id,p_target_user_id,p_role,v_actor,clock_timestamp())
       ON CONFLICT(board_id,user_id) DO UPDATE SET
         role=EXCLUDED.role,updated_at=clock_timestamp();
   ELSE
      DELETE FROM public.work_board_members WHERE board_id=v_board_id AND user_id=p_target_user_id;
   END IF;
   SELECT jsonb_build_object('role',role,'enabled',true,'updatedAt',updated_at),
      updated_at INTO v_current,v_existing_at FROM public.work_board_members
      WHERE board_id=v_board_id AND user_id=p_target_user_id;
 END IF;

 v_operation:=CASE WHEN p_enabled THEN 'assignment.assign' ELSE 'assignment.revoke' END;
 INSERT INTO public.apsyntra_role_change_requests(workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,v_operation,jsonb_build_object(
   'targetUserId',p_target_user_id,'scope',p_scope,'resourceId',p_resource_id,
   'previous',v_previous,'result',v_current,'requestedRole',p_role),'applied')
 RETURNING id INTO v_change_id;
 -- Immutable trigger emits 'proposed' (receipt); this second event confirms application.
 INSERT INTO public.apsyntra_role_change_audit(change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change_id,p_workspace_id,v_actor,'applied',
   jsonb_build_object('targetUserId',p_target_user_id,'scope',p_scope,
      'resourceId',p_resource_id,'before',v_previous,'after',v_current,
      'applied',true));

 RETURN jsonb_build_object('changeId',v_change_id,'workspaceId',p_workspace_id,
   'scope',p_scope,'resourceId',p_resource_id,'targetUserId',p_target_user_id,
   'before',v_previous,'after',v_current,'effective',true,
   'currentRevision',v_existing_at);
END
$rpc$;
REVOKE ALL ON FUNCTION public.apsyntra_role_manage_user_access(
 uuid,uuid,text,text,text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_manage_user_access(
 uuid,uuid,text,text,text,boolean,timestamptz) TO authenticated;

-- Snapshot of effective existing assignments, not a parallel RBAC cache.
CREATE OR REPLACE FUNCTION public.apsyntra_role_user_management_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $rpc$
DECLARE v_data jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 SELECT jsonb_build_object(
  'workspaceId',p_workspace_id,'bootstrapVerified',true,
  'users',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.display_name,'email',p.email,'platformRole',p.platform_role,
   'protected',EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities z WHERE z.user_id=p.id))
    ORDER BY p.display_name)
   FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
   WHERE m.workspace_id=p_workspace_id AND m.active AND p.status='active'),'[]'::jsonb),
  'modules',to_jsonb(ARRAY['fueltrans','tool-traceability','toolbox-issues',
   'fund-released-tracker','fueltrack-plus','tradelink','time-tracker',
   'order-intake','employee-eval','charter-navigator','aps-aims','material-request-hub']),
  'moduleAssignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'userId',a.user_id,'moduleId',a.module_id,'role',a.role,'enabled',a.enabled,
   'updatedAt',a.updated_at) ORDER BY a.module_id,a.user_id)
    FROM public.module_role_assignments a JOIN public.workspace_members m
      ON m.user_id=a.user_id AND m.workspace_id=p_workspace_id AND m.active),'[]'::jsonb),
  'boards',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)
    ORDER BY b.name) FROM public.work_boards b
    WHERE b.workspace_id=p_workspace_id AND b.status='active'
      AND b.trashed_at IS NULL AND b.archived_at IS NULL),'[]'::jsonb),
  'boardAssignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'boardId',m.board_id,'userId',m.user_id,'role',m.role,'updatedAt',m.updated_at)
     ORDER BY m.board_id,m.user_id)
    FROM public.work_board_members m JOIN public.work_boards b ON b.id=m.board_id
    JOIN public.workspace_members wm ON wm.user_id=m.user_id
      AND wm.workspace_id=p_workspace_id AND wm.active
    WHERE b.workspace_id=p_workspace_id AND b.status='active'),'[]'::jsonb)
 ) INTO v_data;
 RETURN v_data;
END $rpc$;
REVOKE ALL ON FUNCTION public.apsyntra_role_user_management_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_user_management_snapshot(uuid)
 TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
