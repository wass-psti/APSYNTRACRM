-- CP-DB-CPU-12 post-migration verification.
-- Read-only: returns one summary row and any policy mismatches.
WITH expected(
  schemaname, tablename, policyname, expected_roles, expected_cmd,
  predicate_kind, requires_using, requires_check
) AS (
  VALUES
    ('public','profiles','profiles_self_or_admin_select','{authenticated}','SELECT','auth_uid',true,false),
    ('public','module_role_assignments','assignments_self_or_admin_select','{authenticated}','SELECT','auth_uid',true,false),
    ('public','order_intake_activity','order_intake_activity_select','{authenticated}','SELECT','auth_uid',true,false),
    ('public','order_intake_orders','order_intake_orders_select','{authenticated}','SELECT','auth_uid',true,false),
    ('public','frt_memberships','frt_membership_self_or_gm_select','{authenticated}','SELECT','auth_uid',true,false),
    ('public','tool_traceability_activity','cp1612ab_source_read_ws','{watchdog_board_runtime}','SELECT','workspace_guc',true,false),
    ('public','tool_traceability_request_tools','cp1612ab_source_read_ws','{watchdog_board_runtime}','SELECT','workspace_guc',true,false),
    ('public','tool_traceability_requests','cp1612ab_source_read_ws','{watchdog_board_runtime}','SELECT','workspace_guc',true,false),
    ('public','tool_traceability_tools','cp1612ab_source_read_ws','{watchdog_board_runtime}','SELECT','workspace_guc',true,false),
    ('watchdog_board','attachments','cp161_files_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','audit_events','cp161_audit_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','inventory_loans','cp161_loans_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','inventory_tools','cp161_tools_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','items','cp161_items_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','objects','cp1612d_objects_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','pilot_cutovers','cp1612b_cutover_ws','{public}','SELECT','workspace_guc',true,false),
    ('watchdog_board','toolbox_legacy_relations','cp1612e_relations_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','toolbox_subitems','cp1612f_subitems_ws','{public}','ALL','workspace_guc',true,true),
    ('watchdog_board','toolbox_updates','cp1612f_updates_ws','{public}','ALL','workspace_guc',true,true),
    ('huly_rewrite','transaction_events','huly_sb06_events_insert','{authenticated}','INSERT','auth_uid',false,true)
), actual AS (
  SELECT e.*, p.permissive, p.roles, p.cmd, p.qual, p.with_check,
    CASE WHEN p.policyname IS NULL THEN false
      WHEN p.permissive <> 'PERMISSIVE' OR p.roles::text <> e.expected_roles OR p.cmd <> e.expected_cmd THEN false
      WHEN e.requires_using AND p.qual IS NULL THEN false
      WHEN NOT e.requires_using AND p.qual IS NOT NULL THEN false
      WHEN e.requires_check AND p.with_check IS NULL THEN false
      WHEN NOT e.requires_check AND p.with_check IS NOT NULL THEN false
      WHEN e.requires_using AND e.predicate_kind='auth_uid'
        AND position('( SELECT auth.uid() AS uid)' IN coalesce(p.qual,''))=0 THEN false
      WHEN e.requires_using AND e.predicate_kind='workspace_guc'
        AND position('( SELECT current_setting(''watchdog.workspace_id''::text, true) AS current_setting)' IN coalesce(p.qual,''))=0 THEN false
      WHEN e.requires_check AND e.predicate_kind='auth_uid'
        AND position('( SELECT auth.uid() AS uid)' IN coalesce(p.with_check,''))=0 THEN false
      WHEN e.requires_check AND e.predicate_kind='workspace_guc'
        AND position('( SELECT current_setting(''watchdog.workspace_id''::text, true) AS current_setting)' IN coalesce(p.with_check,''))=0 THEN false
      ELSE true END AS passes
  FROM expected e
  LEFT JOIN pg_policies p
    ON p.schemaname=e.schemaname AND p.tablename=e.tablename AND p.policyname=e.policyname
)
SELECT count(*) AS expected_policy_count,
       count(*) FILTER (WHERE passes) AS passing_policy_count,
       count(*) FILTER (WHERE NOT passes) AS mismatch_count,
       CASE WHEN count(*)=20 AND count(*) FILTER (WHERE passes)=20 THEN 'PASS' ELSE 'FAIL' END AS status
FROM actual;

WITH expected(schemaname,tablename,policyname) AS (
  VALUES
    ('public','profiles','profiles_self_or_admin_select'),
    ('public','module_role_assignments','assignments_self_or_admin_select'),
    ('public','order_intake_activity','order_intake_activity_select'),
    ('public','order_intake_orders','order_intake_orders_select'),
    ('public','frt_memberships','frt_membership_self_or_gm_select'),
    ('public','tool_traceability_activity','cp1612ab_source_read_ws'),
    ('public','tool_traceability_request_tools','cp1612ab_source_read_ws'),
    ('public','tool_traceability_requests','cp1612ab_source_read_ws'),
    ('public','tool_traceability_tools','cp1612ab_source_read_ws'),
    ('watchdog_board','attachments','cp161_files_ws'),
    ('watchdog_board','audit_events','cp161_audit_ws'),
    ('watchdog_board','inventory_loans','cp161_loans_ws'),
    ('watchdog_board','inventory_tools','cp161_tools_ws'),
    ('watchdog_board','items','cp161_items_ws'),
    ('watchdog_board','objects','cp1612d_objects_ws'),
    ('watchdog_board','pilot_cutovers','cp1612b_cutover_ws'),
    ('watchdog_board','toolbox_legacy_relations','cp1612e_relations_ws'),
    ('watchdog_board','toolbox_subitems','cp1612f_subitems_ws'),
    ('watchdog_board','toolbox_updates','cp1612f_updates_ws'),
    ('huly_rewrite','transaction_events','huly_sb06_events_insert')
)
SELECT e.schemaname,e.tablename,e.policyname,p.roles,p.cmd,p.qual,p.with_check
FROM expected e
LEFT JOIN pg_policies p USING (schemaname,tablename,policyname)
WHERE p.policyname IS NULL OR p.roles::text IS NULL
ORDER BY e.schemaname,e.tablename;
