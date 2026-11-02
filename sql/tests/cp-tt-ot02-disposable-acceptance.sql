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
 SELECT id INTO v_request FROM public.timetracker_ot_requests
  WHERE owner_id='10000000-0000-4000-8000-000000000011';
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
 SELECT id INTO v_request FROM public.timetracker_ot_requests
  WHERE owner_id='10000000-0000-4000-8000-000000000012';
 v:=public.timetracker_ot_decide(
  '10000000-0000-4000-8000-000000000021',v_request,'Rejected');
 IF v->>'status'<>'Rejected' THEN RAISE EXCEPTION 'FAIL: reject receipt %',v; END IF;
 v:=public.timetracker_ot_submit(
  '10000000-0000-4000-8000-000000000021',
  (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,
  '18:00','20:00','Bootstrap personal overtime request not self-approved');
 BEGIN
  PERFORM public.timetracker_ot_decide(
   '10000000-0000-4000-8000-000000000021',(v->>'id')::uuid,'Approved');
  RAISE EXCEPTION 'FAIL: bootstrap self approval allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
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

-- Audit changes must be blocked even for the migration executor.
DO $$
DECLARE v_count int;
BEGIN
 SELECT count(*) INTO v_count FROM public.timetracker_ot_audit;
 IF v_count<>5 THEN
  RAISE EXCEPTION 'FAIL: expected 5 audit events, got %',v_count;
 END IF;
 IF (SELECT count(*) FROM public.timetracker_ot_requests)<>3 THEN
  RAISE EXCEPTION 'FAIL: expected 3 OT requests';
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
\echo 'CP-TT-OT-02 disposable acceptance PASS (signed role simulation, NOT genuine sessions)'
