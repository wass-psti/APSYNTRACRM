-- CP-BOARD-COL01 — NOT ACTIVATED. Additive, security-reviewed candidate only.
-- DO NOT run against production without independent approval and signed-user
-- same-/foreign-workspace acceptance, rollback and audit checks.
-- Reuses existing Work Management authorization, tables and logging.
BEGIN;

-- Reject revoked GoTrue sessions for CP-BOARD-COL01 RPCs.
CREATE OR REPLACE FUNCTION public.wm_col01_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=auth.uid();
 v_claim text:=auth.jwt()->>'session_id';
 v_session uuid;
BEGIN
 IF v_actor IS NULL OR v_claim IS NULL OR
    v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 v_session:=v_claim::uuid;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=v_session
    AND s.user_id=v_actor AND (s.not_after IS NULL OR s.not_after>pg_catalog.now()));
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_col01_session_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_col01_session_active() TO authenticated;

-- Existing member grant is guarded by the caller's MANAGE ceiling but does not
-- explicitly verify that a target profile belongs to the board's workspace.
CREATE OR REPLACE FUNCTION public.wm_add_board_member(
 p_board_id uuid,p_email text,p_role text DEFAULT 'viewer'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_ws uuid;
 v_target uuid;
 v_old_role text;
 v_ceiling text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.wm_col01_session_active() OR
    NOT public.work_board_access(p_board_id,'manage') THEN
   RAISE EXCEPTION 'Board management access denied' USING ERRCODE='42501';
 END IF;
 IF p_role IS NULL OR p_role NOT IN ('viewer','editor') THEN
   RAISE EXCEPTION 'Invalid board access role' USING ERRCODE='22023';
 END IF;
 SELECT b.workspace_id INTO v_ws FROM public.work_boards b WHERE b.id=p_board_id;
 IF v_ws IS NULL OR public.current_workspace_id(auth.uid()) IS DISTINCT FROM v_ws THEN
   RAISE EXCEPTION 'Wrong workspace' USING ERRCODE='42501';
 END IF;
 SELECT p.id INTO v_target FROM public.profiles p
  WHERE pg_catalog.lower(p.email)=pg_catalog.lower(pg_catalog.btrim(p_email))
    AND p.status='active';
 IF v_target IS NULL OR NOT public.wm_board_member_active(v_ws,v_target) THEN
   RAISE EXCEPTION 'Active member of this workspace required' USING ERRCODE='42501';
 END IF;
 SELECT m.role INTO v_old_role FROM public.work_board_members m
 WHERE m.board_id=p_board_id AND m.user_id=v_target FOR UPDATE;
 IF v_old_role='owner' THEN
   RAISE EXCEPTION 'Board owner role cannot be reassigned' USING ERRCODE='42501';
 END IF;
 v_ceiling:=public.apsyntra_crm_explicit_role(v_target,v_ws);
 IF p_role='editor' AND v_ceiling='viewer' THEN
   RAISE EXCEPTION 'Platform role ceiling denies board editor access' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.work_board_members(board_id,user_id,role,added_by)
 VALUES(p_board_id,v_target,p_role,auth.uid())
 ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role,updated_at=pg_catalog.now();
 PERFORM public.work_board_log(p_board_id,'member.updated',
  'Board membership updated','member',v_target::text,pg_catalog.jsonb_build_object('role',p_role));
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_add_board_member(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_add_board_member(uuid,text,text) TO authenticated;

-- A searchable directory is limited to active members of this one workspace
-- and callable only by someone already holding board MANAGE permission.
CREATE OR REPLACE FUNCTION public.wm_board_invitable_users(
 p_board_id uuid,p_query text DEFAULT ''
) RETURNS TABLE(user_id uuid,display_name text,email text,board_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_ws uuid;
 v_q text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_query,'')));
