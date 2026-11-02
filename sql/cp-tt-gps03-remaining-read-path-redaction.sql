-- CP-TT-GPS-03 — staged GPS disclosure closure. DO NOT apply to production
-- without separate approval and genuine signed-session regression acceptance.
-- All changes are transactional; no production records are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.timetracker_strip_nonprivileged_audit_geo(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_state jsonb;
  v_result jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v_state := p_value::jsonb;
  IF pg_catalog.jsonb_typeof(v_state) <> 'array' OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state) AS e(value)
    WHERE pg_catalog.jsonb_typeof(e.value) <> 'object'
  ) THEN
    RAISE EXCEPTION 'Audit projection requires an array of objects'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(e.value - 'geo' ORDER BY e.ordinality), '[]'::jsonb)
    INTO v_result
    FROM pg_catalog.jsonb_array_elements(v_state) WITH ORDINALITY AS e(value, ordinality);
  RETURN v_result::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.timetracker_strip_nonprivileged_cache_geo(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_state jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v_state := p_value::jsonb;
  IF pg_catalog.jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION 'GPS cache projection requires an object'
      USING ERRCODE = '22023';
  END IF;
  RETURN (v_state - 'latitude' - 'longitude' - 'accuracy' - 'altitude'
                  - 'altitudeAccuracy' - 'heading' - 'speed')::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.timetracker_redact_commit_receipt(p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.jsonb_typeof(p_receipt) <> 'object'
     OR pg_catalog.jsonb_typeof(p_receipt->'record') <> 'object'
     OR pg_catalog.jsonb_typeof(p_receipt->'value') <> 'string' THEN
    RAISE EXCEPTION 'Attendance receipt contract invalid' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(p_receipt, '{record}',
      (p_receipt->'record') #- '{clockIn,geo}' #- '{clockOut,geo}', false),
    '{value}',
    pg_catalog.to_jsonb(public.timetracker_strip_nonprivileged_geo(p_receipt->>'value')),
    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.timetracker_strip_nonprivileged_audit_geo(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timetracker_strip_nonprivileged_cache_geo(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timetracker_redact_commit_receipt(jsonb)
  FROM PUBLIC, anon, authenticated;

-- Retain the existing module-state contract; redact only GPS-bearing TimeTracker keys.
CREATE OR REPLACE FUNCTION public.list_module_state(p_module_id text)
RETURNS TABLE (state_key text, value text, scope text, revision bigint, updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  ws uuid;
  gps_privileged boolean := false;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_access(p_module_id, caller) THEN
    RAISE EXCEPTION 'module access denied' USING ERRCODE = '42501';
  END IF;
  ws := public.current_workspace_id(caller);
  IF p_module_id = 'time-tracker' THEN
    gps_privileged := public.apsyntra_role_is_bootstrap()
      OR public.module_role_for('time-tracker', caller) = 'Supervisor';
  END IF;

  RETURN QUERY
  SELECT e.state_key,
    CASE
      WHEN p_module_id = 'time-tracker' AND NOT gps_privileged
        AND e.state_key IN ('timetracker.attendance.v1', 'timetracker.attendance.v1.backup')
      THEN public.timetracker_strip_nonprivileged_geo(
        public.module_state_visible_value(p_module_id, e.state_key, e.value, caller))
      WHEN p_module_id = 'time-tracker' AND NOT gps_privileged
        AND e.state_key IN ('timetracker.audit.v1', 'timetracker.audit.v1.backup')
      THEN public.timetracker_strip_nonprivileged_audit_geo(
        public.module_state_visible_value(p_module_id, e.state_key, e.value, caller))
      WHEN p_module_id = 'time-tracker' AND NOT gps_privileged
        AND e.state_key = 'timetracker.auto-gps-cache.v1'
      THEN public.timetracker_strip_nonprivileged_cache_geo(
        public.module_state_visible_value(p_module_id, e.state_key, e.value, caller))
      ELSE public.module_state_visible_value(p_module_id, e.state_key, e.value, caller)
    END AS value, e.scope, e.revision, e.updated_at
  FROM public.module_state_entries e
  WHERE e.workspace_id = ws AND e.module_id = p_module_id
    AND (e.scope = 'shared' OR (e.scope = 'user' AND e.owner_key = caller::text))
    AND NOT (p_module_id = 'fueltrack-plus' AND e.state_key = 'fueltrackplus.activity.v3')
    AND public.module_state_visible_value(p_module_id, e.state_key, e.value, caller) IS NOT NULL
  ORDER BY e.state_key, e.scope;
END;
$$;

-- Preserve the original attendance transaction and its receipt schema.
-- The original function becomes a non-executable internal implementation;
-- only the redacting public wrapper remains callable by authenticated users.
DO $guard$
DECLARE
  v_old oid := pg_catalog.to_regprocedure(
    'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)');
BEGIN
  IF v_old IS NULL OR
     pg_catalog.to_regprocedure(
       'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)')
       IS NOT NULL OR
     pg_catalog.pg_get_function_result(v_old) <> 'jsonb' OR
     NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = v_old) THEN
    RAISE EXCEPTION 'Attendance implementation preflight failed; migration not applied'
      USING ERRCODE = '22023';
  END IF;
END;
$guard$;

ALTER FUNCTION public.commit_timetracker_attendance_action(
  text, text, text, text, jsonb, text, jsonb)
  RENAME TO timetracker_commit_attendance_raw_gps03;
REVOKE ALL ON FUNCTION public.timetracker_commit_attendance_raw_gps03(
  text, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.commit_timetracker_attendance_action(
  p_action text, p_record_id text, p_location text, p_department text,
  p_geo jsonb, p_work_note text, p_attendance_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_receipt jsonb;
BEGIN
  v_receipt := public.timetracker_commit_attendance_raw_gps03(
    p_action, p_record_id, p_location, p_department,
    p_geo, p_work_note, p_attendance_policy);
  -- Strip all returned GPS fixes, including for supervisors and bootstrap
  -- administrators; the dedicated signed GPS snapshot remains their reader.
  RETURN public.timetracker_redact_commit_receipt(v_receipt);
END;
$$;
REVOKE ALL ON FUNCTION public.commit_timetracker_attendance_action(
  text, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_timetracker_attendance_action(
  text, text, text, text, jsonb, text, jsonb) TO authenticated;
COMMIT;
