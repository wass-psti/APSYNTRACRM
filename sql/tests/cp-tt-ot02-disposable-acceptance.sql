-- CP-TT-OT-02: disposable PostgreSQL acceptance only. NEVER run on production.
-- Precondition: cp-tt-ot02-disposable-setup.sql and cp-tt-ot01-staged-bootstrap-approval.sql
-- Must run in their own isolated disposable database, never alongside live fixtures.
\set ON_ERROR_STOP on
\echo 'CP-TT-OT-02 isolated signed-session and bootstrap security acceptance'
SET ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: anonymous snapshot allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_submit('10000000-0000-4000-8000-000000000021',
   current_date, '18:00', '20:00', 'Unauthorized anonymous request');
  RAISE EXCEPTION 'FAIL: anonymous submission allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Employee A: genuine RPC permission, mocked GoTrue current session/board.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
 'session_id','10000000-0000-4000-8000-000000000031')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'OWN_OT_ONLY' OR v->>'bootstrapApprover'<>'false'
  OR jsonb_array_length(v->'rows')<>0 THEN
  RAISE EXCEPTION 'FAIL: employee initial OT visibility %',v;
 END IF;
 BEGIN
  PERFORM * FROM public.timetracker_ot_requests;
  RAISE EXCEPTION 'FAIL: direct authenticated table read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM * FROM public.timetracker_ot_audit;
  RAISE EXCEPTION 'FAIL: direct authenticated audit read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 v:=public.timetracker_ot_submit(
 '10000000-0000-4000-8000-000000000021',
 (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
 '18:00','20:00','Site work required for the maintenance shift');
 PERFORM set_config('test.regular_a_ot_id',v->>'id',false);
 IF v->>'status'<>'Submitted' OR
  v->>'ownerId'<>'cloud:10000000-0000-4000-8000-000000000011' THEN
  RAISE EXCEPTION 'FAIL: employee submit receipt %',v;
 END IF;
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF jsonb_array_length(v->'rows')<>1 OR
    (v->'rows'->0->>'ownerId')<>'cloud:10000000-0000-4000-8000-000000000011' THEN
  RAISE EXCEPTION 'FAIL: employee own request not visible %',v;
 END IF;
 BEGIN
  PERFORM public.timetracker_ot_submit(
   '10000000-0000-4000-8000-000000000021',
   (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
   '18:00','20:00','Duplicate site work for the maintenance shift');
  RAISE EXCEPTION 'FAIL: duplicate unresolved OT request accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_submit(
   '10000000-0000-4000-8000-000000000021',
   (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
   '09:00','19:00','Oversized interval should not be accepted');
  RAISE EXCEPTION 'FAIL: invalid duration accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_snapshot('20000000-0000-4000-8000-000000000022');
  RAISE EXCEPTION 'FAIL: foreign board snapshot allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',
   (SELECT id FROM public.timetracker_ot_requests LIMIT 1),'Approved');
  RAISE EXCEPTION 'FAIL: ordinary employee may approve';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Employee B: must not see A's submission; submit independently.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000012',
 'session_id','10000000-0000-4000-8000-000000000032')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF jsonb_array_length(v->'rows')<>0 THEN
  RAISE EXCEPTION 'FAIL: employee B can read employee A OT %',v;
 END IF;
 v:=public.timetracker_ot_submit(
   '10000000-0000-4000-8000-000000000021',
   (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
   '19:00','21:00','Night shift inventory reconciliation work');
 PERFORM set_config('test.regular_b_ot_id',v->>'id',false);
 IF v->>'status'<>'Submitted' THEN RAISE EXCEPTION 'FAIL B submit'; END IF;
END $$;
RESET ROLE;

-- An ordinary platform manager must not get bootstrap team visibility.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000014',
 'session_id','10000000-0000-4000-8000-000000000034')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'bootstrapApprover'<>'false' OR jsonb_array_length(v->'rows')<>0 THEN
  RAISE EXCEPTION 'FAIL: ordinary manager elevated to bootstrap %',v;
 END IF;
 BEGIN
  PERFORM public.timetracker_ot_decide('10000000-0000-4000-8000-000000000021',
   '11111111-1111-4111-8111-111111111111','Approved');
  RAISE EXCEPTION 'FAIL: ordinary manager decision permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Bootstrap administrator: can review authorized team and approve A.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000013',
 'session_id','10000000-0000-4000-8000-000000000033')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;v_request uuid;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'AUTHORIZED_WORKSPACE_TEAM' OR v->>'bootstrapApprover'<>'true'
  OR jsonb_array_length(v->'rows')<>2 THEN
  RAISE EXCEPTION 'FAIL: bootstrap team scope %',v;
 END IF;
 SELECT (r->>'id')::uuid INTO v_request
 FROM jsonb_array_elements(v->'rows') AS r
 WHERE r->>'ownerId'='cloud:10000000-0000-4000-8000-000000000011';
 v:=public.timetracker_ot_decide(
  '10000000-0000-4000-8000-000000000021',v_request,'Approved');
 IF v->>'status'<>'Approved' OR
  v->>'decidedBy'<>'10000000-0000-4000-8000-000000000013' THEN
  RAISE EXCEPTION 'FAIL: bootstrap approve receipt %',v;
 END IF;
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',v_request,'Rejected');
  RAISE EXCEPTION 'FAIL: repeated decision allowed';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 SELECT (r->>'id')::uuid INTO v_request
 FROM jsonb_array_elements(v->'rows') AS r
 WHERE r->>'ownerId'='cloud:10000000-0000-4000-8000-000000000012';
 v:=public.timetracker_ot_decide(
  '10000000-0000-4000-8000-000000000021',v_request,'Rejected');
 IF v->>'status'<>'Rejected' THEN RAISE EXCEPTION 'FAIL: reject receipt %',v; END IF;
 v:=public.timetracker_ot_submit(
  '10000000-0000-4000-8000-000000000021',
  (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
  '18:00','20:00','Bootstrap personal overtime request not self-approved');
 PERFORM set_config('test.bootstrap_ot_id',v->>'id',false);
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',(v->>'id')::uuid,'Approved');
  RAISE EXCEPTION 'FAIL: bootstrap self approval allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- System Admins can create and review manual OT only; regular employee OT remains bootstrap-reviewed.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000018',
 'session_id','10000000-0000-4000-8000-000000000038')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;v_manual_a uuid;v_manual_b uuid;v_manual_self uuid;v_regular uuid;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'OWN_OT_ONLY' OR v->>'manualOtManager'<>'true' OR
    v->>'bootstrapApprover'<>'false' OR jsonb_array_length(v->'rows')<>0 THEN
  RAISE EXCEPTION 'FAIL: System Admin manual-only initial scope %',v;
 END IF;
 v_regular:=current_setting('test.bootstrap_ot_id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',v_regular,'Approved');
  RAISE EXCEPTION 'FAIL: System Admin approved regular employee OT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 v:=public.timetracker_ot_submit_manual(
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000011',
  current_date-365,'18:00','20:00','Manual historical overtime for a verified work assignment');
 IF v->>'status'<>'Submitted' OR v->>'submissionSource'<>'manual_admin' OR
    v->>'ownerId'<>'cloud:10000000-0000-4000-8000-000000000011' OR
    v->>'submittedBy'<>'10000000-0000-4000-8000-000000000018' THEN
  RAISE EXCEPTION 'FAIL: manual submission receipt %',v;
 END IF;
 v_manual_a:=(v->>'id')::uuid;
 PERFORM set_config('test.manual_a_ot_id',v_manual_a::text,false);
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'OWN_OT_ONLY' OR jsonb_array_length(v->'rows')<>1 OR
    v->'rows'->0->>'submissionSource'<>'manual_admin' OR
    v->'rows'->0->>'submittedBy'<>'10000000-0000-4000-8000-000000000018' THEN
  RAISE EXCEPTION 'FAIL: System Admin manual-only snapshot %',v;
 END IF;
 v:=public.timetracker_ot_decide(
  '10000000-0000-4000-8000-000000000021',v_manual_a,'Approved');
 IF v->>'status'<>'Approved' OR v->>'decidedBy'<>'10000000-0000-4000-8000-000000000018' THEN
  RAISE EXCEPTION 'FAIL: System Admin manual approval receipt %',v;
 END IF;
 -- An already approved interval cannot be entered again as a new manual request.
 BEGIN
  PERFORM public.timetracker_ot_submit_manual(
   '10000000-0000-4000-8000-000000000021',
   '10000000-0000-4000-8000-000000000011',
   current_date-365,'18:00','20:00','Duplicate manual historical overtime interval');
  RAISE EXCEPTION 'FAIL: duplicate approved manual OT accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 v:=public.timetracker_ot_submit_manual(
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000012',
  current_date-364,'19:00','21:00','Manual historical overtime for second employee');
 v_manual_b:=(v->>'id')::uuid;
 PERFORM set_config('test.manual_b_ot_id',v_manual_b::text,false);
 v:=public.timetracker_ot_decide(
  '10000000-0000-4000-8000-000000000021',v_manual_b,'Rejected');
 IF v->>'status'<>'Rejected' THEN RAISE EXCEPTION 'FAIL: System Admin manual rejection %',v; END IF;
 v:=public.timetracker_ot_submit_manual(
  '10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000018',
  current_date-363,'17:00','18:00','Manual historical overtime for System Admin employee record');
 v_manual_self:=(v->>'id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',v_manual_self,'Approved');
  RAISE EXCEPTION 'FAIL: System Admin approved own manual OT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_submit_manual(
   '10000000-0000-4000-8000-000000000021',
   '10000000-0000-4000-8000-000000000011',
   current_date+1,'18:00','20:00','Future manual overtime must not be accepted');
  RAISE EXCEPTION 'FAIL: future manual OT accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF jsonb_array_length(v->'rows')<>3 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(v->'rows') r
  WHERE r->>'submissionSource'<>'manual_admin') THEN
  RAISE EXCEPTION 'FAIL: System Admin saw regular OT or missed manual OT %',v;
 END IF;
