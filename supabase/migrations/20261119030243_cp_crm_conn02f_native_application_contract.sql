-- CP-CRM-CONN-02F: native application catalog discovery and application-scoped
-- board context. No generic Board memberships, roles, RLS policies or grants
-- are created or modified by this migration.

DO $preflight$
BEGIN
 IF to_regprocedure('private.native_application_board_context(text)') IS NULL
  OR to_regprocedure('public.native_application_board_context(text)') IS NULL
  OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
  OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_review(uuid)') IS NULL
  OR to_regprocedure('private.tl03_review_assignee(text,jsonb,text)') IS NULL
  OR to_regclass('public.work_boards') IS NULL
  OR to_regclass('public.work_board_groups') IS NULL
  OR to_regclass('public.work_board_columns') IS NULL
  OR to_regclass('public.work_board_items') IS NULL
  OR to_regclass('public.workspace_members') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
 THEN RAISE EXCEPTION 'CP-CRM-CONN-02F prerequisites are unavailable'; END IF;
END
$preflight$;

-- The native shell carries only board metadata (groups/columns) and never
-- includes generic board items, board members or item values. All four native
-- applications can use the same metadata projection without a Board grant.
CREATE OR REPLACE FUNCTION private.native_application_board_context(p_module_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 SELECT p.status INTO v_profile_status
 FROM public.profiles p WHERE p.id=v_actor;
 IF v_profile_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Active profile required' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id=v_workspace AND wm.user_id=v_actor AND wm.active IS TRUE
 ) THEN
  RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501';
 END IF;
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
  ELSE
   RAISE EXCEPTION 'Unsupported native application' USING ERRCODE='22023';
 END CASE;
 IF public.has_module_access(p_module_id,v_actor) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Native application assignment is not active' USING ERRCODE='42501';
 END IF;
 v_role:=public.module_role_for(p_module_id,v_actor);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'Native application role is unavailable' USING ERRCODE='42501';
 END IF;
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
  RAISE EXCEPTION 'Canonical native application board is unavailable in this workspace'
   USING ERRCODE='P0002';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','native-app-board-v1','moduleId',p_module_id,
  'userId',v_actor,'workspaceId',v_workspace,'role',v_role,'board',v_board,
  'groups',coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',g.id,'title',g.title,'position',g.position,'accent_color',g.accent_color
   ) ORDER BY g.position,g.id)
   FROM public.work_board_groups g WHERE g.board_id=v_board_id
  ),'[]'::jsonb),
  'columns',coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',c.id,'column_key',c.column_key,'name',c.name,'data_type',c.data_type,
    'system_key',c.system_key,'position',c.position,'visible',c.visible,
    'required',c.required,'config',c.config
   ) ORDER BY c.position,c.id)
   FROM public.work_board_columns c WHERE c.board_id=v_board_id
  ),'[]'::jsonb)
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.native_application_board_catalog()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_profile_status text;
 v_rows jsonb;
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 SELECT p.status INTO v_profile_status
 FROM public.profiles p WHERE p.id=v_actor;
 IF v_profile_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Active profile required' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id=v_workspace AND wm.user_id=v_actor AND wm.active IS TRUE
 ) THEN
  RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'member_role',NULL::text,
  'item_count',(SELECT count(*)::integer FROM public.work_board_items i
    WHERE i.board_id=b.id AND i.archived_at IS NULL),
  'created_at',b.created_at,'updated_at',b.updated_at,
  'native_module_id',m.module_id,
  'native_module_role',public.module_role_for(m.module_id,v_actor)
 ) ORDER BY b.updated_at DESC,b.created_at DESC,b.id), '[]'::jsonb)
 INTO v_rows
 FROM (VALUES
  ('time-tracker','46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid,
   'TimeTracker Attendance','[APSYNTRA:MODULE:timetracker:v1]'),
  ('fund-released-tracker','f36da8fe-8d9d-4629-9938-12533cb3ca39'::uuid,
   'Fund Released Tracker','[APSYNTRA:MODULE:frt:v1]'),
  ('fueltrack-plus','7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid,
   'FuelTrack+ v3','[APSYNTRA:MODULE:fueltrack:v1]'),
  ('tradelink','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid,
   'TradeLink','[APSYNTRA:MODULE:tradelink:v1]')
 ) AS m(module_id,board_id,board_name,board_marker)
 JOIN public.work_boards b ON b.id=m.board_id
 WHERE b.workspace_id=v_workspace AND b.name=m.board_name
  AND b.description LIKE m.board_marker||'%'
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
  AND public.has_module_access(m.module_id,v_actor) IS TRUE
  AND public.module_role_for(m.module_id,v_actor) IS NOT NULL;
 RETURN v_rows;
