
DO $fix$ DECLARE ddl text;
BEGIN
 ddl:=pg_get_functiondef('public.tool_traceability_notification_set_seen_v2(uuid,uuid)'::regprocedure);
 IF position('NOT private.tool_traceability_has_access(p_workspace_id) OR p_notification_id IS NULL' IN ddl)=0 THEN RAISE EXCEPTION 'Receipt guard changed; fail closed';END IF;
 EXECUTE replace(ddl,'NOT private.tool_traceability_has_access(p_workspace_id) OR p_notification_id IS NULL','NOT private.tool_traceability_can_comment(p_workspace_id) OR p_notification_id IS NULL');
 ddl:=pg_get_functiondef('public.tool_traceability_notification_preferences_v2(uuid,boolean)'::regprocedure);
 IF position('IF p_enabled IS NOT NULL THEN' IN ddl)=0 THEN RAISE EXCEPTION 'Preference guard changed; fail closed';END IF;
 EXECUTE replace(ddl,'IF p_enabled IS NOT NULL THEN', 'IF p_enabled IS NOT NULL THEN IF NOT private.tool_traceability_can_comment(p_workspace_id) THEN RAISE EXCEPTION ''Notification preferences update denied'' USING ERRCODE=''42501'';END IF;');
END;$fix$;
;
