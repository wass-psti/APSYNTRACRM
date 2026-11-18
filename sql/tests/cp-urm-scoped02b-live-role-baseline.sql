-- Verbatim function-source baseline from pre-02B existing Supabase project, captured 2026-11-18.
-- Disposable CI only; no production connection or credentials.
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.apsyntra_crm_my_effective_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_host_role text;
  v_effective_role text;
  v_explicit_role text;
  v_bootstrap boolean;
  v_is_admin boolean;
  v_effective_rank integer;
  v_modules jsonb;
  v_boards jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Signed identity required' USING ERRCODE = '42501';
  END IF;

  -- Workspace selection remains delegated to the existing signed-session
  -- resolver. Do not add a fallback or alter its authority semantics here.
  v_workspace := public.current_workspace_id(v_actor);

  -- Resolve profile role, explicit workspace ceiling, and inherited effective
  -- role in one membership/role lookup. This is equivalent to the
  -- former host-role query plus apsyntra_crm_effective_role() and
  -- apsyntra_crm_explicit_role() calls. The underlying role tables are unique
  -- on (workspace_id,user_id), so this preserves the former single-row result.
  SELECT
    p.platform_role,
    assignment.role,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM private.ws02_personal_workspaces personal
        JOIN private.ws01_member_roles owner_role
          ON owner_role.workspace_id = personal.workspace_id
         AND owner_role.user_id = personal.user_id
        WHERE personal.user_id = v_actor
          AND personal.workspace_id = v_workspace
          AND lower(btrim(owner_role.relation)) = 'owner'
      ) THEN 'admin'
      ELSE COALESCE(
        assignment.role,
        CASE p.platform_role
          WHEN 'admin_general_manager' THEN 'admin'
          WHEN 'hr' THEN 'supervisor'
          WHEN 'supervisor' THEN 'supervisor'
          ELSE 'employee'
        END
      )
    END
  INTO v_host_role, v_explicit_role, v_effective_role
  FROM public.profiles p
  JOIN public.workspace_members membership
    ON membership.user_id = p.id
   AND membership.workspace_id = v_workspace
   AND membership.active IS TRUE
  LEFT JOIN public.apsyntra_crm_platform_roles assignment
    ON assignment.user_id = p.id
   AND assignment.workspace_id = v_workspace
  WHERE p.id = v_actor
    AND p.status = 'active'
  LIMIT 1;

  IF v_workspace IS NULL OR v_host_role IS NULL THEN
    RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE = '42501';
  END IF;

  -- Match apsyntra_role_is_admin(): the workspace-effective CRM Admin
  -- grants admin parity; an inherited profile label alone is not authority.
  v_is_admin := v_effective_role = 'admin';
  v_bootstrap := public.apsyntra_role_is_bootstrap();

  IF v_bootstrap IS NULL
     OR v_effective_role NOT IN ('admin', 'supervisor', 'employee', 'viewer') THEN
    RAISE EXCEPTION 'Effective authorization unavailable' USING ERRCODE = '42501';
  END IF;

  -- Calculate the platform ceiling once and each module's rank once.
  v_effective_rank := public.apsyntra_crm_role_rank(v_effective_role);

  WITH requested_modules(id) AS MATERIALIZED (
    SELECT pg_catalog.unnest(ARRAY[
      'aps-aims', 'charter-navigator', 'employee-eval', 'fueltrack-plus',
      'fueltrans', 'fund-released-tracker', 'material-request-hub',
      'order-intake', 'time-tracker', 'tool-traceability', 'toolbox-issues', 'tradelink'
    ]::text[])
  ), raw_roles AS MATERIALIZED (
    SELECT
      requested.id,
      CASE WHEN v_is_admin THEN
        CASE requested.id
          WHEN 'time-tracker' THEN 'System Admin'
          WHEN 'fueltrack-plus' THEN 'Admin'
          WHEN 'tradelink' THEN 'General Manager'
          WHEN 'fund-released-tracker' THEN 'GENERAL_MANAGER'
          WHEN 'tool-traceability' THEN 'ADMIN'
          WHEN 'toolbox-issues' THEN 'admin'
          WHEN 'material-request-hub' THEN 'ADMIN'
          WHEN 'aps-aims' THEN 'Administrator'
          WHEN 'employee-eval' THEN 'admin'
          ELSE 'Admin'
        END
      ELSE CASE requested.id
        WHEN 'material-request-hub' THEN mrh.role
        WHEN 'toolbox-issues' THEN toolbox.role
        WHEN 'tool-traceability' THEN traceability.role
        WHEN 'fueltrans' THEN CASE
          WHEN fueltrans.role = 'admin' THEN 'Admin'
          WHEN fueltrans.role = 'viewer' THEN 'Viewer'
          WHEN fueltrans.role IS NOT NULL THEN 'User'
          ELSE NULL END
        ELSE assignment.role
      END
      END AS raw_role
    FROM requested_modules requested
    LEFT JOIN public.module_role_assignments assignment
      ON assignment.user_id = v_actor
     AND assignment.module_id = requested.id
     AND assignment.enabled
     AND requested.id NOT IN ('material-request-hub','toolbox-issues','fueltrans','tool-traceability')
    LEFT JOIN public.material_request_hub_memberships mrh
      ON requested.id = 'material-request-hub'
     AND mrh.workspace_id = v_workspace
     AND mrh.user_id = v_actor
     AND mrh.enabled IS TRUE
     AND mrh.status = 'active'
    LEFT JOIN public.toolbox_issues_memberships toolbox
      ON requested.id = 'toolbox-issues'
     AND toolbox.workspace_id = v_workspace
     AND toolbox.user_id = v_actor
     AND toolbox.enabled IS TRUE
    LEFT JOIN public.tool_traceability_memberships traceability
      ON requested.id = 'tool-traceability'
     AND traceability.workspace_id = v_workspace
     AND traceability.user_id = v_actor
     AND traceability.enabled IS TRUE
     AND traceability.status = 'active'
    LEFT JOIN public.fueltrans_memberships fueltrans
      ON requested.id = 'fueltrans'
     AND fueltrans.workspace_id = v_workspace
     AND fueltrans.user_id = v_actor
     AND fueltrans.enabled IS TRUE
     AND fueltrans.status = 'active'
     AND fueltrans.client_code IS NULL
  ), resolved_roles AS MATERIALIZED (
    SELECT
      raw.id,
      CASE
        WHEN v_explicit_role IS NOT NULL
         AND (
           module_rank.role_rank IS NULL
           OR module_rank.role_rank > v_effective_rank
         )
        THEN NULL
        ELSE raw.raw_role
      END AS role
    FROM raw_roles raw
    CROSS JOIN LATERAL (
      SELECT public.apsyntra_crm_module_role_rank(raw.id, raw.raw_role) AS role_rank
    ) module_rank
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'moduleId', id,
        'role', role,
        'allowed', role IS NOT NULL
      ) ORDER BY id
    ),
    '[]'::jsonb
  )
  INTO v_modules
  FROM resolved_roles;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', board.id,
        'name', board.name,
        'memberRole', board_member.role,
        'view', v_is_admin OR board_member.role IN ('owner', 'editor', 'viewer'),
        'edit', v_explicit_role IS DISTINCT FROM 'viewer'
                AND (v_is_admin OR board_member.role IN ('owner', 'editor')),
        'manage', v_explicit_role IS DISTINCT FROM 'viewer'
                  AND v_explicit_role IS DISTINCT FROM 'employee'
                  AND v_explicit_role IS DISTINCT FROM 'supervisor'
                  AND (v_is_admin OR board_member.role = 'owner')
      ) ORDER BY board.name, board.id
    ),
    '[]'::jsonb
  )
  INTO v_boards
  FROM public.work_boards board
  LEFT JOIN public.work_board_members board_member
    ON board_member.board_id = board.id
   AND board_member.user_id = v_actor
  WHERE board.workspace_id = v_workspace
    AND board.status = 'active'
    AND (v_is_admin OR board_member.role IN ('owner', 'editor', 'viewer'));

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'workspaceId', v_workspace,
    'platformRole', v_host_role,
    'effectivePlatformRole', v_effective_role,
    'explicitPlatformRole', v_explicit_role,
    'bootstrap', v_bootstrap,
    'modules', v_modules,
    'boards', v_boards
  );
END;
$function$
;
