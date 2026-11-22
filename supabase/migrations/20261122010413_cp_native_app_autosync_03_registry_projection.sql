-- CP-NATIVE-APP-AUTOSYNC-03: Read-only registered module projection from existing canonical boards.
-- No new table, module assignment, policy or domain-specific role vocabulary.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.apsyntra_native_application_registry(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_modules jsonb;
BEGIN
 -- Reuse the role-management snapshot's existing signed workspace scope.
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'moduleId',s.module_id,'name',s.name,'boardId',s.id,
   'updatedAt',s.updated_at
 ) ORDER BY s.name,s.module_id),'[]'::jsonb)
 INTO v_modules
 FROM (
  SELECT DISTINCT ON (q.module_id)
   q.module_id,q.name,q.id,q.updated_at
  FROM (
   SELECT b.id,b.name,b.updated_at,
    CASE substring(b.description FROM E'^\\[APSYNTRA:MODULE:([a-z][a-z0-9-]*):v1\\]')
     WHEN 'tools' THEN 'tool-traceability'
     WHEN 'toolbox' THEN 'toolbox-issues'
     WHEN 'frt' THEN 'fund-released-tracker'
     WHEN 'fueltrack' THEN 'fueltrack-plus'
     WHEN 'timetracker' THEN 'time-tracker'
     WHEN 'orders' THEN 'order-intake'
     WHEN 'evaluation' THEN 'employee-eval'
     WHEN 'charter' THEN 'charter-navigator'
     WHEN 'aims' THEN 'aps-aims'
     WHEN 'materials' THEN 'material-request-hub'
     ELSE substring(b.description FROM E'^\\[APSYNTRA:MODULE:([a-z][a-z0-9-]*):v1\\]')
    END AS module_id
   FROM public.work_boards b
   WHERE b.workspace_id=p_workspace_id
    AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.description LIKE '[APSYNTRA:MODULE:%'
  ) q
  WHERE q.module_id IS NOT NULL
  ORDER BY q.module_id,q.updated_at DESC,q.id
 ) s;
 RETURN jsonb_build_object(
  'contract','cp-native-app-autosync-03-v1',
  'workspaceId',p_workspace_id,
  'modules',v_modules
 );
END;
$fn$;

REVOKE ALL ON FUNCTION public.apsyntra_native_application_registry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_native_application_registry(uuid) TO authenticated;
COMMIT;
