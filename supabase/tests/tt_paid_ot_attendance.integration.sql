-- Disposable joint fixture only; run after the paid OT migration.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'apsyntra_tt_manual_hybrid_disposable' THEN
  RAISE EXCEPTION 'Disposable hybrid database required'; END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE WHEN public.is_platform_admin(p_user_id) THEN 'System Admin'
  WHEN p_user_id='21000000-0000-4000-8000-000000000003'::uuid THEN
   COALESCE(NULLIF(current_setting('app.tt_paid_test_role',true),''),'HR')
  ELSE 'Employee' END
$role$;

DO $test$
<<paid_case>>
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
 started timestamptz; base timestamptz; extended timestamptz;
 req uuid; record_id uuid; rev bigint; decision_at timestamptz;
 receipt jsonb; snap jsonb; actual jsonb; raw_in jsonb; raw_geo jsonb;
 ojt_before jsonb; ojt_after jsonb;
BEGIN
 INSERT INTO auth.sessions(id,user_id) VALUES(hr_session,hr);
 SELECT to_jsonb(j) INTO ojt_before FROM cron.job j WHERE jobname='tt-ojt-auto-clockout-9h';
 IF has_function_privilege('authenticated','private.tt_paid_ot_apply_decision(uuid,uuid,text,timestamptz,text,text)','EXECUTE')
  OR has_function_privilege('anon','public.timetracker_ot_edit_decision(uuid,uuid,text,timestamptz,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Paid OT private RPC exposed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM set_config('request.jwt.claim.session_id',admin_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin::text,'session_id',admin_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','System Admin',true);
 started:=((today-2)+TIME '08:00') AT TIME ZONE 'Asia/Manila';
 base:=private.tt_auto_clockout_threshold(started);
 extended:=private.tt_duration_ot_cutoff(started,base,120);
 SELECT revision INTO rev FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 receipt:=public.timetracker_attendance_admin_create_historical(board,emp,today-2,started,NULL,
  'standard','Office-Base Duty',NULL,'Paid OT historical fixture',rev,gen_random_uuid());
 record_id:=(receipt->>'recordId')::uuid;
 SELECT r INTO actual FROM public.module_state_entries e
 CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
 WHERE e.workspace_id=ws AND e.state_key='timetracker.attendance.v1' AND r->>'id'=record_id::text;
 raw_in:=actual->'clockIn';raw_geo:=actual#>'{clockOut,geo}';
 PERFORM set_config('request.jwt.claim.sub',hr::text,true);
 PERFORM set_config('request.jwt.claim.session_id',hr_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','HR',true);
 PERFORM set_config('app.tt_paid_test_role','IT Administrator',true);
 receipt:=public.timetracker_ot_submit_manual_duration(board,emp,today-2,120,'Delegated paid overtime test');
 req:=(receipt->>'id')::uuid;
 snap:=public.timetracker_ot_snapshot(board);
 IF snap->>'manualOtManager'<>'true' OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(snap->'rows') r WHERE r->>'id'=req::text
   AND r->>'canReviewOt'='false' AND r->>'submittedBy'=hr::text)
 THEN RAISE EXCEPTION 'IT delegated filing or review denial failed: %',snap; END IF;
 BEGIN
  PERFORM public.timetracker_ot_decide_manual_duration(board,req,'Approved');
  RAISE EXCEPTION 'IT unexpectedly approved OT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('app.tt_paid_test_role','HR',true);
 receipt:=public.timetracker_ot_decide_manual_duration(board,req,'Approved');
 IF receipt->>'attendanceSync'<>'completed_adjusted' THEN
  RAISE EXCEPTION 'Approval did not adjust completed attendance: %',receipt; END IF;
 SELECT r INTO actual FROM public.module_state_entries e
 CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
 WHERE e.workspace_id=ws AND e.state_key='timetracker.attendance.v1' AND r->>'id'=record_id::text;
 IF (actual#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM extended
  OR (actual->>'creditedMsOverride')::bigint IS DISTINCT FROM 39600000
  OR actual->'clockIn' IS DISTINCT FROM raw_in OR actual#>'{clockOut,geo}' IS DISTINCT FROM raw_geo
 THEN RAISE EXCEPTION 'Expected 11 credited hours, updated clock-out, original clock-in and GPS: %',actual; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_attendance_board_projection p WHERE p.board_id=board
  AND p.record_id=paid_case.record_id AND p.clock_out_at=extended)
 THEN RAISE EXCEPTION 'Approved clock-out projection not synchronized'; END IF;
 SELECT decided_at INTO decision_at FROM public.timetracker_ot_requests WHERE id=req;
 PERFORM public.timetracker_ot_edit_decision(board,req,'Approved',decision_at,'Rejected');
 SELECT r INTO actual FROM public.module_state_entries e
 CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
 WHERE e.workspace_id=ws AND e.state_key='timetracker.attendance.v1' AND r->>'id'=record_id::text;
 IF (actual#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM base
  OR (actual->>'creditedMsOverride')::bigint IS DISTINCT FROM 32400000
 THEN RAISE EXCEPTION 'Rejection failed to restore nine hours and clock-out: %',actual; END IF;
 BEGIN
  PERFORM public.timetracker_ot_edit_decision(board,req,'Approved',decision_at,'Rejected');
  RAISE EXCEPTION 'Stale decision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 SELECT decided_at INTO decision_at FROM public.timetracker_ot_requests WHERE id=req;
 PERFORM public.timetracker_ot_edit_decision(board,req,'Rejected',decision_at,'Approved');
 SELECT decided_at INTO decision_at FROM public.timetracker_ot_requests WHERE id=req;
 PERFORM public.timetracker_ot_edit_decision(board,req,'Approved',decision_at,'Withdrawn');
 SELECT r INTO actual FROM public.module_state_entries e
 CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
 WHERE e.workspace_id=ws AND e.state_key='timetracker.attendance.v1' AND r->>'id'=record_id::text;
 IF (actual#>>'{clockOut,timestamp}')::timestamptz IS DISTINCT FROM base
  OR (actual->>'creditedMsOverride')::bigint IS DISTINCT FROM 32400000
  OR (SELECT status FROM public.timetracker_ot_requests WHERE id=req)<>'Withdrawn'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.timetracker_ot_snapshot(board)->'rows') r
    WHERE r->>'id'=req::text)
 THEN RAISE EXCEPTION 'Removal failed to restore the standard shift and hide request'; END IF;
 IF (SELECT count(*) FROM private.tt_attendance_admin_audit a WHERE a.workspace_id=ws
  AND a.record_ids @> ARRAY[record_id::text] AND a.reason LIKE 'OT entitlement correction:%')<>4
 THEN RAISE EXCEPTION 'Missing immutable attendance corrections'; END IF;
 -- Current-day delegated approval must set the scheduler deadline without
 -- closing a live clock or changing its original clock-in.
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM set_config('request.jwt.claim.session_id',admin_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin::text,'session_id',admin_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','System Admin',true);
 PERFORM private.tt_activate_isolated_auto_clockout(today,0);
 started:=date_trunc('milliseconds',GREATEST(today::timestamp AT TIME ZONE 'Asia/Manila',clock_timestamp()-INTERVAL '20 minutes'));
 base:=private.tt_auto_clockout_threshold(started);
 extended:=private.tt_duration_ot_cutoff(started,base,120);
 SELECT revision INTO rev FROM public.module_state_entries
 WHERE workspace_id=ws AND module_id='time-tracker' AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 receipt:=public.timetracker_attendance_admin_create(board,emp,started,'Office-Base Duty',NULL,'Paid OT live fixture',rev);
 record_id:=(receipt->>'recordId')::uuid;
 PERFORM private.tt_reconcile_auto_clockout_sessions();
 PERFORM set_config('request.jwt.claim.sub',hr::text,true);
 PERFORM set_config('request.jwt.claim.session_id',hr_session::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',hr::text,'session_id',hr_session::text,'role','authenticated')::text,true);
 PERFORM set_config('app.tt_admin_test_role','HR',true);
 receipt:=public.timetracker_ot_submit_manual_duration(board,emp,today,120,'Delegated current day overtime test');
 req:=(receipt->>'id')::uuid;
 receipt:=public.timetracker_ot_decide_manual_duration(board,req,'Approved');
 IF receipt->>'attendanceSync'<>'active_deadline' OR NOT EXISTS(
  SELECT 1 FROM private.tt_auto_clockout_sessions q WHERE q.board_id=board
   AND q.record_id=paid_case.record_id AND q.overtime_cutoff_at=extended AND q.status='MONITORING')
 THEN RAISE EXCEPTION 'Active delegated OT did not update deadline: %',receipt; END IF;
 SELECT decided_at INTO decision_at FROM public.timetracker_ot_requests WHERE id=req;
 PERFORM public.timetracker_ot_edit_decision(board,req,'Approved',decision_at,'Rejected');
 IF EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions q WHERE q.board_id=board
   AND q.record_id=paid_case.record_id AND q.overtime_cutoff_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Revocation left an extended deadline'; END IF;
 SELECT r INTO actual FROM public.module_state_entries e
 CROSS JOIN LATERAL jsonb_array_elements(e.value::jsonb->'records') r
 WHERE e.workspace_id=ws AND e.state_key='timetracker.attendance.v1' AND r->>'id'=record_id::text;
 IF actual->'clockOut' IS DISTINCT FROM 'null'::jsonb
  OR private.tt_paid_ot_worker_minutes(ws,emp,record_id,started,
   (SELECT e.value::jsonb FROM public.module_state_entries e WHERE e.workspace_id=ws
    AND e.module_id='time-tracker' AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*'))<>0
 THEN RAISE EXCEPTION 'Active session prematurely closed or revoked worker entitlement remained'; END IF;
 SELECT to_jsonb(j) INTO ojt_after FROM cron.job j WHERE jobname='tt-ojt-auto-clockout-9h';
 IF ojt_before IS DISTINCT FROM ojt_after THEN RAISE EXCEPTION 'OJT schedule changed'; END IF;
 RAISE NOTICE 'PASS: delegated filing, IT denial, HR approval, 11h clock-out, rejection, reapproval, removal, exact projection and audit';
END;
$test$;
ROLLBACK;
