-- DISPOSABLE DATABASE ONLY. Existing isolated TimeTracker synthetic fixture;
-- run as supabase_admin with apsyntra.test_disposable=on and cron disabled.
-- The request context below simulates signed PostgREST role/claims, not HTTP JWT.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $setup$
DECLARE
 w constant uuid:='00000000-0000-4000-8000-000000000102';
 e constant uuid:='00000000-0000-4000-8000-000000000101';
 a constant uuid:='00000000-0000-4000-8000-000000000104';
 b constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on'
 OR current_setting('cron.launch_active_jobs',true) IS DISTINCT FROM 'off'
 OR private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
 OR (SELECT count(*) FROM public.profiles)<>1
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=e AND email='tt-test-employee@example.invalid')
 OR NOT private.tt_auto_clockout_employee_eligible(w,b,e)
 OR EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions)
 THEN RAISE EXCEPTION 'Expected isolated synthetic baseline'; END IF;
 INSERT INTO auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at)
 VALUES(a,'tt-test-admin@example.invalid','authenticated','authenticated',now(),now(),now());
 INSERT INTO public.profiles(id,email,platform_role,status)
 VALUES(a,'tt-test-admin@example.invalid','employee','active')
 ON CONFLICT(id) DO UPDATE SET status='active';
 INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES(w,a,true);
 INSERT INTO public.apsyntra_workspace_module_roles(workspace_id,user_id,module_id,role,enabled)
 VALUES(w,a,'time-tracker','System Admin',true);
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after)
 VALUES('00000000-0000-4000-8000-000000000105',e,now(),now(),now()+interval '1 hour'),
 ('00000000-0000-4000-8000-000000000106',a,now(),now(),now()+interval '1 hour');
 INSERT INTO private.tt_department_catalog(workspace_id,name,created_by,changed_by)
 VALUES(w,'Engineering',a,a);
 INSERT INTO private.tt_employee_departments(workspace_id,user_id,department,changed_by)
 VALUES(w,e,'Engineering',a);
 UPDATE public.work_boards SET description='[APSYNTRA:MODULE:timetracker:v1]' WHERE id=b;
 UPDATE public.module_state_entries
 SET value='{"version":1,"records":[],"selection":{"location":"","department":""}}',revision=1
 WHERE workspace_id=w AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
 AND scope='shared' AND owner_key='*';
 IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic state missing'; END IF;
END;
$setup$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000104';
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000104","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000106"}';
DO $admin$
DECLARE
 b constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 e constant uuid:='00000000-0000-4000-8000-000000000101';
 yesterday date:=(now() AT TIME ZONE 'Asia/Manila')::date-1;
 start_at timestamptz:=(yesterday+time '08:00') AT TIME ZONE 'Asia/Manila';
 end_at timestamptz:=(yesterday+time '18:00') AT TIME ZONE 'Asia/Manila';
 r jsonb;
BEGIN
 r:=public.timetracker_attendance_admin_create_capability(b);
 IF r->>'completedReady' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Completed capability not ready'; END IF;
 r:=public.timetracker_attendance_admin_create_completed(b,e,start_at,end_at,
 'Office-Base Duty',NULL,'Synthetic past attendance',1);
 IF r->>'mode' IS DISTINCT FROM 'COMMITTED' OR r->>'contract' IS DISTINCT FROM 'tt-admin-completed-1'
 OR r->>'revision' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Completed receipt invalid: %',r; END IF;
 PERFORM set_config('apsyntra.test_completed_id',r->>'recordId',true);
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_completed(b,e,start_at+interval '1 hour',end_at,
  'Office-Base Duty',NULL,'Overlap must fail',2);
  RAISE EXCEPTION 'Overlapping completed attendance accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_completed(b,e,end_at,start_at,
  'Office-Base Duty',NULL,'Reversed times must fail',2);
  RAISE EXCEPTION 'Reversed times accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_completed(b,e,start_at-interval '2 days',end_at-interval '2 days',
  'Offsite (Home)',NULL,'Missing Work Plan must fail',2);
  RAISE EXCEPTION 'Missing Work Plan accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 r:=public.timetracker_attendance_admin_create(b,e,date_trunc('milliseconds',clock_timestamp()),
  'Offsite (Home)','Synthetic employee Work Plan','Synthetic active entry',2);
 IF r->>'mode' IS DISTINCT FROM 'COMMITTED' OR r->>'revision' IS DISTINCT FROM '3'
 THEN RAISE EXCEPTION 'Active receipt invalid: %',r; END IF;
 PERFORM set_config('apsyntra.test_active_id',r->>'recordId',true);
 RAISE NOTICE 'PASS: completed historical entry, overlap/reversed/missing-note rejection and existing active entry';
