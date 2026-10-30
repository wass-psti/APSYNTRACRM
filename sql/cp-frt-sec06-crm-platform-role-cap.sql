-- CP-FRT-SEC06 / APSYNTRA CRM platform roles.
-- Single existing Supabase Auth + central bootstrap guard; no alternate authentication.
-- Staged only. Do not apply to live PostgreSQL before nonproduction authorization tests.
BEGIN;

-- The CRM tier is an explicit, workspace-local CAP, not a replacement for
-- WatchdogWorkspace profiles.platform_role, module assignments or board members.
-- A missing override preserves existing legacy host and board-owner behavior.
CREATE TABLE IF NOT EXISTS public.apsyntra_crm_platform_roles (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('admin','supervisor','employee','viewer')),
 assigned_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (workspace_id,user_id)
);
ALTER TABLE public.apsyntra_crm_platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apsyntra_crm_platform_roles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.apsyntra_crm_platform_roles FROM PUBLIC,anon,authenticated;

-- Internal helpers: no caller-provided JWT role, metadata claim or user-controlled
-- email is accepted as an authorization source.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_role_rank(p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=''
AS $$
 SELECT CASE p_role WHEN 'viewer' THEN 0 WHEN 'employee' THEN 1
  WHEN 'supervisor' THEN 2 WHEN 'admin' THEN 3 ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_role_rank(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_crm_module_role_rank(p_module text,p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=''
AS $$
 SELECT CASE
 WHEN p_module='time-tracker' AND p_role IN ('Employee','OJT') THEN 1
 WHEN p_module='time-tracker' AND p_role IN ('Supervisor','HR','Finance') THEN 2
 WHEN p_module='time-tracker' AND p_role IN ('System Admin','IT Administrator') THEN 3
 WHEN p_module='fueltrack-plus' AND p_role='User' THEN 1
 WHEN p_module='fueltrack-plus' AND p_role='Pump Attendant' THEN 2
 WHEN p_module='fueltrack-plus' AND p_role='Admin' THEN 3
 WHEN p_module='tradelink' AND p_role='User' THEN 1
 WHEN p_module='tradelink' AND p_role='Sales Supervisor' THEN 2
 WHEN p_module='tradelink' AND p_role='General Manager' THEN 3
 WHEN p_module='fund-released-tracker' AND p_role='REQUESTOR' THEN 1
 WHEN p_module='fund-released-tracker' AND p_role IN ('FINANCE_APPROVER','FINANCE_MANAGER') THEN 2
 WHEN p_module='fund-released-tracker' AND p_role='GENERAL_MANAGER' THEN 3
 WHEN p_module='tool-traceability' AND p_role='VIEWER' THEN 0
 WHEN p_module='tool-traceability' AND p_role='USER' THEN 1
 WHEN p_module='tool-traceability' AND p_role='LOGISTICS' THEN 2
 WHEN p_module='tool-traceability' AND p_role='ADMIN' THEN 3
 WHEN p_module='toolbox-issues' AND p_role='viewer' THEN 0
 WHEN p_module='toolbox-issues' AND p_role='employee' THEN 1
 WHEN p_module='toolbox-issues' AND p_role='supervisor' THEN 2
 WHEN p_module='toolbox-issues' AND p_role='admin' THEN 3
 WHEN p_module IN ('fueltrans','order-intake','charter-navigator') AND p_role='Viewer' THEN 0
 WHEN p_module IN ('fueltrans','order-intake') AND p_role='User' THEN 1
 WHEN p_module='charter-navigator' AND p_role='Employee' THEN 1
 WHEN p_module='charter-navigator' AND p_role='Supervisor' THEN 2
 WHEN p_module IN ('fueltrans','order-intake','charter-navigator') AND p_role='Admin' THEN 3
 WHEN p_module='material-request-hub' AND p_role='VIEWER' THEN 0
 WHEN p_module='material-request-hub' AND p_role='REQUESTOR' THEN 1
 WHEN p_module='material-request-hub' AND p_role IN ('APPROVER','WAREHOUSE') THEN 2
 WHEN p_module='material-request-hub' AND p_role='ADMIN' THEN 3
 WHEN p_module='aps-aims' AND p_role='Viewer' THEN 0
 WHEN p_module='aps-aims' AND p_role='Custodian' THEN 1
 WHEN p_module='aps-aims' AND p_role='AssetManager' THEN 2
 WHEN p_module='aps-aims' AND p_role='Administrator' THEN 3
 WHEN p_module='employee-eval' AND p_role='employee' THEN 1
 WHEN p_module='employee-eval' AND p_role='supervisor' THEN 2
 WHEN p_module='employee-eval' AND p_role='admin' THEN 3
 ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_module_role_rank(text,text)
 FROM PUBLIC,anon,authenticated;

-- Internal effective tier: no override => inherited platform display role.
-- Explicit overrides restrict what *application/board* grants may exercise.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT coalesce(
  (SELECT a.role FROM public.apsyntra_crm_platform_roles a
   WHERE a.user_id=p_user AND a.workspace_id=p_workspace),
  CASE p.platform_role WHEN 'admin_general_manager' THEN 'admin'
   WHEN 'hr' THEN 'supervisor' WHEN 'supervisor' THEN 'supervisor'
   ELSE 'employee' END)
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id
 WHERE p.id=p_user AND p.status='active' AND wm.workspace_id=p_workspace AND wm.active
 LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_effective_role(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- Internal explicit cap (NULL = no override / preserve grandfathered behavior).
CREATE OR REPLACE FUNCTION public.apsyntra_crm_explicit_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT a.role FROM public.apsyntra_crm_platform_roles a
 WHERE a.user_id=p_user AND a.workspace_id=p_workspace;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_explicit_role(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- No new user list: extend the existing central admin snapshot with the
-- separate CRM platform tier and its optimistic concurrency revision.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_platform_role_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN jsonb_build_object(
  'workspaceId',p_workspace_id,'bootstrapVerified',true,
  'roles',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'userId',p.id,
   'inheritedRole',CASE p.platform_role WHEN 'admin_general_manager' THEN 'admin'
    WHEN 'hr' THEN 'supervisor' WHEN 'supervisor' THEN 'supervisor' ELSE 'employee' END,
   'assignedRole',a.role,
   'effectiveRole',public.apsyntra_crm_effective_role(p.id,p_workspace_id),
   'updatedAt',a.updated_at
  ) ORDER BY p.id)
  FROM public.workspace_members m
  JOIN public.profiles p ON p.id=m.user_id
  LEFT JOIN public.apsyntra_crm_platform_roles a
   ON a.user_id=p.id AND a.workspace_id=m.workspace_id
  WHERE m.workspace_id=p_workspace_id AND m.active AND p.status='active'),
  '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_platform_role_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_crm_platform_role_snapshot(uuid)
 TO authenticated;

-- Central bootstrap-only mutation. NULL role removes only the CRM override
-- and restores inherited behavior; does NOT revoke Auth, profiles or module data.
CREATE OR REPLACE FUNCTION public.apsyntra_crm_platform_role_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,
 p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_actor uuid:=auth.uid();
 v_current_role text;
 v_current_updated timestamptz;
 v_before jsonb;
 v_after jsonb;
 v_change_id uuid;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor
   OR (p_role IS NOT NULL AND p_role NOT IN ('admin','supervisor','employee','viewer'))
   OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
              WHERE b.user_id=p_target_user_id)
   OR public.is_platform_admin(p_target_user_id)
 THEN RAISE EXCEPTION 'Protected or invalid CRM platform role target' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_target_user_id
     AND wm.active AND p.status='active'
 ) THEN RAISE EXCEPTION 'Target outside active workspace' USING ERRCODE='42501'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_workspace_id::text||':'||p_target_user_id::text||':apsyntra-crm-platform',0));
 SELECT a.role,a.updated_at INTO v_current_role,v_current_updated
 FROM public.apsyntra_crm_platform_roles a
 WHERE a.workspace_id=p_workspace_id AND a.user_id=p_target_user_id FOR UPDATE;
 IF v_current_updated IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Stale CRM platform role assignment' USING ERRCODE='PT409'; END IF;
 IF v_current_role IS NOT DISTINCT FROM p_role
 THEN RAISE EXCEPTION 'CRM platform role assignment unchanged' USING ERRCODE='PT409'; END IF;
 v_before:=CASE WHEN v_current_updated IS NULL THEN NULL ELSE
    jsonb_build_object('role',v_current_role,'updatedAt',v_current_updated) END;

 IF p_role IS NULL THEN
   DELETE FROM public.apsyntra_crm_platform_roles
    WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id;
 ELSE
   INSERT INTO public.apsyntra_crm_platform_roles(
     workspace_id,user_id,role,assigned_by,updated_at)
   VALUES(p_workspace_id,p_target_user_id,p_role,v_actor,clock_timestamp())
   ON CONFLICT(workspace_id,user_id) DO UPDATE
    SET role=EXCLUDED.role,assigned_by=EXCLUDED.assigned_by,
        updated_at=clock_timestamp();
 END IF;
 SELECT jsonb_build_object('role',a.role,'updatedAt',a.updated_at),a.updated_at
 INTO v_after,v_current_updated FROM public.apsyntra_crm_platform_roles a
 WHERE a.workspace_id=p_workspace_id AND a.user_id=p_target_user_id;

 -- Reuse the existing append-only role change request and audit transaction.
 INSERT INTO public.apsyntra_role_change_requests(
   workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,
  CASE WHEN p_role IS NULL THEN 'assignment.revoke' ELSE 'assignment.assign' END,
  jsonb_build_object('scope','crm-platform','targetUserId',p_target_user_id,
   'before',v_before,'after',v_after,'requestedRole',p_role),'applied')
 RETURNING id INTO v_change_id;
 INSERT INTO public.apsyntra_role_change_audit(
  change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change_id,p_workspace_id,v_actor,'applied',
  jsonb_build_object('targetUserId',p_target_user_id,'scope','crm-platform',
   'before',v_before,'after',v_after,'applied',true));
 RETURN jsonb_build_object('changeId',v_change_id,'workspaceId',p_workspace_id,
  'targetUserId',p_target_user_id,'scope','crm-platform','effective',true,
  'before',v_before,'after',v_after,'currentRevision',v_current_updated,
  'effectiveRole',public.apsyntra_crm_effective_role(p_target_user_id,p_workspace_id));
