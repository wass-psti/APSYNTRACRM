-- CP-TT-LIVE-01 disposable-only stand-ins, following GPS-03 fixture and migration.
-- Never used against employee records or production data.
CREATE OR REPLACE FUNCTION public.module_role_for(
  p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT CASE WHEN public.has_module_access(p_module_id,p_user_id)
   THEN COALESCE(NULLIF(pg_catalog.current_setting('qa.time_tracker_role',true),''),'Employee')
   ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.module_role_for(text,uuid) FROM PUBLIC,anon,authenticated;

-- The production scope helper is pinned to the real TimeTracker board UUID.
-- This disposable fixture substitutes its synthetic board while retaining
-- the same signed-session, active-workspace, module and board-view checks.
CREATE OR REPLACE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $scope$
DECLARE
 v_actor uuid:=auth.uid();
 v_session text:=auth.jwt()->>'session_id';
 v_workspace uuid;
BEGIN
 IF v_actor IS NULL OR v_session IS NULL OR
    v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    NOT EXISTS(SELECT 1 FROM auth.sessions s
      WHERE s.id=v_session::uuid AND s.user_id=v_actor
       AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR
    public.has_module_access('time-tracker',v_actor) IS DISTINCT FROM TRUE OR
    public.module_role_for('time-tracker',v_actor) IS NULL OR
    NOT EXISTS(SELECT 1 FROM public.work_boards b
      WHERE b.id=p_board_id AND b.workspace_id=v_workspace
       AND b.name='TimeTracker Attendance' AND b.status='active'
       AND b.archived_at IS NULL AND b.trashed_at IS NULL
       AND public.work_board_access(b.id,'view')) THEN
  RAISE EXCEPTION 'Signed TimeTracker application, board or workspace access denied'
   USING ERRCODE='42501';
 END IF;
 RETURN v_workspace;
END
$scope$;

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