END;
$admin$;
RESET ROLE;
DO $verify$
DECLARE
 w constant uuid:='00000000-0000-4000-8000-000000000102';
 b constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 completed_id uuid:=current_setting('apsyntra.test_completed_id')::uuid;
 active_id uuid:=current_setting('apsyntra.test_active_id')::uuid;
 s jsonb; r jsonb; a jsonb;
BEGIN
 SELECT value::jsonb INTO s FROM public.module_state_entries
 WHERE workspace_id=w AND module_id='time-tracker' AND state_key='timetracker.attendance.v1'
 AND scope='shared' AND owner_key='*';
 SELECT elem INTO r FROM jsonb_array_elements(s->'records') elem WHERE elem->>'id'=completed_id::text;
 SELECT elem INTO a FROM jsonb_array_elements(s->'records') elem WHERE elem->>'id'=active_id::text;
 IF jsonb_array_length(s->'records')<>2
 OR r#>>'{clockIn,geo,status}' IS DISTINCT FROM 'not_captured'
 OR r#>>'{clockOut,geo,status}' IS DISTINCT FROM 'not_captured'
 OR r#>>'{clockOut,reason}' IS DISTINCT FROM 'admin_manual_clock_out'
 OR a#>>'{clockIn,workNote}' IS DISTINCT FROM 'Synthetic employee Work Plan'
 OR a->'clockOut' IS DISTINCT FROM 'null'::jsonb
 OR NOT EXISTS (SELECT 1 FROM private.tt_attendance_board_projection p
 JOIN public.work_board_items i ON i.id=p.board_item_id
 WHERE p.record_id=completed_id AND p.board_id=b AND p.source_revision=2
 AND p.credited_ms=32400000 AND i.status='done'
 AND p.clock_in_geo=r#>'{clockIn,geo}' AND p.clock_out_geo=r#>'{clockOut,geo}')
 OR NOT EXISTS (SELECT 1 FROM private.tt_attendance_admin_audit
 WHERE board_id=b AND record_ids=ARRAY[completed_id::text] AND action='create'
 AND before_records='[]'::jsonb AND after_records->0=r AND committed_revision=2)
 OR EXISTS(SELECT 1 FROM private.tt_auto_clockout_sessions WHERE record_id=completed_id)
 THEN RAISE EXCEPTION 'Canonical, work note, projection, audit or scheduler verification failed'; END IF;
 RAISE NOTICE 'PASS: atomic completed record, 9 credited hours, evidence, audit and active Work Plan';
END;
$verify$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000105"}';
DO $employee$
DECLARE
 b constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 e constant uuid:='00000000-0000-4000-8000-000000000101';
 g jsonb; r jsonb;
BEGIN
 BEGIN
  PERFORM public.timetracker_attendance_admin_create_completed(b,e,now()-interval '3 days',now()-interval '2 days',
  'Office-Base Duty',NULL,'Unauthorized request',3);
  RAISE EXCEPTION 'Employee acquired admin create permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 g:=jsonb_build_object('status','captured','source','browser-geolocation','latitude',0,'longitude',0,'accuracy',10,
 'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 PERFORM pg_sleep(0.1);
 r:=public.timetracker_attendance_commit_v2(b,'clock-out',current_setting('apsyntra.test_active_id'),
  'Offsite (Home)','Engineering',g,'Synthetic employee Work Plan');
 IF r->>'mode' IS DISTINCT FROM 'COMMITTED' OR r->>'revision' IS DISTINCT FROM '4'
 THEN RAISE EXCEPTION 'Normal employee clock-out failed: %',r; END IF;
 r:=public.timetracker_attendance_commit_v2(b,'clock-in',NULL,'Office-Base Duty','Engineering',g,NULL);
 IF r->>'mode' IS DISTINCT FROM 'COMMITTED' OR r->>'revision' IS DISTINCT FROM '5'
 THEN RAISE EXCEPTION 'Normal employee clock-in failed: %',r; END IF;
 RAISE NOTICE 'PASS: unauthorized create denied; regular clock-out and next clock-in still work';
END;
$employee$;
RESET ROLE;
ROLLBACK;
SELECT private.tt_auto_clockout_mode() AS final_mode;
