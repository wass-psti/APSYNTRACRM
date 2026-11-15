
DO $serialize$
DECLARE ddl text;injection text;
BEGIN
 injection:='PERFORM pg_advisory_xact_lock(hashtext(''tool_traceability_roles09''),hashtext(p_workspace_id::text));';
 ddl:=pg_get_functiondef('public.tool_traceability_roles_update_v2(uuid,uuid,text,boolean,timestamptz)'::regprocedure);
 IF position('SELECT * INTO v_current FROM public.tool_traceability_memberships' in ddl)=0
 OR position(injection in ddl)<>0 THEN RAISE EXCEPTION 'Versioned role function changed; locking migration refused';END IF;
 EXECUTE replace(ddl,'SELECT * INTO v_current FROM public.tool_traceability_memberships',
 injection||E'\n '||'SELECT * INTO v_current FROM public.tool_traceability_memberships');
 ddl:=pg_get_functiondef('public.tool_traceability_admin_set_role(uuid,uuid,text,boolean)'::regprocedure);
 IF position('SELECT * INTO v_previous FROM public.tool_traceability_memberships' in ddl)=0
 OR position(injection in ddl)<>0 THEN RAISE EXCEPTION 'Legacy role function changed; locking migration refused';END IF;
 ddl:=replace(ddl,'SELECT * INTO v_previous FROM public.tool_traceability_memberships',
 injection||E'\n '||'SELECT * INTO v_previous FROM public.tool_traceability_memberships');
 IF position('RETURN jsonb_build_object(''workspaceId'',' in ddl)=0 THEN
 RAISE EXCEPTION 'Legacy audit insertion point unavailable';END IF;
 ddl:=replace(ddl,'RETURN jsonb_build_object(''workspaceId'',',
 'INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail) '||
 'VALUES(p_workspace_id,''membership'',p_user_id::text,auth.uid(),''role_configured_legacy'','||
 'jsonb_build_object(''role'',v_role,''enabled'',p_enabled,''previous_role'',v_previous.role)); '||
 'RETURN jsonb_build_object(''workspaceId'',');
 EXECUTE ddl;
END;$serialize$;
;