BEGIN
 IF auth.uid() IS NULL OR NOT public.wm_col01_session_active() OR
    NOT public.work_board_access(p_board_id,'manage') THEN
   RAISE EXCEPTION 'Board management access denied' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.length(v_q)>120 THEN RAISE EXCEPTION 'Search too long' USING ERRCODE='22023'; END IF;
 SELECT b.workspace_id INTO v_ws FROM public.work_boards b WHERE b.id=p_board_id;
 IF v_ws IS NULL OR public.current_workspace_id(auth.uid()) IS DISTINCT FROM v_ws THEN
   RAISE EXCEPTION 'Wrong workspace' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT p.id,p.display_name,p.email,m.role
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
 LEFT JOIN public.work_board_members m ON m.board_id=p_board_id AND m.user_id=wm.user_id
 WHERE wm.workspace_id=v_ws AND wm.active
  AND (v_q='' OR pg_catalog.strpos(pg_catalog.lower(coalesce(p.display_name,'')),v_q)>0
            OR pg_catalog.strpos(pg_catalog.lower(p.email),v_q)>0)
 ORDER BY coalesce(p.display_name,p.email),p.id
 LIMIT 40;
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_board_invitable_users(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_board_invitable_users(uuid,text) TO authenticated;

-- The item read methods do not grant SELECT on underlying RLS-protected tables.
-- The specific item must belong to the board the signed caller is allowed to view.
CREATE OR REPLACE FUNCTION public.wm_list_board_item_updates(
 p_item_id uuid,p_limit integer DEFAULT 50
) RETURNS TABLE(id bigint,item_id uuid,body text,created_by uuid,
 created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_board uuid;
BEGIN
 SELECT i.board_id INTO v_board FROM public.work_board_items i
 WHERE i.id=p_item_id AND i.archived_at IS NULL;
 IF auth.uid() IS NULL OR NOT public.wm_col01_session_active() OR v_board IS NULL OR
    NOT public.work_board_access(v_board,'view') THEN
   RAISE EXCEPTION 'Item update access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT u.id,u.item_id,u.body,u.created_by,u.created_at,u.updated_at
 FROM public.work_board_item_updates u
 WHERE u.item_id=p_item_id AND u.board_id=v_board
 ORDER BY u.id DESC
 LIMIT least(greatest(coalesce(p_limit,50),1),100);
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_list_board_item_updates(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_list_board_item_updates(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.wm_list_board_item_files(
 p_item_id uuid,p_limit integer DEFAULT 50
) RETURNS TABLE(id uuid,item_id uuid,storage_path text,file_name text,mime_type text,
 size_bytes bigint,created_by uuid,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_board uuid;
BEGIN
 SELECT i.board_id INTO v_board FROM public.work_board_items i
 WHERE i.id=p_item_id AND i.archived_at IS NULL;
 IF auth.uid() IS NULL OR NOT public.wm_col01_session_active() OR v_board IS NULL OR
    NOT public.work_board_access(v_board,'view') THEN
   RAISE EXCEPTION 'Item file access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT f.id,f.item_id,f.storage_path,f.file_name,f.mime_type,
  f.size_bytes,f.created_by,f.created_at
 FROM public.work_board_item_files f
 WHERE f.item_id=p_item_id AND f.board_id=v_board
 ORDER BY f.created_at DESC,f.id DESC
 LIMIT least(greatest(coalesce(p_limit,50),1),100);
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_list_board_item_files(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_list_board_item_files(uuid,integer) TO authenticated;

-- Genuine keyset pagination beyond the original 200-event list window.
CREATE OR REPLACE FUNCTION public.wm_list_board_events_page(
 p_board_id uuid,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS TABLE(id bigint,event_type text,message text,entity_type text,
 entity_id text,created_at timestamptz,actor_id uuid,actor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.wm_col01_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
   RAISE EXCEPTION 'Board event access denied' USING ERRCODE='42501';
 END IF;
 IF p_before_id IS NOT NULL AND p_before_id<=0 THEN
   RAISE EXCEPTION 'Invalid audit cursor' USING ERRCODE='22023';
 END IF;
 RETURN QUERY SELECT e.id,e.event_type,e.message,e.entity_type,e.entity_id,
  e.created_at,e.actor_id,coalesce(p.display_name,p.email)
 FROM public.work_board_events e
 JOIN public.profiles p ON p.id=e.actor_id
 WHERE e.board_id=p_board_id AND (p_before_id IS NULL OR e.id<p_before_id)
 ORDER BY e.id DESC
 LIMIT least(greatest(coalesce(p_limit,50),1),100);
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_list_board_events_page(uuid,bigint,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_list_board_events_page(uuid,bigint,integer)
 TO authenticated;

COMMIT;
