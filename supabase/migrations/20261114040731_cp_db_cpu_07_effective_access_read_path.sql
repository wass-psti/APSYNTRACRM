-- CP-DB-CPU-07: eliminate repeated profile/workspace/role lookups in the
-- signed self-access projection without changing its authorization contract.
-- Keep current_workspace_id() and the bootstrap verifier authoritative.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.apsyntra_crm_my_effective_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  v_is_admin := v_host_role = 'admin_general_manager';
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
      ELSE assignment.role
      END AS raw_role
    FROM requested_modules requested
    LEFT JOIN public.module_role_assignments assignment
      ON assignment.user_id = v_actor
     AND assignment.module_id = requested.id
     AND assignment.enabled
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
$function$;

-- The function signature and grants are unchanged; replace body only.
NOTIFY pgrst, 'reload schema';
