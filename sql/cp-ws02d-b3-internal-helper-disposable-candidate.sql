-- CP-WS-02D/B3: fail-closed module-state delete helper candidate.
-- DISPOSABLE PG17 ONLY. Not a production migration; no live grants/data.
DO $fixture_guard$
BEGIN
 IF current_database()<>'ws02d_privacy_disposable'
 OR current_setting('server_version_num')::integer < 170000
 OR to_regprocedure('public.module_state_delete_allowed(text,text,uuid)') IS NULL
 OR position('return case p_module_id' IN
    pg_get_functiondef('public.module_state_delete_allowed(text,text,uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'Disposable helper source guard rejected'; END IF;
END $fixture_guard$;

-- Preserve signature, privileges, owner and module-specific role ceilings.
-- New checks prohibit missing/foreign actors, absent module entitlement,
-- and nullable permissions. No privileged cross-principal path is introduced.
CREATE OR REPLACE FUNCTION public.module_state_delete_allowed(
 p_module_id text,p_scope text,p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public' AS $guarded$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
 IF p_scope IS NULL OR public.has_module_access(p_module_id,p_user_id) IS DISTINCT FROM true
 THEN RETURN false; END IF;
 IF p_scope='user' THEN RETURN true; END IF;
 r:=public.module_role_for(p_module_id,p_user_id);
 RETURN coalesce(
  case p_module_id
   when 'time-tracker' then r in ('System Admin','IT Administrator','HR')
   when 'fueltrack-plus' then r='Admin'
   when 'tradelink' then r='General Manager'
   else false end,
  false);
END $guarded$;
