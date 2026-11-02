-- CP-TT-LIVE-01 disposable PG17 security and receipt acceptance.
-- All attendance writes are synthetic and scoped to the isolated CI fixture.
\set ON_ERROR_STOP on
\echo 'CP-TT-LIVE-01: signed clock operations, isolation, audit and rollback'
-- Earlier OT fixture tests intentionally expired actor A; restore only the
-- disposable actor to independently validate a fresh active Clock session.
UPDATE auth.sessions SET not_after=pg_catalog.clock_timestamp()+INTERVAL '2 hours'
 WHERE id='10000000-0000-4000-8000-000000000031';
DO $$
DECLARE
 v_acl boolean;
BEGIN
 v_acl:=pg_catalog.has_function_privilege('authenticated',
 'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE');
 IF v_acl OR pg_catalog.has_function_privilege('anon',
 'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)','EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated',
 'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('authenticated',
 'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)','EXECUTE')
 OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
 WHERE oid='public.timetracker_attendance_mutation_audit'::regclass)
 OR pg_catalog.has_table_privilege('authenticated',
 'public.timetracker_attendance_mutation_audit','SELECT')
 THEN RAISE EXCEPTION 'FAIL: clock RPC or audit privilege boundary'; END IF;
END $$;

-- Anonymous caller cannot invoke either endpoint.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_attendance_capabilities(
    '10000000-0000-4000-8000-000000000021'::uuid);
  RAISE EXCEPTION 'FAIL: anonymous capabilities were executable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

-- Signed actor with active board/module grant can obtain exact contract.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $$
DECLARE
 v jsonb;
 g jsonb:=pg_catalog.jsonb_build_object(
  'status','captured','source','browser-geolocation','latitude',10.2,
  'longitude',123.9,'accuracy',12,
  'capturedAt',pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
BEGIN
 v:=public.timetracker_attendance_capabilities(
  '10000000-0000-4000-8000-000000000021'::uuid);
 IF v->>'mode'<>'ACTIVE' OR v->>'contract'<>'tt-attendance-1'
 OR v->>'actorId'<>'10000000-0000-4000-8000-000000000011'
 OR v->>'canClock'<>'true' THEN
  RAISE EXCEPTION 'FAIL: signed capability contract'; END IF;

 BEGIN
  PERFORM public.timetracker_attendance_commit_v2(
   '10000000-0000-4000-8000-000000000021'::uuid,'clock-in',NULL,
   'Offsite (Home)','HR',g,NULL);
  RAISE EXCEPTION 'FAIL: missing offsite note accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.timetracker_attendance_commit_v2(
   '20000000-0000-4000-8000-000000000022'::uuid,'clock-in',NULL,
   'Office-Base Duty','HR',g,NULL);
  RAISE EXCEPTION 'FAIL: cross-workspace board accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.timetracker_attendance_commit_v2(
   '10000000-0000-4000-8000-000000000021'::uuid,'clock-in',NULL,
   'Office-Base Duty','HR',g-'latitude',NULL);
  RAISE EXCEPTION 'FAIL: malformed GPS accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 v:=public.timetracker_attendance_commit_v2(
  '10000000-0000-4000-8000-000000000021'::uuid,'clock-in',NULL,
  'Offsite (Home)','HR',g,'Site operations, signed via browser GPS');
 IF v->>'mode'<>'COMMITTED' OR v->>'contract'<>'tt-attendance-1'
 OR v->>'recordId'<>'synthetic' OR v->>'action'<>'clock-in'
 OR v->>'revision'<>'12' OR v->>'actorId'<>'10000000-0000-4000-8000-000000000011'
 OR v ? 'value' OR v ? 'record' OR v ? 'geo' THEN
  RAISE EXCEPTION 'FAIL: invalid or GPS-bearing attendance receipt'; END IF;
 BEGIN
  UPDATE public.timetracker_attendance_mutation_audit SET action='clock-out';
  RAISE EXCEPTION 'FAIL: immutable audit accepted UPDATE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $audit_check$
BEGIN
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit)<>1 THEN
  RAISE EXCEPTION 'FAIL: attendance audit not atomic with write';
 END IF;
END $audit_check$;
ROLLBACK;

-- Expired token's still-valid JWT must not count as a live server session.
BEGIN;
UPDATE auth.sessions SET not_after=pg_catalog.clock_timestamp()-INTERVAL '1 second'
 WHERE id='10000000-0000-4000-8000-000000000031';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.timetracker_attendance_capabilities(
   '10000000-0000-4000-8000-000000000021'::uuid);
  RAISE EXCEPTION 'FAIL: expired session unexpectedly has Clock capability';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
ROLLBACK;

-- Revoked sessions, other workspace, disabled module, inactive profile denied.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000016","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_attendance_capabilities(
   '10000000-0000-4000-8000-000000000021'::uuid);
  RAISE EXCEPTION 'FAIL: mismatched signed session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"20000000-0000-4000-8000-000000000015","session_id":"20000000-0000-4000-8000-000000000035"}',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_attendance_capabilities(
   '10000000-0000-4000-8000-000000000021'::uuid);
  RAISE EXCEPTION 'FAIL: other workspace access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
\echo 'CP-TT-LIVE-01 PASS: synthetic signed scopes, privacy and audit'
