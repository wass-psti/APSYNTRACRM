-- Disposable only. Apply sql/cp-tt-duration-overtime-staged.sql in a test
-- database with the current main migrations first. Never point at production.
BEGIN;
DO $test$
DECLARE
 v_owner constant uuid:='00000000-0000-4000-8000-000000000001';
 v_other constant uuid:='00000000-0000-4000-8000-000000000002';
 v_state jsonb;
 v_count integer;
 v_start timestamptz;
 v_base timestamptz;
 v_end timestamptz;
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable database required'; END IF;
 IF has_function_privilege('anon','public.timetracker_ot_submit_duration(uuid,date,integer,text)','EXECUTE')
  OR has_function_privilege('anon','public.timetracker_ot_decide_duration(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','private.tt_duration_ot_worker_minutes(uuid,uuid,uuid,timestamptz,timestamptz,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.timetracker_ot_submit(uuid,date,time,time,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_submit_duration(uuid,date,integer,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.timetracker_ot_decide_duration(uuid,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Duration OT ACL failed'; END IF;
 -- 8 AM PHT + regular paid 9 hours + unpaid lunch + 3 paid OT hours.
 v_start:='2026-11-26T00:00:00Z';
 v_base:=private.tt_auto_clockout_threshold(v_start);
 v_end:=private.tt_duration_ot_cutoff(v_start,v_base,180);
 IF v_base IS DISTINCT FROM '2026-11-26T10:00:00Z'::timestamptz
  OR v_end IS DISTINCT FROM '2026-11-26T13:00:00Z'::timestamptz
  OR private.tt_attendance_credited_ms(v_start,v_end)<>43200000
  OR private.tt_duration_ot_cutoff(v_start,v_base,0) IS DISTINCT FROM v_base
 THEN RAISE EXCEPTION 'Regular/extended cutoff mismatch'; END IF;
 -- 2 AM PHT: regular cutoff 11 AM; OT crosses unpaid noon lunch.
 v_start:='2026-11-25T18:00:00Z';
 v_base:=private.tt_auto_clockout_threshold(v_start);
 v_end:=private.tt_duration_ot_cutoff(v_start,v_base,180);
 IF v_base IS DISTINCT FROM '2026-11-26T03:00:00Z'::timestamptz
  OR v_end IS DISTINCT FROM '2026-11-26T07:00:00Z'::timestamptz
  OR private.tt_attendance_credited_ms(v_start,v_end)<>43200000
 THEN RAISE EXCEPTION 'Additional unpaid break calculation mismatch'; END IF;
 v_state:=jsonb_build_object('records',jsonb_build_array(
  jsonb_build_object('id','one','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-25T18:00:00Z'),'clockOut',NULL),
  jsonb_build_object('id','two','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-26T02:00:00Z'),
    'clockOut',jsonb_build_object('timestamp','2026-11-26T03:00:00Z')),
  jsonb_build_object('id','three','ownerId','cloud:'||v_other::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-25T18:00:00Z'),'clockOut',NULL),
  jsonb_build_object('id','four','ownerId','cloud:'||v_owner::text,
    'clockIn',jsonb_build_object('timestamp','2026-11-27T02:00:00Z'),'clockOut',NULL)));
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_owner,'2026-11-26');
 IF v_count<>2 THEN RAISE EXCEPTION 'PHT owner/date matching or ambiguity detection failed'; END IF;
 SELECT count(*) INTO v_count FROM private.tt_duration_ot_matching_records(v_state,v_other,'2026-11-26');
 IF v_count<>1 THEN RAISE EXCEPTION 'Employee isolation failed'; END IF;
 RAISE NOTICE 'PASS: exact credited cutoffs, PHT date matching, ambiguity counting and RPC grants';
END;
$test$;
ROLLBACK;
