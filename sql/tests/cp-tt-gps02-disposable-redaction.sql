-- Disposable GPS redaction acceptance. No production writes or live employee records.
\set ON_ERROR_STOP on
\echo 'CP-TT-GPS-02: server-side nonprivileged coordinate redaction'

DO $$
DECLARE
 raw text:='{"version":1,"records":[{"id":"a","clockIn":{"timestamp":"2026-11-02T08:00:00+08:00","location":"Office","geo":{"latitude":6.99,"longitude":125.48,"accuracy":18}},"clockOut":{"timestamp":"2026-11-02T17:00:00+08:00","geo":{"latitude":7.0,"longitude":125.5}}},{"id":"b","clockIn":{"timestamp":"2026-11-01T08:00:00+08:00"},"clockOut":null}]}';
 result jsonb;
BEGIN
 result:=public.timetracker_strip_nonprivileged_geo(raw)::jsonb;
 IF result #> '{records,0,clockIn,geo}' IS NOT NULL
    OR result #> '{records,0,clockOut,geo}' IS NOT NULL THEN
  RAISE EXCEPTION 'FAIL: exact GPS coordinates survived nonprivileged read';
 END IF;
 IF result #>> '{records,0,clockIn,timestamp}' <> '2026-11-02T08:00:00+08:00'
    OR result #>> '{records,0,clockIn,location}' <> 'Office'
    OR result #>> '{records,1,id}' <> 'b'
    OR jsonb_array_length(result->'records')<>2 THEN
  RAISE EXCEPTION 'FAIL: attendance records corrupted during redaction';
 END IF;
 BEGIN
  PERFORM public.timetracker_strip_nonprivileged_geo('{"version":1,"records":false}');
  RAISE EXCEPTION 'FAIL: malformed attendance document did not fail closed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;

DO $$
DECLARE
 definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='list_module_state';
 IF definition IS NULL
    OR position('gps_privileged' IN definition)=0
    OR position('apsyntra_role_is_bootstrap' IN definition)=0
    OR position('module_role_for' IN definition)=0
    OR position('timetracker_strip_nonprivileged_geo' IN definition)=0 THEN
  RAISE EXCEPTION 'FAIL: module state server redaction gateway not installed';
 END IF;
END $$;

\echo 'CP-TT-GPS-02 PASS: coordinates excluded and attendance preserved'