END $$;
RESET ROLE;

-- Employees can display workspace manual OT records read-only, plus their own regular OT.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
 'session_id','10000000-0000-4000-8000-000000000031')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;v_manual uuid;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'OWN_OT_ONLY' OR jsonb_array_length(v->'rows')<>4 OR
    (SELECT count(*) FROM jsonb_array_elements(v->'rows') r
      WHERE r->>'submissionSource'='manual_admin')<>3 OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'rows') r
      WHERE r->>'ownerId'='cloud:10000000-0000-4000-8000-000000000012'
       AND r->>'submissionSource'='manual_admin') THEN
  RAISE EXCEPTION 'FAIL: employee manual OT read-only visibility %',v;
 END IF;
 v_manual:=current_setting('test.manual_a_ot_id')::uuid;
 BEGIN
  PERFORM public.timetracker_ot_submit_manual(
   '10000000-0000-4000-8000-000000000021',
   '10000000-0000-4000-8000-000000000012',
   current_date-362,'18:00','20:00','Employee manual OT submission is not enabled');
  RAISE EXCEPTION 'FAIL: employee created manual OT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',v_manual,'Rejected');
  RAISE EXCEPTION 'FAIL: employee modified manual OT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000012',
 'session_id','10000000-0000-4000-8000-000000000032')::text,false);
