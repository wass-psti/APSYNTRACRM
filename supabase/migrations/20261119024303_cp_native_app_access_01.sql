-- CP-NATIVE-APP-ACCESS-01
-- Resolve native application access through the existing module assignment and
-- canonical application board. Generic Work Management board access is unchanged.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

DO $preflight$
BEGIN
 IF to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
  OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_document_read_assigned(uuid,uuid)') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('public.fueltrack_v3_guard(uuid,boolean,boolean)') IS NULL
  OR to_regprocedure('public.fueltrack_v3_receipt_storage_upload_allowed(text,jsonb)') IS NULL
  OR to_regprocedure('public.timetracker_ot_require_scope(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Native application access prerequisites are not installed'
   USING ERRCODE='55000';
 END IF;
 IF (SELECT count(*) FROM public.work_boards
     WHERE id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'
       AND name='TimeTracker Attendance'
       AND description LIKE '[APSYNTRA:MODULE:timetracker:v1]%'
       AND status='active' AND archived_at IS NULL AND trashed_at IS NULL)<>1
 OR (SELECT count(*) FROM public.work_boards
     WHERE id='f36da8fe-8d9d-4629-9938-12533cb3ca39'
       AND name='Fund Released Tracker'
       AND description LIKE '[APSYNTRA:MODULE:frt:v1]%'
       AND status='active' AND archived_at IS NULL AND trashed_at IS NULL)<>1
 OR (SELECT count(*) FROM public.work_boards
     WHERE id='7af78b3f-67bf-4600-9aa1-9006d19d486e'
       AND name='FuelTrack+ v3'
       AND description LIKE '[APSYNTRA:MODULE:fueltrack:v1]%'
       AND status='active' AND archived_at IS NULL AND trashed_at IS NULL)<>1
 OR (SELECT count(*) FROM public.work_boards
     WHERE id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'
       AND name='TradeLink'
       AND description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
       AND status='active' AND archived_at IS NULL AND trashed_at IS NULL)<>1 THEN
  RAISE EXCEPTION 'A canonical native application board is missing or inactive'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- One authoritative resolver for the four existing native application boards.
-- It validates the current signed user, active workspace membership and the
-- application-specific role. It returns only canonical board metadata.
CREATE OR REPLACE FUNCTION private.native_application_board_context(
 p_module_id text
) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.native_application_board_context(
 p_module_id text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT private.native_application_board_context(p_module_id);
$function$;

REVOKE ALL ON FUNCTION private.native_application_board_context(text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.native_application_board_context(text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.native_application_board_context(text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_application_board_context(text)
 TO authenticated;

-- Native assigned-review access is application-scoped. Generic board access
-- remains unchanged, and manager operations still use tl03_can_manage().
CREATE OR REPLACE FUNCTION private.tl03_can_review(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_board_id IS DISTINCT FROM
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR NOT private.wm_board_config_session_active() THEN
  RETURN FALSE;
 END IF;
 RETURN public.module_role_for('tradelink',actor) IS NOT NULL
  AND EXISTS(
   SELECT 1 FROM auth.users u
   JOIN public.profiles p ON p.id=u.id
   JOIN public.work_boards b ON b.id=p_board_id
   WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
    AND p.status='active' AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.workspace_id=public.current_workspace_id(actor)
    AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
  );
END;
$function$;

-- Return exactly one TradeLink document's board mirror row after the same
-- assigned-review or existing board-manager domain checks. No board item list
-- or generic board shell is exposed to a non-manager reviewer.
CREATE OR REPLACE FUNCTION private.tl03_board_projection(
 p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 v_document jsonb;
 v_board jsonb;
 v_item jsonb;
BEGIN
 IF v_actor IS NULL OR p_document_id IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink document context required' USING ERRCODE='42501';
 END IF;
 IF private.tl03_can_manage(v_board_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.archived_at IS NULL;
 ELSE
  v_document:=private.tl03_document_read_assigned(v_board_id,p_document_id);
 END IF;
 IF v_document IS NULL THEN RETURN NULL; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'archived_at',b.archived_at,'trashed_at',b.trashed_at
 ) INTO v_board
 FROM public.work_boards b
 WHERE b.id=v_board_id AND b.workspace_id=public.current_workspace_id(v_actor)
  AND b.name='TradeLink' AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
  AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%';
 SELECT pg_catalog.jsonb_build_object(
  'id',i.id,'title',i.title,'archived_at',i.archived_at,'updated_at',i.updated_at
 ) INTO v_item
 FROM public.work_board_items i
 WHERE i.id=(v_document->>'board_item_id')::uuid
  AND i.board_id=v_board_id AND i.archived_at IS NULL
  AND i.title=v_document->>'document_number';
 IF v_board IS NULL OR v_item IS NULL THEN RETURN NULL; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tradelink-board-projection-v1','board',v_board,'item',v_item
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tl03_board_projection(
 p_document_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT private.tl03_board_projection(p_document_id);
$function$;

REVOKE ALL ON FUNCTION private.tl03_board_projection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.tl03_board_projection(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.tl03_board_projection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tl03_board_projection(uuid) TO authenticated;

-- Native TradeLink activity is limited to its one canonical application board.
CREATE OR REPLACE FUNCTION private.tl03_native_activity(
 p_limit integer DEFAULT 100
) RETURNS TABLE(
 id bigint,event_type text,message text,entity_type text,entity_id text,
 payload jsonb,created_at timestamptz,actor_id uuid,actor_name text,actor_email text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid TradeLink activity limit' USING ERRCODE='22023';
 END IF;
 IF private.tl03_can_review(v_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'TradeLink application activity access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT e.id,e.event_type,e.message,e.entity_type,e.entity_id,e.payload,
  e.created_at,e.actor_id,coalesce(p.display_name,p.email),p.email
 FROM public.work_board_events e
 JOIN public.profiles p ON p.id=e.actor_id
 WHERE e.board_id=v_board_id
 ORDER BY e.id DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tl03_native_activity(
 p_limit integer DEFAULT 100
) RETURNS TABLE(
 id bigint,event_type text,message text,entity_type text,entity_id text,
 payload jsonb,created_at timestamptz,actor_id uuid,actor_name text,actor_email text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT * FROM private.tl03_native_activity(p_limit);
$function$;

REVOKE ALL ON FUNCTION private.tl03_native_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.tl03_native_activity(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.tl03_native_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tl03_native_activity(integer) TO authenticated;

-- FuelTrack native workflows use their existing module role and canonical
-- board identity. They no longer require generic Work Management membership.
CREATE OR REPLACE FUNCTION public.fueltrack_v3_guard(
 p_board_id uuid,p_admin boolean DEFAULT false,p_write boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_ws uuid;
 v_role text;
BEGIN
 IF v_user IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 v_ws:=public.current_workspace_id(v_user);
 IF v_ws IS NULL
  OR p_board_id IS DISTINCT FROM '7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
  OR public.has_module_access('fueltrack-plus',v_user) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'FuelTrack module access denied' USING ERRCODE='42501';
 END IF;
 v_role:=public.module_role_for('fueltrack-plus',v_user);
 IF v_role NOT IN ('Admin','User') OR (p_admin AND v_role<>'Admin') THEN
  RAISE EXCEPTION 'FuelTrack role denied' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.work_boards b
  WHERE b.id=p_board_id AND b.workspace_id=v_ws
   AND b.name='FuelTrack+ v3'
   AND b.description LIKE '[APSYNTRA:MODULE:fueltrack:v1]%'
   AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
 ) THEN
  RAISE EXCEPTION 'FuelTrack native application board not available' USING ERRCODE='42501';
 END IF;
 -- p_write is retained for RPC compatibility. Existing operation-specific
 -- module-role and workflow checks remain authoritative for every mutation.
 RETURN v_ws;
END;
$function$;

-- Existing receipt upload policy already calls this function. Remove only the
-- generic board-view prerequisite; preserve Admin role, object metadata,
-- request completion, canonical item linkage and duplicate-receipt prevention.
CREATE OR REPLACE FUNCTION public.fueltrack_v3_receipt_storage_upload_allowed(
 p_name text,p_metadata jsonb
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_workspace uuid;
 v_item uuid;
 v_mime text;
 v_size_text text;
 v_size bigint;
BEGIN
 IF v_user IS NULL OR p_name IS NULL OR p_metadata IS NULL
  OR pg_catalog.jsonb_typeof(p_metadata)<>'object'
  OR p_name !~* (
   '^7af78b3f-67bf-4600-9aa1-9006d19d486e/'||
   '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/'||
   '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$'
  ) THEN RETURN FALSE; END IF;
 IF public.has_module_access('fueltrack-plus',v_user) IS DISTINCT FROM TRUE
  OR public.module_role_for('fueltrack-plus',v_user) IS DISTINCT FROM 'Admin' THEN
  RETURN FALSE;
 END IF;
 v_workspace:=public.current_workspace_id(v_user);
 IF v_workspace IS NULL THEN RETURN FALSE; END IF;
 v_item:=pg_catalog.split_part(p_name,'/',2)::uuid;
 v_mime:=p_metadata->>'mimetype';
 v_size_text:=p_metadata->>'size';
 IF v_mime NOT IN ('image/jpeg','image/png','image/webp')
  OR v_size_text !~ '^[0-9]{1,12}$' THEN RETURN FALSE; END IF;
 v_size:=v_size_text::bigint;
 IF v_size NOT BETWEEN 1 AND 5242880 THEN RETURN FALSE; END IF;
 IF (v_mime='image/jpeg' AND p_name !~* '\.(jpg|jpeg)$')
  OR (v_mime='image/png' AND p_name !~* '\.png$')
  OR (v_mime='image/webp' AND p_name !~* '\.webp$') THEN RETURN FALSE; END IF;
 RETURN EXISTS(
  SELECT 1 FROM public.fueltrack_v3_requests r
  JOIN public.work_board_items i ON i.id=r.board_item_id AND i.board_id=r.board_id
   AND i.archived_at IS NULL
  JOIN public.work_boards b ON b.id=r.board_id AND b.workspace_id=r.workspace_id
   AND b.id='7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
   AND b.name='FuelTrack+ v3'
   AND b.description LIKE '[APSYNTRA:MODULE:fueltrack:v1]%'
   AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
  WHERE r.workspace_id=v_workspace
   AND r.board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
   AND r.board_item_id=v_item AND r.state IN ('refueling_done','completed')
   AND NOT EXISTS(SELECT 1 FROM public.fueltrack_v3_receipts x
    WHERE x.request_id=r.id AND x.board_id=r.board_id)
 );
EXCEPTION WHEN OTHERS THEN
 RETURN FALSE;
END;
$function$;

-- Signed receipt reads remain limited to the request owner or FuelTrack Admin.
-- This is a path-specific storage policy, not a generic Work Management grant.
CREATE OR REPLACE FUNCTION private.fueltrack_v3_receipt_storage_read_allowed(
 p_name text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_workspace uuid;
 v_role text;
 v_item uuid;
BEGIN
 IF v_user IS NULL OR p_name IS NULL OR p_name !~* (
  '^7af78b3f-67bf-4600-9aa1-9006d19d486e/'||
  '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/'||
  '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$'
 ) THEN RETURN FALSE; END IF;
 IF public.has_module_access('fueltrack-plus',v_user) IS DISTINCT FROM TRUE THEN
  RETURN FALSE;
 END IF;
 v_role:=public.module_role_for('fueltrack-plus',v_user);
 IF v_role NOT IN ('Admin','User') THEN RETURN FALSE; END IF;
 v_workspace:=public.current_workspace_id(v_user);
 v_item:=pg_catalog.split_part(p_name,'/',2)::uuid;
 IF v_workspace IS NULL THEN RETURN FALSE; END IF;
 RETURN EXISTS(
  SELECT 1 FROM public.fueltrack_v3_receipts x
  JOIN public.fueltrack_v3_requests r
   ON r.id=x.request_id AND r.board_id=x.board_id
    AND r.board_item_id=x.board_item_id
  JOIN public.work_boards b ON b.id=r.board_id AND b.workspace_id=r.workspace_id
  JOIN public.work_board_items i ON i.id=r.board_item_id AND i.board_id=r.board_id
  WHERE x.storage_path=p_name
   AND x.board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
   AND x.board_item_id=v_item AND r.workspace_id=v_workspace
   AND r.board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
   AND r.state IN ('refueling_done','completed')
   AND (v_role='Admin' OR r.requested_by=v_user)
   AND b.name='FuelTrack+ v3'
   AND b.description LIKE '[APSYNTRA:MODULE:fueltrack:v1]%'
   AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
   AND i.archived_at IS NULL
 );
EXCEPTION WHEN OTHERS THEN
 RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION private.fueltrack_v3_receipt_storage_read_allowed(text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fueltrack_v3_receipt_storage_read_allowed(text)
 TO authenticated;

DROP POLICY IF EXISTS fueltrack_v3_receipt_read ON storage.objects;
CREATE POLICY fueltrack_v3_receipt_read ON storage.objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='work-board-files'
  AND private.fueltrack_v3_receipt_storage_read_allowed(name)
 );

-- TimeTracker overtime operations keep the current live signed-session check,
-- workspace membership, module role and canonical board binding. Only generic
-- board-view membership is removed from the native application boundary.
CREATE OR REPLACE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_ws uuid;
 v_session_text text;
BEGIN
 IF v_user IS NULL OR p_board_id IS NULL THEN
  RAISE EXCEPTION 'Signed OT application access required' USING ERRCODE='42501';
 END IF;
 v_session_text:=auth.jwt()->>'session_id';
 IF v_session_text IS NULL OR
    v_session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=v_session_text::uuid
      AND s.user_id=v_user AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 v_ws:=public.current_workspace_id(v_user);
 IF v_ws IS NULL
  OR p_board_id IS DISTINCT FROM '46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
  OR public.has_module_access('time-tracker',v_user) IS DISTINCT FROM TRUE
  OR public.module_role_for('time-tracker',v_user) IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
      AND b.workspace_id=v_ws AND b.name='TimeTracker Attendance'
      AND b.description LIKE '[APSYNTRA:MODULE:timetracker:v1]%'
      AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL) THEN
  RAISE EXCEPTION 'Signed TimeTracker application, board or workspace access denied'
   USING ERRCODE='42501';
 END IF;
 RETURN v_ws;
END;
$function$;

COMMIT;
