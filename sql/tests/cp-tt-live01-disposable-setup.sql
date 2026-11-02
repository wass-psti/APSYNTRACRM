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

-- The production generic writer delegates its permissions to this policy.
CREATE OR REPLACE FUNCTION public.module_state_policy(
 p_module_id text,p_state_key text)
RETURNS TABLE(required_scope text,max_bytes integer,writable boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT 'shared'::text,26214400::integer,true::boolean $$;
CREATE OR REPLACE FUNCTION public.module_state_delete_allowed(
 p_module_id text,p_scope text,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT p_scope='shared' AND public.has_module_access(p_module_id,p_user_id) $$;
-- Synthetic direct generic RPC to prove read/write-policy bypass is denied.
CREATE OR REPLACE FUNCTION public.put_module_state(
 p_module_id text,p_state_key text,p_value text,
 p_scope text DEFAULT 'shared',p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF NOT public.module_state_write_allowed(p_module_id,p_state_key,auth.uid()) THEN
  RAISE EXCEPTION 'module state write denied' USING ERRCODE='42501';
 END IF;
 RETURN pg_catalog.jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.put_module_state(text,text,text,text,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.put_module_state(text,text,text,text,bigint)
 TO authenticated;