SET ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF jsonb_array_length(v->'rows')<>4 OR
  (SELECT count(*) FROM jsonb_array_elements(v->'rows') r
   WHERE r->>'submissionSource'='manual_admin')<>3 THEN
  RAISE EXCEPTION 'FAIL: employee B manual OT read-only visibility %',v;
 END IF;
END $$;
RESET ROLE;

-- A session can be revoked or expire while the access JWT still parses.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000016',
 'session_id','10000000-0000-4000-8000-000000000036')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: revoked session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
 'session_id','10000000-0000-4000-8000-000000000032')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: mismatched session identity accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
-- Expire a *disposable* session and confirm server-side denial.
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'
 WHERE id='10000000-0000-4000-8000-000000000031';
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
 'session_id','10000000-0000-4000-8000-000000000031')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: expired session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Foreign-workspace identity must not cross into this TimeTracker board.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','20000000-0000-4000-8000-000000000015',
 'session_id','20000000-0000-4000-8000-000000000035')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: foreign workspace user allowed on local board';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Inactive employee with a valid session must be denied.
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000017',
 'session_id','10000000-0000-4000-8000-000000000037')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: inactive employee session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- A current session is insufficient after the user's module grant is revoked.
UPDATE public.module_role_assignments SET enabled=false
 WHERE user_id='10000000-0000-4000-8000-000000000012'
 AND module_id='time-tracker';
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000012',
 'session_id','10000000-0000-4000-8000-000000000032')::text,false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FAIL: revoked TimeTracker module access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Audit changes must be blocked even for the migration executor.
