-- CP-TT-GPS-03: synthetic-only disposable regression. NO production writes.
\set ON_ERROR_STOP on
\echo 'CP-TT-GPS-03: verify GPS read paths and attendance commit receipts'
DO $test$
DECLARE
 v_audit jsonb;
 v_cache jsonb;
 v_receipt jsonb;
BEGIN
 v_audit := public.timetracker_strip_nonprivileged_audit_geo(
  '[{"id":"a","timestamp":"2026-11-02T08:00:00Z","geo":{"latitude":6.99,"longitude":125.48,"accuracy":12}},{"id":"b","status":"clock-out"}]')::jsonb;
 IF v_audit #> '{0,geo}' IS NOT NULL OR
    v_audit #>> '{0,timestamp}' <> '2026-11-02T08:00:00Z' OR
    v_audit #>> '{1,id}' <> 'b' THEN
  RAISE EXCEPTION 'FAIL: audit GPS redaction corrupted events or retained coordinates';
 END IF;
 v_cache := public.timetracker_strip_nonprivileged_cache_geo(
  '{"latitude":6.99,"longitude":125.48,"accuracy":12,"timestamp":"2026-11-02T08:00:00Z"}')::jsonb;
 IF v_cache ? 'latitude' OR v_cache ? 'longitude' OR v_cache ? 'accuracy'
    OR v_cache->>'timestamp' <> '2026-11-02T08:00:00Z' THEN
  RAISE EXCEPTION 'FAIL: cached GPS coordinates remain visible';
 END IF;
 v_receipt := public.timetracker_redact_commit_receipt(
  pg_catalog.jsonb_build_object(
    'revision',3,
    'record','{"id":"a","ownerId":"cloud:sample","clockIn":{"timestamp":"2026-11-02T08:00:00Z","geo":{"latitude":6.99,"longitude":125.48}}}'::jsonb,
    'value','{"version":1,"records":[{"id":"a","clockIn":{"timestamp":"2026-11-02T08:00:00Z","geo":{"latitude":6.99,"longitude":125.48}}}]}'::text));
 IF v_receipt #> '{record,clockIn,geo}' IS NOT NULL
    OR (v_receipt->>'value')::jsonb #> '{records,0,clockIn,geo}' IS NOT NULL
    OR v_receipt->>'revision' <> '3'
    OR v_receipt #>> '{record,id}' <> 'a' THEN
  RAISE EXCEPTION 'FAIL: write receipt returned GPS or lost identifying information';
 END IF;
 BEGIN
   PERFORM public.timetracker_strip_nonprivileged_audit_geo('{"bad":"state"}');
   RAISE EXCEPTION 'FAIL: malformed audit did not fail closed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $test$;

DO $test$
DECLARE
 def text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(p.oid) INTO def
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='list_module_state';
 IF def IS NULL OR position('timetracker_strip_nonprivileged_audit_geo' IN def)=0
  OR position('timetracker_strip_nonprivileged_cache_geo' IN def)=0
  OR position('timetracker_strip_nonprivileged_geo' IN def)=0 THEN
   RAISE EXCEPTION 'FAIL: list_module_state does not cover all GPS-bearing state keys';
 END IF;
 IF pg_catalog.has_function_privilege('authenticated',
    'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',
    'public.timetracker_redact_commit_receipt(jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon',
    'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated',
    'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL: attendance write RPC privilege boundary incorrect';
 END IF;
END $test$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011"}',true);
DO $test$
DECLARE
 receipt jsonb;
BEGIN
 receipt := public.commit_timetracker_attendance_action(
  'clock-in',NULL,'Office','Engineering',
  '{"status":"captured","latitude":6.99,"longitude":125.48,"accuracy":12}'::jsonb,
  NULL,'{}'::jsonb);
 IF receipt #> '{record,clockIn,geo}' IS NOT NULL
    OR (receipt->>'value')::jsonb #> '{records,0,clockIn,geo}' IS NOT NULL
    OR receipt #>> '{record,ownerId}' <> 'cloud:10000000-0000-4000-8000-000000000011'
    OR receipt->>'revision' <> '12' THEN
  RAISE EXCEPTION 'FAIL: signed synthetic attendance receipt exposed GPS';
 END IF;
END $test$;
ROLLBACK;

\echo 'CP-TT-GPS-03 PASS: redaction, receipt compatibility and grants'
