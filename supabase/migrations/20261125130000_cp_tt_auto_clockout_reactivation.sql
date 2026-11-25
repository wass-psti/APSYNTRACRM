-- CP-TT-AUTO-CLOCKOUT-REACTIVATION: forward-only; deploy suspended.
-- Preserve the isolated worker, signed workspace scope and OJT scheduler.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE FUNCTION private.tt_auto_clockout_mode()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $mode$
 WITH jobs AS (
  SELECT count(*) AS n,
   COALESCE(bool_and(active),false) AS all_active,
   COALESCE(bool_and(NOT active),false) AS all_inactive,
   COALESCE(bool_and(
    schedule='30 seconds' AND database=pg_catalog.current_database()
    AND pg_catalog.btrim(command)=CASE jobname
     WHEN 'tt-auto-clockout-processor' THEN 'SELECT private.tt_process_auto_clockouts();'
     WHEN 'tt-auto-clockout-reconcile' THEN 'SELECT private.tt_reconcile_auto_clockout_sessions();'
    END),false) AS expected_jobs,
   count(DISTINCT username) AS owners
  FROM cron.job WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile')
 ), retired AS (
  SELECT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.module_state_entries'::pg_catalog.regclass
    AND t.tgname='tt_auto_clockout_sync' AND t.tgenabled='D'
    AND t.tgfoid='private.tt_auto_clockout_sync()'::pg_catalog.regprocedure
    AND pg_catalog.upper(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]','','g'))='BEGINRETURNNEW;END;'
  ) AS ok
 )
 SELECT COALESCE((
  SELECT CASE
   WHEN NOT retired.ok OR jobs.n<>2 OR NOT jobs.expected_jobs OR jobs.owners<>1 THEN 'invalid'
   WHEN c.activated_at='infinity'::timestamptz AND jobs.all_inactive THEN 'suspended'
   WHEN pg_catalog.isfinite(c.activated_at) AND c.activated_at<=pg_catalog.statement_timestamp()
    AND jobs.all_active THEN 'active'
   ELSE 'invalid'
  END
  FROM jobs CROSS JOIN retired
  CROSS JOIN private.tt_auto_clockout_config c WHERE c.config_key='default'
 ),'invalid');
$mode$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_mode() FROM PUBLIC,anon,authenticated,service_role;

DO $gate$
DECLARE d text;
BEGIN
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended' THEN
  RAISE EXCEPTION 'Deploy only with both isolated jobs suspended, infinity cutoff and retired trigger' USING ERRCODE='55000';
 END IF;
 d:=pg_catalog.pg_get_functiondef('private.tt_admin_manual_clockin_ready()'::regprocedure);
 IF pg_catalog.strpos(d,'tt_auto_clockout_sync')=0 OR pg_catalog.strpos(d,'tt-auto-clockout-processor')=0
  OR pg_catalog.strpos(d,'AND active')=0 THEN
  RAISE EXCEPTION 'Manual clock-in readiness baseline differs' USING ERRCODE='55000';
 END IF;
END;
$gate$;

CREATE OR REPLACE FUNCTION private.tt_admin_manual_clockin_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $ready$
 SELECT private.tt_auto_clockout_mode() IN ('suspended','active');
$ready$;
REVOKE ALL ON FUNCTION private.tt_admin_manual_clockin_ready() FROM PUBLIC,anon,authenticated,service_role;

