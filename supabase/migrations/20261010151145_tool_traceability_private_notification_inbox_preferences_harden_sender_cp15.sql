
CREATE TABLE IF NOT EXISTS public.tool_traceability_notification_prefs15(
workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
in_app_enabled boolean NOT NULL DEFAULT true,
updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
PRIMARY KEY(workspace_id,user_id));
ALTER TABLE public.tool_traceability_notification_prefs15 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_traceability_notification_prefs15 FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS tt_notifications15_page ON public.tool_traceability_notifications(workspace_id,target_user_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.tool_traceability_notification_inbox_v2(p_workspace_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_items jsonb;v_total integer;v_unread integer;v_enabled boolean;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN RAISE EXCEPTION 'Notification inbox denied' USING ERRCODE='42501';END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid inbox page' USING ERRCODE='22023';END IF;
 SELECT coalesce(in_app_enabled,true) INTO v_enabled FROM public.tool_traceability_notification_prefs15 WHERE workspace_id=p_workspace_id AND user_id=v_actor;
 v_enabled:=coalesce(v_enabled,true);
 SELECT count(*),count(*) FILTER(WHERE seen_at IS NULL) INTO v_total,v_unread FROM public.tool_traceability_notifications WHERE workspace_id=p_workspace_id AND target_user_id=v_actor;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO v_items FROM
 (SELECT n.id::text AS id,n.request_id,n.message,n.seen_at,n.created_at FROM public.tool_traceability_notifications n WHERE n.workspace_id=p_workspace_id AND n.target_user_id=v_actor ORDER BY n.created_at DESC,n.id DESC LIMIT p_limit OFFSET p_offset) x;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'items',v_items,'total',v_total,'unread',v_unread,'enabled',v_enabled,'cursor',CASE WHEN p_offset+p_limit<v_total THEN (p_offset+p_limit)::text ELSE NULL END);
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_notification_set_seen_v2(p_workspace_id uuid,p_notification_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_seen timestamptz;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) OR p_notification_id IS NULL THEN RAISE EXCEPTION 'Notification receipt denied' USING ERRCODE='42501';END IF;
 UPDATE public.tool_traceability_notifications SET seen_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND target_user_id=v_actor AND id=p_notification_id AND seen_at IS NULL RETURNING seen_at INTO v_seen;
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification missing or already read; refresh the inbox' USING ERRCODE='40001';END IF;
 RETURN jsonb_build_object('id',p_notification_id::text,'seen_at',v_seen);
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_notification_preferences_v2(p_workspace_id uuid,p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_enabled boolean;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_has_access(p_workspace_id) THEN RAISE EXCEPTION 'Notification preferences denied' USING ERRCODE='42501';END IF;
 IF p_enabled IS NOT NULL THEN
 INSERT INTO public.tool_traceability_notification_prefs15(workspace_id,user_id,in_app_enabled) VALUES(p_workspace_id,v_actor,p_enabled) ON CONFLICT(workspace_id,user_id) DO UPDATE SET in_app_enabled=excluded.in_app_enabled,updated_at=clock_timestamp();
 END IF;
 SELECT in_app_enabled INTO v_enabled FROM public.tool_traceability_notification_prefs15 WHERE workspace_id=p_workspace_id AND user_id=v_actor;
 RETURN jsonb_build_object('workspace_id',p_workspace_id,'user_id',v_actor,'in_app_enabled',coalesce(v_enabled,true));
END;$fn$;
CREATE OR REPLACE FUNCTION public.tool_traceability_notify(p_workspace_id uuid,p_request_id text,p_target_user_id uuid,p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_actor uuid:=auth.uid();v_notification public.tool_traceability_notifications%rowtype;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_can_comment(p_workspace_id) THEN RAISE EXCEPTION 'Notification sender denied' USING ERRCODE='42501';END IF;
 IF p_target_user_id IS NULL OR p_request_id IS NULL OR p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 2000 OR
 NOT EXISTS(SELECT 1 FROM public.tool_traceability_requests WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL) OR
 NOT EXISTS(SELECT 1 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id AND p.status='active' JOIN public.tool_traceability_memberships m ON m.workspace_id=w.workspace_id AND m.user_id=w.user_id AND m.enabled AND m.status='active' WHERE w.workspace_id=p_workspace_id AND w.user_id=p_target_user_id AND w.active)
 THEN RAISE EXCEPTION 'Invalid notification recipient or request' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.tool_traceability_notification_prefs15 WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id AND NOT in_app_enabled)
 THEN RETURN jsonb_build_object('suppressed',true);END IF;
 INSERT INTO public.tool_traceability_notifications(workspace_id,target_user_id,request_id,message) VALUES(p_workspace_id,p_target_user_id,p_request_id,btrim(p_message)) RETURNING * INTO v_notification;
 RETURN jsonb_build_object('id',v_notification.id::text,'createdAt',v_notification.created_at);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_notification_inbox_v2(uuid,integer,integer),public.tool_traceability_notification_set_seen_v2(uuid,uuid),public.tool_traceability_notification_preferences_v2(uuid,boolean),public.tool_traceability_notify(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_notification_inbox_v2(uuid,integer,integer),public.tool_traceability_notification_set_seen_v2(uuid,uuid),public.tool_traceability_notification_preferences_v2(uuid,boolean),public.tool_traceability_notify(uuid,text,uuid,text) TO authenticated;
;
