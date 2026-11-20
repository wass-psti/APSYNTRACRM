-- Bootstrap-only signed department directory for TimeTracker Team management.
-- Depends on 20261120100000_cp_tt_employee_departments_qol.sql.
CREATE FUNCTION public.timetracker_employee_department_directory_snapshot(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE v_actor uuid:=auth.uid();v_ws uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR public.apsyntra_role_is_bootstrap() IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Bootstrap TimeTracker department directory access denied' USING ERRCODE='42501';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-department-directory-1',
  'actorId',v_actor::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'assignments',COALESCE((
   SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('userId',d.user_id::text,
     'department',d.department) ORDER BY d.user_id)
   FROM private.tt_employee_departments d
   JOIN public.workspace_members m ON m.workspace_id=d.workspace_id
      AND m.user_id=d.user_id AND m.active IS TRUE
   JOIN public.profiles p ON p.id=d.user_id AND p.status='active'
   WHERE d.workspace_id=v_ws
  ),'[]'::jsonb)
 );
END;
$read$;
REVOKE ALL ON FUNCTION public.timetracker_employee_department_directory_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_employee_department_directory_snapshot(uuid)
 TO authenticated;
