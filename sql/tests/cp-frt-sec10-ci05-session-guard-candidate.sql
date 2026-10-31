-- CP-FRT-SEC10-CI05: CANDIDATE ONLY. Test in disposable CI first.
-- Do not deploy to production before separate rollout and regression acceptance.
-- Scope: FRT domain helpers and all call sites delegating to frt_current_role.
-- Preserve source CP06 role/module/workspace ceilings and host identity.
BEGIN;
CREATE OR REPLACE FUNCTION private.frt_signed_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $signed$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_sid text := (SELECT auth.jwt()->>'session_id');
 v_exp text := (SELECT auth.jwt()->>'exp');
BEGIN
 IF v_actor IS NULL OR v_sid IS NULL OR v_exp IS NULL THEN RETURN false; END IF;
 IF v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR v_exp !~ '^[0-9]{1,12}$' THEN
   RETURN false;
 END IF;
 IF to_timestamp(v_exp::bigint) <= now() THEN RETURN false; END IF;
 RETURN EXISTS (
   SELECT 1 FROM auth.sessions AS sess
   WHERE sess.id=v_sid::uuid AND sess.user_id=v_actor
 );
END;
$signed$;
REVOKE ALL ON FUNCTION private.frt_signed_session_active() FROM PUBLIC,anon,authenticated;
-- Never grant this auth.sessions-checking function directly to signed API roles.
-- It is invoked only by the existing SECURITY DEFINER FRT role resolver.

CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
 SELECT role_source.role
 FROM (
   SELECT CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER'
               ELSE a.role END AS role
   FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
     AND wm.workspace_id=p_workspace_id AND wm.active=true
   LEFT JOIN public.module_role_assignments a ON a.user_id=p.id
     AND a.module_id='fund-released-tracker' AND a.enabled=true
   WHERE p.id=(SELECT auth.uid()) AND p.status='active'
     AND (SELECT private.frt_signed_session_active())
     AND (p.platform_role='admin_general_manager' OR
       a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
   LIMIT 1
 ) role_source
 WHERE public.apsyntra_crm_explicit_role(auth.uid(),p_workspace_id) IS NULL
    OR public.apsyntra_crm_module_role_rank(
         'fund-released-tracker',role_source.role)
       <= public.apsyntra_crm_role_rank(
         public.apsyntra_crm_effective_role(auth.uid(),p_workspace_id));
$$;
-- Preserve the existing FRT bootstrap read contract in this disposable fixture.
CREATE OR REPLACE FUNCTION public.frt_bootstrap(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE v_role text;
BEGIN
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN RAISE EXCEPTION 'WatchdogWorkspace access required' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('membership',jsonb_build_object(
   'workspace_id',p_workspace_id,'user_id',auth.uid(), 'role',v_role,
   'enabled',true,'status','active',
   'email',(SELECT p.email FROM public.profiles p WHERE p.id=auth.uid()),
   'display_name',(SELECT p.display_name FROM public.profiles p WHERE p.id=auth.uid())),
   'companies',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.display_order),'[]'::jsonb)
       FROM public.frt_companies c WHERE c.workspace_id=p_workspace_id));
END;
$function$
;
REVOKE ALL ON FUNCTION public.frt_bootstrap(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_bootstrap(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
