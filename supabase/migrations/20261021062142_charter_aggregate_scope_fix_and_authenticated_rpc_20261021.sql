DO $$
DECLARE v_ddl text; v_old text := 'AND i.archived_at IS NULL AND (role_name=''admin'' OR i.owner_id=uid OR (v_filters ? ''tripDate'' AND v_filters ? ''tier'' AND v_filters ? ''session'' AND v_filters ? ''bookingStatus''))'; v_new text := 'AND i.archived_at IS NULL AND (role_name=''admin'' OR i.owner_id=uid)';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_ddl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='charter_dispatch'
 AND pg_get_function_identity_arguments(p.oid)='p_workspace_id uuid, p_path text, p_method text, p_body jsonb';
 IF v_ddl IS NULL OR strpos(v_ddl,v_old)=0 THEN RAISE EXCEPTION 'BLOCKED: expected Charter aggregate security clause not present'; END IF;
 v_ddl := replace(v_ddl,v_old,v_new);
 EXECUTE v_ddl;
END $$;
REVOKE ALL ON FUNCTION public.charter_dispatch(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charter_dispatch(uuid,text,text,jsonb) TO authenticated;;
