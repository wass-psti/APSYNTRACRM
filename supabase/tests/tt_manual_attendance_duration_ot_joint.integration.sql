-- Rollback-only integration on the full TimeTracker attendance fixture chain.
-- Both new migration sets must already be applied. Never execute on production.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database() <> 'apsyntra_tt_manual_hybrid_disposable' THEN
  RAISE EXCEPTION 'Disposable hybrid database required'; END IF;
END;
$guard$;
-- The base hybrid fixture provides a deterministic workspace role adapter.
-- Add one HR identity for this transaction without replacing the real scoped
-- private.tt_role_in_workspace function or weakening signed scope checks.
CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE WHEN public.is_platform_admin(p_user_id) THEN 'System Admin'
  WHEN p_user_id='21000000-0000-4000-8000-000000000003'::uuid THEN 'HR'
  ELSE 'Employee' END
$role$;
DO $joint$
<<joint_case>>
DECLARE
 ws constant uuid:='10000000-0000-4000-8000-000000000001';
 board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 admin constant uuid:='20000000-0000-4000-8000-000000000001';
 emp constant uuid:='21000000-0000-4000-8000-000000000001';
 hr constant uuid:='21000000-0000-4000-8000-000000000003';
 admin_session constant uuid:='22000000-0000-4000-8000-000000000002';
 emp_session constant uuid:='22000000-0000-4000-8000-000000000001';
 hr_session uuid:=gen_random_uuid();
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 started timestamptz; cutoff timestamptz; ended timestamptz;
 req uuid; record_id uuid; hist_id uuid; rev bigint;
 receipt jsonb; state jsonb; active_before jsonb; active_after jsonb;
 queue_before jsonb; queue_after jsonb; hist jsonb; credit jsonb;
 ojt_before jsonb; ojt_after jsonb; result jsonb;
