-- CP-APP-LOAD-02 signed Clock-only retrieval acceptance. Disposable PG17 only.
\set ON_ERROR_STOP on
\echo 'CP-APP-LOAD-02: lightweight TimeTracker Clock snapshot'

DO $acl$
DECLARE
 v_public_definer boolean;
 v_private_definer boolean;
 v_public_volatility "char";
 v_private_volatility "char";
BEGIN
 IF NOT pg_catalog.has_function_privilege('authenticated',
   'public.timetracker_clock_snapshot(uuid)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege('authenticated',
   'private.timetracker_clock_snapshot(uuid)','EXECUTE')
  OR NOT pg_catalog.has_schema_privilege('authenticated','private','USAGE')
  OR pg_catalog.has_schema_privilege('anon','private','USAGE')
  OR pg_catalog.has_table_privilege('authenticated',
   'public.module_state_entries','SELECT') THEN
  RAISE EXCEPTION 'FAIL: Clock snapshot existing schema-access boundary';
 END IF;
 SELECT p.prosecdef INTO v_public_definer
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='timetracker_clock_snapshot';
 SELECT p.prosecdef,p.provolatile INTO v_private_definer,v_private_volatility
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='timetracker_clock_snapshot';
 SELECT p.provolatile INTO v_public_volatility
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='timetracker_clock_snapshot';
 IF v_public_definer IS DISTINCT FROM false OR v_private_definer IS DISTINCT FROM true
  OR v_public_volatility IS DISTINCT FROM 'v'
  OR v_private_volatility IS DISTINCT FROM 'v' THEN
  RAISE EXCEPTION 'FAIL: public invoker wrapper and private volatile definer contract';
 END IF;
END
$acl$;

-- Anonymous callers cannot execute the public RPC.
BEGIN;
SET LOCAL ROLE anon;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $anon$
BEGIN
 BEGIN
  PERFORM public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: anonymous Clock snapshot allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$anon$;
ROLLBACK;

-- Employee A receives only their own 20 attendance records, with no GPS or
-- unrelated backup/OT state. The result must be substantially smaller.
BEGIN;
SELECT pg_catalog.set_config('test.full_state_bytes',(
 SELECT pg_catalog.octet_length(value)::text
 FROM public.module_state_entries
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*'),true);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $employee_a$
DECLARE
 v jsonb;
 v_full_bytes integer;
 v_clock_bytes integer;
 v_count integer;
 v_active integer;
BEGIN
 v:=public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'contract'<>'tt-clock-snapshot-1'
  OR v->>'actorId'<>'10000000-0000-4000-8000-000000000011'
  OR v->>'workspaceId'<>'10000000-0000-4000-8000-000000000001'
  OR v->>'boardId'<>'10000000-0000-4000-8000-000000000021'
  OR v->>'stateKey'<>'timetracker.attendance.v1'
  OR v->>'scope'<>'shared'
  OR v->>'rowFound'<>'true'
  OR v->>'revision'<>'42'
  OR v->>'updatedAt' IS NULL THEN
  RAISE EXCEPTION 'FAIL: Clock snapshot identity or revision contract: %',v;
 END IF;
 v_count:=pg_catalog.jsonb_array_length((v->>'value')::jsonb->'records');
 IF v_count<>20 THEN RAISE EXCEPTION 'FAIL: expected 20 own rows, got %',v_count; END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_array_elements((v->>'value')::jsonb->'records') r
  WHERE r.value->>'ownerId'<>'cloud:10000000-0000-4000-8000-000000000011'
 ) THEN RAISE EXCEPTION 'FAIL: foreign employee row returned'; END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_array_elements((v->>'value')::jsonb->'records') r
  WHERE r.value#>'{clockIn,geo}' IS NOT NULL
     OR r.value#>'{clockOut,geo}' IS NOT NULL
 ) THEN RAISE EXCEPTION 'FAIL: GPS payload returned to Clock'; END IF;
 SELECT count(*) INTO v_active
 FROM pg_catalog.jsonb_array_elements((v->>'value')::jsonb->'records') r
 WHERE r.value->>'id'='session-50'
  AND (r.value->'clockOut' IS NULL OR r.value->'clockOut'='null'::jsonb);
 IF v_active<>1 THEN RAISE EXCEPTION 'FAIL: active Clock session was not preserved'; END IF;
 v_full_bytes:=current_setting('test.full_state_bytes')::integer;
 v_clock_bytes:=pg_catalog.octet_length(v->>'value');
 IF v_clock_bytes*10>=v_full_bytes THEN
  RAISE EXCEPTION 'FAIL: Clock payload reduction below 90 percent: % / % bytes',
   v_clock_bytes,v_full_bytes;
 END IF;
 IF v ? 'directory' OR v ? 'employees' OR v ? 'overtime' OR v ? 'backup' THEN
  RAISE EXCEPTION 'FAIL: unrelated Clock payload fields were returned';
 END IF;
 RAISE NOTICE 'Clock projection payload: % bytes; full attendance state: % bytes; reduction: % percent',
  v_clock_bytes,v_full_bytes,
  pg_catalog.round((1-v_clock_bytes::numeric/v_full_bytes)*100,2);
END
$employee_a$;
ROLLBACK;

-- Employee B sees their own rows, not Employee A's rows.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000012","session_id":"10000000-0000-4000-8000-000000000032"}',true);
DO $employee_b$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
 IF pg_catalog.jsonb_array_length((v->>'value')::jsonb->'records')<>980
  OR EXISTS(
   SELECT 1 FROM pg_catalog.jsonb_array_elements((v->>'value')::jsonb->'records') r
   WHERE r.value->>'ownerId'<>'cloud:10000000-0000-4000-8000-000000000012'
  ) THEN RAISE EXCEPTION 'FAIL: Employee B owner projection mismatch'; END IF;
END
$employee_b$;
ROLLBACK;

-- Active module membership in another workspace cannot use this workspace board.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"20000000-0000-4000-8000-000000000015","session_id":"20000000-0000-4000-8000-000000000035"}',true);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: foreign workspace board accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$foreign$;
ROLLBACK;

-- An authenticated user without a TimeTracker assignment is denied.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000013","session_id":"10000000-0000-4000-8000-000000000033"}',true);
DO $unassigned$
BEGIN
 BEGIN
  PERFORM public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: unassigned user received Clock snapshot';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$unassigned$;
ROLLBACK;

-- Expired signed sessions remain denied by the existing scope helper.
BEGIN;
UPDATE auth.sessions SET not_after=pg_catalog.clock_timestamp()-INTERVAL '1 second'
 WHERE id='10000000-0000-4000-8000-000000000031';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: expired session received Clock snapshot';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$expired$;
ROLLBACK;

-- No attendance row returns the stable empty revision-0 contract.
BEGIN;
DELETE FROM public.module_state_entries
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
  AND scope='shared' AND owner_key='*';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
DO $empty$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_clock_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'rowFound'<>'false' OR v->>'revision'<>'0'
  OR pg_catalog.jsonb_array_length((v->>'value')::jsonb->'records')<>0
  OR v->>'updatedAt' IS NOT NULL THEN
  RAISE EXCEPTION 'FAIL: empty Clock snapshot contract: %',v;
 END IF;
END
$empty$;
ROLLBACK;

\echo 'CP-APP-LOAD-02 PASS: signed, owner-scoped Clock retrieval and payload reduction'
