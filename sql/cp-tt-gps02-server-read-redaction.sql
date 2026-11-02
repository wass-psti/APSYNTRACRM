-- CP-TT-GPS-02 — STAGED server-side privacy correction.
-- Only centrally verified bootstrap administrators or current TimeTracker
-- Supervisors can obtain exact coordinates. All other module roles receive
-- attendance details with nested GPS fixes stripped by the SERVER.
-- Replaces list_module_state without changing its signature or other modules.
-- Do not install in production until disposable checks and operational review.
BEGIN;

CREATE OR REPLACE FUNCTION public.timetracker_strip_nonprivileged_geo(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_state jsonb;
 v_records jsonb;
BEGIN
 IF p_value IS NULL THEN RETURN NULL; END IF;
 v_state:=p_value::jsonb;
 IF pg_catalog.jsonb_typeof(v_state)<>'object'
    OR pg_catalog.jsonb_typeof(v_state->'records')<>'array' THEN
  RAISE EXCEPTION 'Attendance projection requires valid records'
   USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(
  item.value #- '{clockIn,geo}' #- '{clockOut,geo}'
 ),'[]'::jsonb)
 INTO v_records
 FROM pg_catalog.jsonb_array_elements(v_state->'records') AS item(value);
 RETURN pg_catalog.jsonb_set(v_state,'{records}',v_records,true)::text;
END;
$$;

REVOKE ALL ON FUNCTION public.timetracker_strip_nonprivileged_geo(text)
 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_module_state(p_module_id text)
RETURNS TABLE (
 state_key text,
 value text,
 scope text,
 revision bigint,
 updated_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 caller uuid:=auth.uid();
 ws uuid;
 gps_privileged boolean:=false;
BEGIN
 IF caller IS NULL THEN
  RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';
 END IF;
 IF NOT public.has_module_access(p_module_id,caller) THEN
  RAISE EXCEPTION 'module access denied' USING ERRCODE='42501';
 END IF;
 ws:=public.current_workspace_id(caller);

 IF p_module_id='time-tracker' THEN
  gps_privileged:=
   public.apsyntra_role_is_bootstrap() OR
   public.module_role_for('time-tracker',caller)='Supervisor';
 END IF;

 RETURN QUERY
 SELECT e.state_key,
  CASE
   WHEN p_module_id='time-tracker'
    AND e.state_key IN ('timetracker.attendance.v1','timetracker.attendance.v1.backup')
    AND NOT gps_privileged
   THEN public.timetracker_strip_nonprivileged_geo(
    public.module_state_visible_value(p_module_id,e.state_key,e.value,caller))
   ELSE public.module_state_visible_value(p_module_id,e.state_key,e.value,caller)
  END AS value,
  e.scope,e.revision,e.updated_at
 FROM public.module_state_entries e
 WHERE e.workspace_id=ws AND e.module_id=p_module_id
  AND (e.scope='shared' OR (e.scope='user' AND e.owner_key=caller::text))
  AND NOT (p_module_id='fueltrack-plus' AND e.state_key='fueltrackplus.activity.v3')
  AND public.module_state_visible_value(p_module_id,e.state_key,e.value,caller) IS NOT NULL
 ORDER BY e.state_key,e.scope;
END;
$$;

-- Preserve the original function's existing authenticated grant.
-- The new helper is not exposed to anonymous or authenticated RPC callers.
COMMIT;
