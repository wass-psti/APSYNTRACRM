-- DISPOSABLE DATABASE ONLY. Requires the incident migrations, reactivation migration,
-- and active-only manual clock-in scheduler gate; canonical board and an eligible open fixture.
-- Set apsyntra.test_disposable=on in the test connection before running this file.
-- Roll back both activation and all test mutations; do not point at production.
BEGIN;
SET LOCAL lock_timeout='3s';

DO $test$
DECLARE
 v_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 v_count integer; v_workspace uuid; v_result jsonb; v_before text;
 v_ojt jsonb; v_after text;
 v_board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
BEGIN
 IF current_setting('apsyntra.test_disposable',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable database assertion required';
 END IF;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
  OR private.tt_admin_manual_clockin_ready() THEN
  RAISE EXCEPTION 'Suspended scheduler must block admin manual clock-in';
 END IF;
 IF has_function_privilege('authenticated','private.tt_activate_isolated_auto_clockout(date,integer)','EXECUTE')
  OR has_function_privilege('anon','private.tt_suspend_isolated_auto_clockout()','EXECUTE') THEN
  RAISE EXCEPTION 'Operator controls must not be executable by app roles';
 END IF;

 SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) INTO v_ojt FROM cron.job j
 WHERE jobname='tt-ojt-auto-clockout-9h';
 SELECT workspace_id INTO v_workspace FROM public.work_boards WHERE id=v_board;
 SELECT value INTO v_before FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 SELECT count(*) INTO v_count
 FROM jsonb_array_elements(v_before::jsonb->'records') x(elem)
 JOIN public.profiles p ON x.elem->>'ownerId'='cloud:'||p.id::text
 WHERE (x.elem->'clockOut' IS NULL OR x.elem->'clockOut'='null'::jsonb)
 AND private.tt_auto_clockout_employee_eligible(v_workspace,v_board,p.id);
 IF v_count<1 THEN RAISE EXCEPTION 'At least one same-day eligible open fixture required'; END IF;

 -- An inconsistent cutoff alone must not make either scheduler or admin ready.
 UPDATE private.tt_auto_clockout_config SET activated_at=v_day::timestamp AT TIME ZONE 'Asia/Manila'
 WHERE config_key='default';
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'invalid' OR private.tt_admin_manual_clockin_ready() THEN
  RAISE EXCEPTION 'Inconsistent mode failed open';
 END IF;
 IF private.tt_process_auto_clockouts()->>'suspended' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Worker must refuse inconsistent state';
 END IF;
 UPDATE private.tt_auto_clockout_config SET activated_at='infinity'::timestamptz WHERE config_key='default';

 BEGIN
  PERFORM private.tt_activate_isolated_auto_clockout(v_day,v_count+1);
  RAISE EXCEPTION 'Stale count unexpectedly accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended' THEN
  RAISE EXCEPTION 'Rejected activation must leave scheduler suspended';
 END IF;

 v_result:=private.tt_activate_isolated_auto_clockout(v_day,v_count);
 IF v_result->>'mode' IS DISTINCT FROM 'active'
  OR private.tt_auto_clockout_mode() IS DISTINCT FROM 'active'
  OR NOT private.tt_admin_manual_clockin_ready() THEN
  RAISE EXCEPTION 'Active isolated mode or admin readiness failed: %',v_result;
 END IF;
 SELECT value INTO v_after FROM public.module_state_entries
 WHERE workspace_id=v_workspace AND module_id='time-tracker'
 AND state_key='timetracker.attendance.v1' AND scope='shared' AND owner_key='*';
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Enrollment changed attendance'; END IF;

 v_result:=private.tt_suspend_isolated_auto_clockout();
 IF v_result->>'mode' IS DISTINCT FROM 'suspended' OR private.tt_admin_manual_clockin_ready() THEN
  RAISE EXCEPTION 'Suspension did not disable admin manual clock-in';
 END IF;
 IF v_ojt IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) FROM cron.job j
 WHERE jobname='tt-ojt-auto-clockout-9h') THEN
  RAISE EXCEPTION 'OJT job modified';
 END IF;
 RAISE NOTICE 'PASS: readiness, stale-count rejection, enrollment, suspension and OJT invariance';
END;
$test$;
ROLLBACK;
