-- CP01 — read-only workspace identity and application ownership audit.
-- Run against the existing APSYNTRACRM project. This file contains SELECTs only.
-- It does not create fixtures, change workspace records, or modify permissions.

-- 1. Workspace, active membership and board counts.
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  count(DISTINCT m.user_id) FILTER (WHERE m.active IS TRUE)::integer AS active_members,
  count(DISTINCT b.id)::integer AS boards,
  count(DISTINCT p.user_id)::integer AS personal_owner_mappings
FROM public.workspaces w
LEFT JOIN public.workspace_members m ON m.workspace_id = w.id
LEFT JOIN public.work_boards b ON b.workspace_id = w.id
LEFT JOIN private.ws02_personal_workspaces p ON p.workspace_id = w.id
GROUP BY w.id, w.name
ORDER BY w.name, w.id;

-- 2. Main Workspace display names versus authoritative personal mappings.
SELECT
  count(*) FILTER (WHERE w.name = 'Main Workspace')::integer AS main_workspace_named_rows,
  count(*) FILTER (WHERE w.name = 'Main Workspace' AND p.workspace_id IS NOT NULL)::integer AS mapped_personal_main_workspaces,
  count(*) FILTER (WHERE w.name = 'Main Workspace' AND p.workspace_id IS NULL)::integer AS unclassified_main_workspace_named_rows
FROM public.workspaces w
LEFT JOIN private.ws02_personal_workspaces p ON p.workspace_id = w.id;

-- 3. Ownership relation on Main Workspace-named rows without a personal map.
-- An owner relation is not a substitute for the personal-workspace mapping.
SELECT
  coalesce(r.relation, 'no-role-row') AS relation,
  count(*)::integer AS unclassified_main_workspace_count
FROM public.workspaces w
JOIN public.workspace_members m
  ON m.workspace_id = w.id AND m.active IS TRUE
LEFT JOIN private.ws01_member_roles r
  ON r.workspace_id = m.workspace_id AND r.user_id = m.user_id
WHERE w.name = 'Main Workspace'
  AND NOT EXISTS (
    SELECT 1 FROM private.ws02_personal_workspaces p
    WHERE p.workspace_id = w.id
  )
GROUP BY coalesce(r.relation, 'no-role-row');

-- 4. Aggregate check for an unclassified Main Workspace owner.
-- No user identifiers are returned. A likely legacy candidate is still not
-- automatically mapped; this is a read-only diagnostic only.
WITH unclassified AS (
  SELECT w.id AS workspace_id, m.user_id
  FROM public.workspaces w
  JOIN public.workspace_members m
    ON m.workspace_id = w.id AND m.active IS TRUE
  JOIN private.ws01_member_roles r
    ON r.workspace_id = m.workspace_id
   AND r.user_id = m.user_id
   AND r.relation = 'owner'
  WHERE w.name = 'Main Workspace'
    AND NOT EXISTS (
      SELECT 1 FROM private.ws02_personal_workspaces p
      WHERE p.workspace_id = w.id
    )
)
SELECT
  count(*)::integer AS unclassified_main_owner_rows,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM private.ws02_personal_workspaces p
    WHERE p.user_id = u.user_id
  ))::integer AS owner_users_with_another_personal_mapping,
  count(*) FILTER (WHERE (
    SELECT count(*)
    FROM public.workspaces w2
    JOIN public.workspace_members m2
      ON m2.workspace_id = w2.id
     AND m2.user_id = u.user_id
     AND m2.active IS TRUE
    WHERE w2.name = 'Main Workspace'
  ) > 1)::integer AS owner_users_with_multiple_main_named_rows
FROM unclassified u;

-- 5. Every personal mapping must resolve to its matching active membership
-- and the existing workspace owner relation. This query only reports counts.
SELECT
  count(*)::integer AS personal_mappings,
  count(*) FILTER (WHERE m.active IS TRUE)::integer AS active_memberships,
  count(*) FILTER (WHERE m.user_id IS NULL)::integer AS missing_memberships,
  count(*) FILTER (WHERE r.relation = 'owner')::integer AS owner_relations,
  count(*) FILTER (WHERE r.user_id IS NULL OR r.relation <> 'owner')::integer AS missing_owner_relations
FROM private.ws02_personal_workspaces p
LEFT JOIN public.workspace_members m
  ON m.workspace_id = p.workspace_id AND m.user_id = p.user_id
LEFT JOIN private.ws01_member_roles r
  ON r.workspace_id = p.workspace_id AND r.user_id = p.user_id;

-- 6. Canonical module-marker distribution by workspace.
SELECT
  substring(coalesce(b.description, '') FROM '^\[APSYNTRA:MODULE:([^]]+)\]') AS module_marker,
  b.workspace_id,
  count(*)::integer AS board_count
FROM public.work_boards b
WHERE b.description LIKE '[APSYNTRA:MODULE:%'
GROUP BY 1, 2
ORDER BY 1, 2;

-- 7. Canonical twelve board IDs and their live workspace ownership.
SELECT id, name, workspace_id,
  substring(coalesce(description, '') FROM '^\[APSYNTRA:MODULE:([^]]+)\]') AS module_marker
FROM public.work_boards
WHERE id IN (
  'b520cefe-6abb-446a-abec-ae5589329a99',
  '47df2cdc-503a-4a22-a35c-06f72be5c56b',
  'e761b849-f144-4ad2-a418-af9e68b5cc58',
  'f36da8fe-8d9d-4629-9938-12533cb3ca39',
  '7af78b3f-67bf-4600-9aa1-9006d19d486e',
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
  'd045708b-6e36-4f0a-92fc-f0b8baf93de3',
  'd1593528-36a6-4644-82f9-58873d3c136b',
  '8219a2a9-be85-479e-af0c-e4a399495f58',
  '991d8263-fc7d-49f0-9207-387edd51d299',
  '617c4c0f-e343-4b3b-8456-50d47dcbaf99'
)
ORDER BY module_marker;

-- 8. Workspace/board scoping columns in application tables.
SELECT
  table_schema,
  table_name,
  bool_or(column_name = 'workspace_id') AS has_workspace_id,
  bool_or(column_name = 'board_id') AS has_board_id,
  bool_or(column_name = 'module_id') AS has_module_id
FROM information_schema.columns
WHERE table_schema IN ('public', 'private')
GROUP BY table_schema, table_name
HAVING bool_or(column_name IN ('workspace_id', 'board_id', 'module_id'))
ORDER BY table_schema, table_name;
