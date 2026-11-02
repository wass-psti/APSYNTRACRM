-- CP-TT-MONITOR-01: dispose-only server security acceptance.
-- Applies only in the existing disposable OT02 PostgreSQL fixture.
\set ON_ERROR_STOP on
\echo 'CP-TT-MONITOR-01 / server-side aggregate monitoring acceptance'
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
  'session_id','10000000-0000-4000-8000-000000000031')::text,false);
SET ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_monitor_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: anonymous monitor access permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
-- Signed ordinary manager is not a bootstrap administrator.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000014',
  'session_id','10000000-0000-4000-8000-000000000034')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_monitor_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: ordinary manager allowed to monitor PostgreSQL';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
-- Server-recognized bootstrap may read only aggregate counters.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000013',
  'session_id','10000000-0000-4000-8000-000000000033')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_monitor_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'mode'<>'ACTIVE' OR v->>'scope'<>'BOOTSTRAP_AGGREGATE' OR
    v->>'actorId'<>'10000000-0000-4000-8000-000000000013' OR
    v->>'workspaceId'<>'10000000-0000-4000-8000-000000000001' OR
    coalesce((v->'database'->>'connections')::integer,-1)<0 OR
    v ? 'queryText' OR v ? 'token' THEN
  RAISE EXCEPTION 'FAIL: bad bootstrap monitor contract %',v;
 END IF;
 BEGIN
  PERFORM public.timetracker_monitor_snapshot('20000000-0000-4000-8000-000000000022');
  RAISE EXCEPTION 'FAIL: foreign workspace monitor granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
\echo 'CP-TT-MONITOR-01 PASS — disposable bootstrap aggregate health checks'