BEGIN
 INSERT INTO auth.sessions(id,user_id) VALUES(hr_session,hr);
 IF private.tt_role_in_workspace(hr,ws) IS DISTINCT FROM 'HR'
  OR private.tt_role_in_workspace(emp,ws) IS DISTINCT FROM 'Employee'
 THEN RAISE EXCEPTION 'Fixture scoped roles unavailable'; END IF;
 SELECT to_jsonb(j) INTO ojt_before FROM cron.job j WHERE jobname='tt-ojt-auto-clockout-9h';
 PERFORM private.tt_activate_isolated_auto_clockout(today,0);
 started:=date_trunc('milliseconds',GREATEST(today::timestamp AT TIME ZONE 'Asia/Manila',clock_timestamp()-INTERVAL '20 minutes'));
 cutoff:=private.tt_duration_ot_cutoff(started,private.tt_auto_clockout_threshold(started),180);
 -- A genuine signed-scope RPC path (session table and JWT claims are disposable fixtures).
 PERFORM set_config('request.jwt.claim.sub',emp::text,true);
 PERFORM set_config('request.jwt.claim.session_id',emp_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',emp::text,'session_id',emp_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','Employee',true);
 receipt:=public.timetracker_ot_submit_duration(board,today,180,'Pre-filed overtime for joint acceptance');
 req:=(receipt->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',hr::text,true);
 PERFORM set_config('request.jwt.claim.session_id',hr_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','HR',true);
 receipt:=public.timetracker_ot_decide_duration(board,req,'Approved');
 IF receipt->>'status' IS DISTINCT FROM 'Approved' OR receipt->>'attendanceRecordId' IS NOT NULL
 THEN RAISE EXCEPTION 'Pre-filing approval did not remain unbound: %',receipt; END IF;
 -- The real #914 active manual creation RPC owns the canonical attendance write.
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM set_config('request.jwt.claim.session_id',admin_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin::text,'session_id',admin_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','System Admin',true);
 SELECT revision INTO rev FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 receipt:=public.timetracker_attendance_admin_create(board,emp,started,'Office-Base Duty',NULL,'Joint test missed clock-in',rev);
 record_id:=(receipt->>'recordId')::uuid;
 IF record_id IS NULL OR receipt->>'mode' IS DISTINCT FROM 'COMMITTED'
 THEN RAISE EXCEPTION 'Active manual clock-in failed: %',receipt; END IF;
 PERFORM private.tt_reconcile_auto_clockout_sessions();
 result:=private.tt_process_auto_clockouts();
 IF result->>'failed' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'Combined worker failed: %',result; END IF;
 SELECT to_jsonb(q) INTO queue_before FROM private.tt_auto_clockout_sessions q WHERE q.board_id=board AND q.record_id=joint_case.record_id;
 IF queue_before->>'status' IS DISTINCT FROM 'MONITORING'
  OR (queue_before->>'overtime_cutoff_at')::timestamptz IS DISTINCT FROM cutoff
  OR NOT EXISTS(SELECT 1 FROM public.timetracker_ot_requests r WHERE r.id=req AND r.attendance_record_id=joint_case.record_id)
 THEN RAISE EXCEPTION 'Pre-approved OT was not bound/extended: %',queue_before; END IF;
 SELECT value::jsonb,revision INTO state,rev FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 SELECT r INTO active_before FROM jsonb_array_elements(state->'records') r WHERE r->>'id'=record_id::text;
 IF active_before->'clockOut' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Employee Clock was not active'; END IF;
 -- Real historical correction for the SAME employee, while the live OT is active.
 receipt:=public.timetracker_attendance_admin_create_historical(board,emp,today-3,
  ((today-3)+TIME '08:00') AT TIME ZONE 'Asia/Manila',NULL,'standard','Office-Base Duty',NULL,
  'Joint historical correction',rev,gen_random_uuid());
 hist_id:=(receipt->>'recordId')::uuid;
 SELECT value::jsonb,revision INTO state,rev FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 SELECT r INTO active_after FROM jsonb_array_elements(state->'records') r WHERE r->>'id'=record_id::text;
 SELECT r INTO hist FROM jsonb_array_elements(state->'records') r WHERE r->>'id'=hist_id::text;
 SELECT to_jsonb(q) INTO queue_after FROM private.tt_auto_clockout_sessions q WHERE q.board_id=board AND q.record_id=joint_case.record_id;
 IF active_after IS DISTINCT FROM active_before OR queue_after IS DISTINCT FROM queue_before
  OR hist#>>'{clockOut,manualMethod}' IS DISTINCT FROM 'standard_nine_credited_hours'
  OR EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions q WHERE q.record_id=hist_id)
 THEN RAISE EXCEPTION 'Historical correction modified active OT or scheduler'; END IF;
 -- Close early through the actual administrator clock-out RPC: no unworked OT is payable.
 PERFORM pg_sleep(0.01);
 ended:=date_trunc('milliseconds',clock_timestamp());
 receipt:=public.timetracker_attendance_admin_clock_out(board,record_id,ended,'Joint test early actual clock-out',rev);
 SELECT value::jsonb INTO state FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 SELECT private.tt_duration_ot_completed_credit(state,emp,today,r.attendance_record_id,r.attendance_clock_in_at,
   r.duration_minutes,r.decided_at) INTO credit FROM public.timetracker_ot_requests r WHERE r.id=req;
 IF credit->>'actualMinutes' IS DISTINCT FROM '0' OR credit->>'payableMinutes' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'Unworked OT incorrectly payable: %',credit; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p WHERE p.board_id=board AND p.record_id=joint_case.record_id AND p.clock_out_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Early completed manual attendance projection missing'; END IF;
 SELECT to_jsonb(j) INTO ojt_after FROM cron.job j WHERE jobname='tt-ojt-auto-clockout-9h';
 IF ojt_after IS DISTINCT FROM ojt_before THEN RAISE EXCEPTION 'OJT scheduler changed'; END IF;
 RAISE NOTICE 'PASS: actual manual create + HR preapproval + reconciler + OT worker + historical isolation + early closure + payable credit + board projection + OJT';
END;
$joint$;
ROLLBACK;
