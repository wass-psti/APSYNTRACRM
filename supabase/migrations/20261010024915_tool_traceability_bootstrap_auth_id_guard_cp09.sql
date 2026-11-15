
CREATE TABLE IF NOT EXISTS public.tool_traceability_bootstrap_admins09 (
 workspace_id uuid NOT NULL, user_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,user_id)
);
ALTER TABLE public.tool_traceability_bootstrap_admins09 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_traceability_bootstrap_admins09 FROM PUBLIC,anon,authenticated;
DO $guard$
DECLARE v_workspace uuid:='00000000-0000-4000-8000-000000000001'::uuid;v_count integer;
BEGIN
 SELECT count(*) INTO v_count FROM auth.users u
 JOIN public.workspace_members w ON w.user_id=u.id AND w.workspace_id=v_workspace AND w.active
 JOIN public.tool_traceability_memberships m ON m.workspace_id=v_workspace AND m.user_id=u.id
 WHERE lower(u.email) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 AND m.role='ADMIN' AND m.enabled AND m.status='active';
 IF v_count<>2 THEN RAISE EXCEPTION 'Two active named Tool Traceability bootstrap accounts required'; END IF;
 INSERT INTO public.tool_traceability_bootstrap_admins09(workspace_id,user_id)
 SELECT v_workspace,u.id FROM auth.users u
 WHERE lower(u.email) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 ON CONFLICT DO NOTHING;
 IF (SELECT count(*) FROM public.tool_traceability_bootstrap_admins09 WHERE workspace_id=v_workspace)<>2
 THEN RAISE EXCEPTION 'Bootstrap identity registry count mismatch';END IF;
END;$guard$;
DO $patch$
DECLARE ddl text;old_fragment text;new_fragment text;
BEGIN
 old_fragment:='v_email IN (''lmsenagan@watchdogautomation.com.ph'',''asenagan@watchdogautomation.com.ph'')';
 new_fragment:='EXISTS(SELECT 1 FROM public.tool_traceability_bootstrap_admins09 b WHERE b.workspace_id=p_workspace_id AND b.user_id=p_user_id)';
 ddl:=pg_get_functiondef('public.tool_traceability_roles_update_v2(uuid,uuid,text,boolean,timestamptz)'::regprocedure);
 IF position(old_fragment in ddl)=0 THEN RAISE EXCEPTION 'Versioned role function changed; patch refused'; END IF;
 EXECUTE replace(ddl,old_fragment,new_fragment);
 ddl:=pg_get_functiondef('public.tool_traceability_admin_set_role(uuid,uuid,text,boolean)'::regprocedure);
 IF position(old_fragment in ddl)=0 THEN RAISE EXCEPTION 'Legacy role function changed; patch refused'; END IF;
 EXECUTE replace(ddl,old_fragment,new_fragment);
 ddl:=pg_get_functiondef('public.tool_traceability_roles_page_v2(uuid,text,integer,integer)'::regprocedure);
 old_fragment:='lower(coalesce(p.email,'''')) IN (''lmsenagan@watchdogautomation.com.ph'',''asenagan@watchdogautomation.com.ph'')';
 new_fragment:='EXISTS(SELECT 1 FROM public.tool_traceability_bootstrap_admins09 b WHERE b.workspace_id=w.workspace_id AND b.user_id=w.user_id)';
 IF position(old_fragment in ddl)=0 THEN RAISE EXCEPTION 'Role listing function changed; patch refused'; END IF;
 EXECUTE replace(ddl,old_fragment,new_fragment);
END;$patch$;
;
