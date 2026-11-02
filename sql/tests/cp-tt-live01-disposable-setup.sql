-- CP-TT-LIVE-01 disposable-only stand-ins, following GPS-03 fixture and migration.
-- Never used against employee records or production data.
CREATE OR REPLACE FUNCTION public.module_role_for(
  p_module_id text,p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT CASE WHEN public.has_module_access(p_module_id,p_user_id)
   THEN COALESCE(NULLIF(pg_catalog.current_setting('qa.time_tracker_role',true),''),'Employee')
   ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.module_role_for(text,uuid) FROM PUBLIC,anon,authenticated;
