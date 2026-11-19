-- CP-CRM-CONN-02F compatibility closeout.
-- Align the native application context and TradeLink manager contract with
-- CP-NATIVE-APP-ACCESS-01, which is the authoritative frontend integration.

DO $preflight$
BEGIN
 IF to_regprocedure('private.native_application_board_context(text)') IS NULL
  OR to_regprocedure('public.native_application_board_context(text)') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regclass('public.work_boards') IS NULL
  OR to_regclass('public.work_board_groups') IS NULL
  OR to_regclass('public.work_board_columns') IS NULL
 THEN RAISE EXCEPTION 'CP-CRM-CONN-02F compatibility prerequisites are unavailable'; END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.native_application_board_context(p_module_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_profile_status text;
 v_role text;
 v_board_id uuid;
 v_board_name text;
 v_board_marker text;
 v_board jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT p.status INTO v_profile_status FROM public.profiles p WHERE p.id=v_actor;
 IF v_profile_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Active profile required' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id=v_workspace AND wm.user_id=v_actor AND wm.active IS TRUE
 ) THEN RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501'; END IF;
 CASE p_module_id
  WHEN 'time-tracker' THEN
   v_board_id:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
   v_board_name:='TimeTracker Attendance';
   v_board_marker:='[APSYNTRA:MODULE:timetracker:v1]';
  WHEN 'fund-released-tracker' THEN
   v_board_id:='f36da8fe-8d9d-4629-9938-12533cb3ca39';
   v_board_name:='Fund Released Tracker';
   v_board_marker:='[APSYNTRA:MODULE:frt:v1]';
  WHEN 'fueltrack-plus' THEN
   v_board_id:='7af78b3f-67bf-4600-9aa1-9006d19d486e';
   v_board_name:='FuelTrack+ v3';
   v_board_marker:='[APSYNTRA:MODULE:fueltrack:v1]';
  WHEN 'tradelink' THEN
   v_board_id:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
   v_board_name:='TradeLink';
   v_board_marker:='[APSYNTRA:MODULE:tradelink:v1]';
  ELSE RAISE EXCEPTION 'Unsupported native application' USING ERRCODE='22023';
 END CASE;
 IF public.has_module_access(p_module_id,v_actor) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Native application assignment is not active' USING ERRCODE='42501';
 END IF;
 v_role:=public.module_role_for(p_module_id,v_actor);
 IF v_role IS NULL THEN RAISE EXCEPTION 'Native application role is unavailable' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'archived_at',b.archived_at,'trashed_at',b.trashed_at,
  'created_at',b.created_at,'updated_at',b.updated_at,
  'member_role',NULL::text,'view_mode','table'
 ) INTO v_board
 FROM public.work_boards b
 WHERE b.id=v_board_id AND b.workspace_id=v_workspace
  AND b.name=v_board_name AND b.description LIKE v_board_marker||'%'
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL;
 IF v_board IS NULL THEN
  RAISE EXCEPTION 'Canonical native application board is unavailable in this workspace' USING ERRCODE='P0002';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','native-app-board-v1','moduleId',p_module_id,
  'userId',v_actor,'workspaceId',v_workspace,'role',v_role,'board',v_board,
  'groups',CASE WHEN p_module_id='tradelink' THEN coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',g.id,'title',g.title,'position',g.position,'accent_color',g.accent_color
   ) ORDER BY g.position,g.id)
   FROM public.work_board_groups g WHERE g.board_id=v_board_id
  ),'[]'::jsonb) ELSE '[]'::jsonb END,
  'columns',CASE WHEN p_module_id='tradelink' THEN coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',c.id,'column_key',c.column_key,'name',c.name,'data_type',c.data_type,
    'system_key',c.system_key,'position',c.position,'visible',c.visible,
    'required',c.required,'config',c.config
   ) ORDER BY c.position,c.id)
   FROM public.work_board_columns c WHERE c.board_id=v_board_id
  ),'[]'::jsonb) ELSE '[]'::jsonb END
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.native_application_board_context(p_module_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT private.native_application_board_context(p_module_id);
$function$;

CREATE OR REPLACE FUNCTION private.tl03_can_manage(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT private.wm_board_config_session_active()
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid THEN
  RETURN false;
 END IF;
 RETURN coalesce(public.work_board_access(p_board_id,'manage'),false)
  AND coalesce(public.module_role_for('tradelink',v_actor)='General Manager',false)
  AND EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
   AND b.name='TradeLink' AND b.status='active' AND b.archived_at IS NULL
   AND b.trashed_at IS NULL AND b.workspace_id=public.current_workspace_id(v_actor)
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%');
END;
$function$;

REVOKE ALL ON FUNCTION private.native_application_board_context(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.native_application_board_context(text) TO authenticated;
REVOKE ALL ON FUNCTION public.native_application_board_context(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_application_board_context(text) TO authenticated;
COMMENT ON FUNCTION public.native_application_board_catalog() IS
 'CP-02F metadata-only supplemental catalog; the active frontend uses the CP-NATIVE-APP-ACCESS-01 signed native context resolver.';
COMMENT ON FUNCTION public.tl03_activity_read(uuid,integer) IS
 'CP-02F supplemental document-event projection; the active TradeLink frontend uses tl03_native_activity.';
;