END;
$function$;

-- TradeLink manager operations use the existing module assignment and exact
-- canonical board. They do not require generic Board-manage membership.
CREATE OR REPLACE FUNCTION private.tl03_can_manage(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT private.wm_board_config_session_active()
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid THEN
  RETURN false;
 END IF;
 RETURN coalesce(public.has_module_access('tradelink',v_actor),false)
  AND coalesce(public.module_role_for('tradelink',v_actor)='General Manager',false)
  AND EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
   AND b.name='TradeLink' AND b.status='active' AND b.archived_at IS NULL
   AND b.trashed_at IS NULL AND b.workspace_id=public.current_workspace_id(v_actor)
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%');
END;
$function$;

-- Native TradeLink activity is derived from the immutable document event log.
-- Managers see the workspace stream; other assigned users see only events for
-- documents where their signed email is a configured primary/secondary reviewer.
CREATE OR REPLACE FUNCTION public.tl03_activity_read(
 p_board_id uuid,p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_actor_email text;
 v_manager boolean;
 v_reviewer boolean;
 v_rows jsonb;
BEGIN
 IF v_actor IS NULL OR p_board_id IS DISTINCT FROM
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid THEN
  RAISE EXCEPTION 'Signed TradeLink activity access required' USING ERRCODE='42501';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid TradeLink activity limit' USING ERRCODE='22023';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 v_manager:=private.tl03_can_manage(p_board_id);
 v_reviewer:=private.tl03_can_review(p_board_id);
 IF NOT coalesce(v_manager,false) AND NOT coalesce(v_reviewer,false) THEN
  RAISE EXCEPTION 'TradeLink application assignment required' USING ERRCODE='42501';
 END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_actor_email
 FROM auth.users u WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',e.event_id,'event_type',e.operation,
  'message',pg_catalog.concat_ws(' · ',e.document_number,e.document_type,
    coalesce(nullif(e.metadata->>'to',''),e.operation)),
  'actor_name',coalesce(nullif(p.display_name,''),p.email,'Recorded user'),
  'actor_email',p.email,'actor_id',e.actor_id,
  'entity_type',e.document_type,'entity_id',e.document_number,
  'created_at',e.at
 ) ORDER BY e.at DESC,e.event_id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT ev.event_id,ev.document_id,ev.operation,ev.actor_id,ev.at,ev.metadata,
   d.document_number,d.document_type,d.content
  FROM public.tradelink_document_events ev
  JOIN public.tradelink_documents d ON d.id=ev.document_id
   AND d.board_id=ev.board_id AND d.workspace_id=ev.workspace_id
  WHERE ev.board_id=p_board_id AND ev.workspace_id=v_workspace
   AND (v_manager OR (v_actor_email IS NOT NULL AND v_actor_email IN (
    private.tl03_review_assignee(d.document_type,d.content,'primary'),
    private.tl03_review_assignee(d.document_type,d.content,'secondary')
   )))
  ORDER BY ev.at DESC,ev.event_id DESC LIMIT p_limit
 ) e
 LEFT JOIN public.profiles p ON p.id=e.actor_id;
 RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.native_application_board_catalog() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.native_application_board_catalog() TO authenticated;
REVOKE ALL ON FUNCTION public.tl03_activity_read(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_activity_read(uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.native_application_board_catalog() IS
 'Returns only canonical native application board metadata for existing module assignees; never returns generic board items or memberships.';
COMMENT ON FUNCTION public.tl03_activity_read(uuid,integer) IS
 'Returns the signed TradeLink document audit stream; non-manager assignees see only events for documents assigned to their signed email.';
;