DO $$
DECLARE v_count int;
BEGIN
 SELECT count(*) INTO v_count FROM public.timetracker_ot_audit;
 IF v_count<>10 THEN
  RAISE EXCEPTION 'FAIL: expected 10 audit events, got %',v_count;
 END IF;
 IF (SELECT count(*) FROM public.timetracker_ot_requests)<>6 THEN
  RAISE EXCEPTION 'FAIL: expected 6 OT requests';
 END IF;
 BEGIN
  DELETE FROM public.timetracker_ot_audit;
  RAISE EXCEPTION 'FAIL: immutable audit deletion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.timetracker_ot_audit SET details='{"tamper":true}'::jsonb;
  RAISE EXCEPTION 'FAIL: immutable audit update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
-- Manual history remains visible after the owner leaves the active workspace.
-- The same signed snapshot continues to require an active member for ordinary OT.
-- Roll back the synthetic membership change so later acceptance tests start clean.
BEGIN;
UPDATE public.workspace_members SET active=false
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
   AND user_id='10000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub','10000000-0000-4000-8000-000000000013',
 'session_id','10000000-0000-4000-8000-000000000033')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.timetracker_ot_snapshot('10000000-0000-4000-8000-000000000021');
 IF v->>'scope'<>'AUTHORIZED_WORKSPACE_TEAM' OR
    (SELECT count(*) FROM jsonb_array_elements(v->'rows') r
      WHERE r->>'submissionSource'='manual_admin')<>3 OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'rows') r
      WHERE r->>'ownerId'='cloud:10000000-0000-4000-8000-000000000011'
       AND r->>'submissionSource'='manual_admin') THEN
  RAISE EXCEPTION 'FAIL: manual OT history disappeared after owner membership ended %',v;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'rows') r
    WHERE r->>'ownerId'='cloud:10000000-0000-4000-8000-000000000011'
      AND r->>'submissionSource'='employee') THEN
  RAISE EXCEPTION 'FAIL: inactive owner regular OT escaped the active-member scope';
 END IF;
END $$;
ROLLBACK;

-- INSERT/UPDATE notifications are private, board-scoped and contain no OT data.
DO $$
DECLARE v_board uuid:='10000000-0000-4000-8000-000000000021';
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM realtime.messages m
  WHERE m.topic='board:'||v_board::text AND m.event='board-change'
    AND m.private=true AND m.payload->>'board_id'=v_board::text
    AND m.payload->>'entity'='board'
    AND m.payload->>'action'='OT_INSERT'
    AND m.payload ? 'occurred_at'
 ) THEN
  RAISE EXCEPTION 'FAIL: manual OT insert did not publish board invalidation';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM realtime.messages m
  WHERE m.topic='board:'||v_board::text AND m.event='board-change'
    AND m.private=true AND m.payload->>'board_id'=v_board::text
    AND m.payload->>'action'='OT_UPDATE'
 ) THEN
  RAISE EXCEPTION 'FAIL: OT decision did not publish board invalidation';
 END IF;
 IF EXISTS(
  SELECT 1 FROM realtime.messages m
  WHERE m.topic='board:'||v_board::text AND m.event='board-change'
    AND (m.payload ?| ARRAY['reason','owner_id','submitted_by','status','record','old_record'])
 ) THEN
  RAISE EXCEPTION 'FAIL: Realtime invalidation leaked OT record data';
 END IF;
END $$;

\echo 'CP-TT-MANUAL-OT-01 disposable acceptance PASS (role simulation, NOT genuine sessions)'
