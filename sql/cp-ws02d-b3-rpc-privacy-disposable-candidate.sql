-- CP-WS-02D/B3 — disposable-only privacy guard candidate.
-- NOT A PRODUCTION MIGRATION. NEVER APPLY TO LIVE SUPABASE.
-- A controlled production change needs a separate source-fingerprint check,
-- review of all 45 function consumers, rollback and explicit authorization.
DO $guard$
BEGIN
 IF current_database() <> 'ws02d_privacy_disposable'
 OR current_setting('server_version_num')::integer < 170000
 OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
 THEN
  RAISE EXCEPTION 'Disposable PG17 privacy fixture required';
 END IF;
 IF position('SELECT p_user_id IS NOT NULL' IN
  pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure))=0
 THEN
  RAISE EXCEPTION 'Original source does not match inspected contract';
 END IF;
END
$guard$;

-- Only added condition: explicit user must equal the signed database actor.
-- All existing domain paths and the original function signature are preserved.
CREATE OR REPLACE FUNCTION public.has_module_access(
 p_module_id text, p_user_id uuid DEFAULT auth.uid()
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT p_user_id IS NOT NULL
  AND p_user_id = auth.uid()
  AND public.current_workspace_id(p_user_id) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.status='active')
  AND (
   CASE WHEN p_module_id IN (
     'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
     'fund-released-tracker','fueltrans','order-intake','tool-traceability',
     'material-request-hub','aps-aims','employee-eval','charter-navigator')
    AND public.apsyntra_crm_explicit_role(
       p_user_id,public.current_workspace_id(p_user_id)) IS NOT NULL
   THEN public.module_role_for(p_module_id,p_user_id) IS NOT NULL
   ELSE public.is_platform_admin(p_user_id) OR EXISTS(
    SELECT 1 FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled=true)
   END
  );
$function$;