-- Guarded source patches retain existing attendance, OT, GPS, audit,
-- projection, worker lock order and scoped employee eligibility contracts.
-- Worker and reconciler use independent locks plus a shared control lock;
-- activation/suspension take the exclusive control lock without blocking attendance.
DO $patch$
DECLARE d text; old text; replacement text; target text;
BEGIN
 FOR target,old,replacement IN VALUES
  ('private.tt_reconcile_auto_clockout_sessions()',
   ' SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config WHERE config_key=''default'';',
   $new$ IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('tt-auto-clockout-control',0))
    OR NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tt-auto-clockout-reconciler',0)) THEN
    RETURN pg_catalog.jsonb_build_object('added',0,'skipped',0,'busy',true);
   END IF;
   SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config WHERE config_key='default';$new$),
  ('private.tt_reconcile_auto_clockout_sessions()',
   'IF v_activated_at IS NULL OR v_activated_at=''infinity''::timestamptz THEN',
   'IF private.tt_auto_clockout_mode() IS DISTINCT FROM ''active'' OR v_activated_at IS NULL OR v_activated_at=''infinity''::timestamptz THEN'),
  ('private.tt_process_auto_clockouts()',
   $old$IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tt-auto-clockout-worker',0)) THEN$old$,
   $new$IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('tt-auto-clockout-control',0))
    OR NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tt-auto-clockout-worker',0)) THEN$new$),
  ('private.tt_process_auto_clockouts()',
   'IF v_activated_at IS NULL OR v_activated_at=''infinity''::timestamptz THEN',
   'IF private.tt_auto_clockout_mode() IS DISTINCT FROM ''active'' OR v_activated_at IS NULL OR v_activated_at=''infinity''::timestamptz THEN'),
  ('private.tt_reconcile_auto_clockout_sessions()',
   'INSERT INTO private.tt_auto_clockout_sessions(',
   'INSERT INTO private.tt_auto_clockout_sessions AS q('),
  ('private.tt_reconcile_auto_clockout_sessions()',
   'ON CONFLICT(board_id,record_id) DO NOTHING;',
   $new$ON CONFLICT(board_id,record_id) DO UPDATE SET
     clock_in_at=EXCLUDED.clock_in_at,threshold_at=EXCLUDED.threshold_at,
     status='MONITORING',grace_started_at=NULL,grace_deadline_at=NULL,
     overtime_cutoff_at=NULL,pending_at=NULL,scheduled_clock_out_at=NULL,
     last_evaluated_at=NULL,completed_at=NULL,clock_out_reason=NULL,
     last_error=NULL,updated_at=pg_catalog.clock_timestamp()
    WHERE q.status='CANCELLED'
     AND q.last_error='Suspended for controlled incident recovery'
     AND q.workspace_id=EXCLUDED.workspace_id
     AND q.employee_id=EXCLUDED.employee_id;$new$)
 LOOP
  d:=pg_catalog.pg_get_functiondef(target::regprocedure);
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Isolated scheduler baseline differs: %',target USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(d,old,replacement);
 END LOOP;
END;
$patch$;
REVOKE ALL ON FUNCTION private.tt_reconcile_auto_clockout_sessions() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts() FROM PUBLIC,anon,authenticated,service_role;