END;
$$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)
 TO authenticated;

-- Central role resolvers: explicit CRM ceiling can never be bypassed by a
-- stronger module assignment. No override => original behavior unchanged.
CREATE OR REPLACE FUNCTION public.module_role_for(
 p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $$
 SELECT CASE WHEN public.apsyntra_crm_explicit_role(
    p_user_id,public.current_workspace_id(p_user_id)) IS NOT NULL
   AND p_module_id IN ('time-tracker','fueltrack-plus','tradelink',
     'toolbox-issues','fund-released-tracker','fueltrans','order-intake',
     'tool-traceability','material-request-hub','aps-aims','employee-eval','charter-navigator')
   AND (public.apsyntra_crm_module_role_rank(p_module_id,
     CASE WHEN public.is_platform_admin(p_user_id) THEN
       CASE p_module_id
       WHEN 'time-tracker' THEN 'System Admin'
       WHEN 'fueltrack-plus' THEN 'Admin'
       WHEN 'tradelink' THEN 'General Manager'
       WHEN 'fund-released-tracker' THEN 'GENERAL_MANAGER'
       WHEN 'tool-traceability' THEN 'ADMIN'
       WHEN 'toolbox-issues' THEN 'admin'
       WHEN 'material-request-hub' THEN 'ADMIN'
       WHEN 'aps-aims' THEN 'Administrator'
       WHEN 'employee-eval' THEN 'admin'
       ELSE 'Admin' END
      ELSE (SELECT m.role FROM public.module_role_assignments m
            WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
     END) IS NULL
      OR public.apsyntra_crm_module_role_rank(p_module_id,
        CASE WHEN public.is_platform_admin(p_user_id) THEN
         CASE p_module_id
         WHEN 'time-tracker' THEN 'System Admin' WHEN 'fueltrack-plus' THEN 'Admin'
         WHEN 'tradelink' THEN 'General Manager'
         WHEN 'fund-released-tracker' THEN 'GENERAL_MANAGER'
         WHEN 'tool-traceability' THEN 'ADMIN' WHEN 'toolbox-issues' THEN 'admin'
         WHEN 'material-request-hub' THEN 'ADMIN'
         WHEN 'aps-aims' THEN 'Administrator'
         WHEN 'employee-eval' THEN 'admin'
         ELSE 'Admin' END
        ELSE (SELECT m.role FROM public.module_role_assignments m
              WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
        END)
        > public.apsyntra_crm_role_rank(
         public.apsyntra_crm_effective_role(p_user_id,public.current_workspace_id(p_user_id))))
  THEN NULL ELSE
   CASE WHEN public.is_platform_admin(p_user_id) THEN
    CASE p_module_id WHEN 'time-tracker' THEN 'System Admin'
     WHEN 'fueltrack-plus' THEN 'Admin' WHEN 'tradelink' THEN 'General Manager'
     ELSE 'Admin' END
   ELSE (SELECT m.role FROM public.module_role_assignments m
         WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
   END END;
$$;

-- Fail closed on CRM-capped application roles while retaining existing module
-- grants and any non-CRM module integrations unchanged.
CREATE OR REPLACE FUNCTION public.has_module_access(
 p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $$
 SELECT p_user_id IS NOT NULL
  AND public.current_workspace_id(p_user_id) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.status='active')
  AND (
   CASE WHEN p_module_id IN (
     'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
     'fund-released-tracker','fueltrans','order-intake','tool-traceability',
     'material-request-hub','aps-aims','employee-eval','charter-navigator')
    AND public.apsyntra_crm_explicit_role(
       p_user_id,public.current_workspace_id(p_user_id)) IS NOT NULL
   THEN public.module_role_for(p_module_id,p_user_id) IS NOT NULL
   ELSE public.is_platform_admin(p_user_id) OR EXISTS(
    SELECT 1 FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
   END
  );
$$;

-- Preserve per-board stored memberships; explicit CRM viewer cannot edit or
-- manage regardless of board owner/editor. No override => legacy behavior.
CREATE OR REPLACE FUNCTION public.work_board_access(
 p_board_id uuid,p_required text DEFAULT 'view')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$
DECLARE caller uuid:=auth.uid(); member_role text; ws uuid; board_ws uuid; cap text;
BEGIN
 IF caller IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p
               WHERE p.id=caller AND p.status='active') THEN RETURN false; END IF;
 SELECT workspace_id INTO board_ws FROM public.work_boards WHERE id=p_board_id;
 IF board_ws IS NULL THEN RETURN false; END IF;
 ws:=public.current_workspace_id(caller);
 IF ws IS NULL OR ws<>board_ws THEN RETURN false; END IF;
 IF p_required NOT IN ('view','edit','manage') THEN RETURN false; END IF;
 cap:=public.apsyntra_crm_explicit_role(caller,ws);
 IF cap='viewer' AND p_required IN ('edit','manage') THEN RETURN false; END IF;
 IF cap IN ('employee','supervisor') AND p_required='manage' THEN RETURN false; END IF;
 IF public.is_platform_admin(caller) THEN RETURN true; END IF;
 SELECT role INTO member_role FROM public.work_board_members
  WHERE board_id=p_board_id AND user_id=caller;
 IF p_required='manage' THEN RETURN coalesce(member_role='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(member_role IN ('owner','editor'),false); END IF;
 RETURN coalesce(member_role IN ('owner','editor','viewer'),false);
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