-- Operator-only activation. Require review of today's eligible open records.
-- Never use negative infinity or silently close prior-day attendance.
CREATE FUNCTION private.tt_activate_isolated_auto_clockout(p_day date,p_expected_open integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s'
AS $activate$
DECLARE
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_cutoff timestamptz; v_workspace uuid; v_board constant uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_records jsonb; r record; v_id uuid; v_start timestamptz;
 v_ids uuid[]:=ARRAY[]::uuid[]; v_employees uuid[]:=ARRAY[]::uuid[];
 v_count integer:=0; v_job record; v_result jsonb; i integer;
BEGIN
 IF p_day IS DISTINCT FROM (v_now AT TIME ZONE 'Asia/Manila')::date
  OR p_expected_open IS NULL OR p_expected_open<0 THEN
  RAISE EXCEPTION 'Review current Philippine date and eligible open session count before activation' USING ERRCODE='22023';
 END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('tt-auto-clockout-control',0)) THEN
  RAISE EXCEPTION 'Scheduler busy; retry after worker exits' USING ERRCODE='55P03';
 END IF;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended' THEN
  RAISE EXCEPTION 'Activation requires fully suspended isolated scheduler' USING ERRCODE='55000';
 END IF;
 v_cutoff:=p_day::timestamp AT TIME ZONE 'Asia/Manila';
 SELECT workspace_id INTO v_workspace FROM public.work_boards
 WHERE id=v_board AND name='TimeTracker Attendance' AND status='active'
  AND archived_at IS NULL AND trashed_at IS NULL;
 IF v_workspace IS NULL THEN RAISE EXCEPTION 'Canonical attendance board unavailable' USING ERRCODE='55000'; END IF;
 SELECT e.value::jsonb->'records' INTO v_records FROM public.module_state_entries e
 WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 IF pg_catalog.jsonb_typeof(v_records) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Canonical attendance state unavailable or invalid' USING ERRCODE='55000';
 END IF;
 FOR r IN
  SELECT x.elem,p.id AS employee_id FROM pg_catalog.jsonb_array_elements(v_records) x(elem)
  JOIN public.profiles p ON x.elem->>'ownerId'='cloud:'||p.id::text
  WHERE (x.elem->'clockOut' IS NULL OR x.elem->'clockOut'='null'::jsonb)
   AND private.tt_auto_clockout_employee_eligible(v_workspace,v_board,p.id)
 LOOP
  IF COALESCE(r.elem->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Eligible open attendance record has invalid identity' USING ERRCODE='55000';
  END IF;
  v_id:=(r.elem->>'id')::uuid;
  v_start:=(r.elem#>>'{clockIn,timestamp}')::timestamptz;
  IF v_start IS NULL OR NOT pg_catalog.isfinite(v_start) OR v_start<v_cutoff OR v_start>v_now THEN
   RAISE EXCEPTION 'Open prior-day or invalid session requires administrative review: %',v_id USING ERRCODE='55000';
  END IF;
  IF v_id=ANY(v_ids) OR r.employee_id=ANY(v_employees) THEN
   RAISE EXCEPTION 'Duplicate open attendance identity requires administrative review' USING ERRCODE='55000';
  END IF;
  v_ids:=pg_catalog.array_append(v_ids,v_id);
  v_employees:=pg_catalog.array_append(v_employees,r.employee_id);
  v_count:=v_count+1;
 END LOOP;
 IF v_count<>p_expected_open THEN
  RAISE EXCEPTION 'Eligible open session count changed (expected %, found %); review again',p_expected_open,v_count USING ERRCODE='40001';
 END IF;

 UPDATE private.tt_auto_clockout_config SET activated_at=v_cutoff WHERE config_key='default';
 FOR v_job IN SELECT jobid FROM cron.job
  WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile')
 LOOP
  PERFORM cron.alter_job(v_job.jobid,active:=true);
 END LOOP;
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Isolated activation did not establish a valid active mode' USING ERRCODE='55000';
 END IF;
 v_result:=private.tt_reconcile_auto_clockout_sessions();

 -- Do not silently accept an open record with a completed or differently
 -- owned scheduler row. Worker independently rechecks canonical state.
 FOR i IN 1..v_count LOOP
  IF NOT EXISTS (
   SELECT 1 FROM private.tt_auto_clockout_sessions q
   WHERE q.workspace_id=v_workspace AND q.board_id=v_board AND q.record_id=v_ids[i]
    AND q.employee_id=v_employees[i] AND q.clock_in_at>=v_cutoff
    AND q.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
  ) THEN
   RAISE EXCEPTION 'Reviewed open sessions not all enrolled; resolve conflicts or retry' USING ERRCODE='55000';
  END IF;
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('mode','active','cutoff',v_cutoff,
  'reviewedOpen',v_count,'reconciliation',v_result);
END;
$activate$;
REVOKE ALL ON FUNCTION private.tt_activate_isolated_auto_clockout(date,integer) FROM PUBLIC,anon,authenticated,service_role;

-- Operator suspension takes the exclusive control lock. Never revive old enrollment,
-- alter OJT jobs, or modify canonical attendance.
CREATE FUNCTION private.tt_suspend_isolated_auto_clockout()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s'
AS $suspend$
DECLARE v_job record;
BEGIN
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('tt-auto-clockout-control',0)) THEN
  RAISE EXCEPTION 'Scheduler busy; retry after worker exits' USING ERRCODE='55P03';
 END IF;
 UPDATE private.tt_auto_clockout_config SET activated_at='infinity'::timestamptz WHERE config_key='default';
 FOR v_job IN SELECT jobid FROM cron.job
  WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile')
 LOOP
  PERFORM cron.alter_job(v_job.jobid,active:=false);
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('mode',private.tt_auto_clockout_mode());
END;
$suspend$;
REVOKE ALL ON FUNCTION private.tt_suspend_isolated_auto_clockout() FROM PUBLIC,anon,authenticated,service_role;

DO $final$
BEGIN
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'suspended'
  OR NOT private.tt_admin_manual_clockin_ready() THEN
  RAISE EXCEPTION 'Suspended isolated deployment invariant failed' USING ERRCODE='55000';
 END IF;
END;
$final$;
COMMIT;
