-- CP-TT-AUTO-CLOCKOUT-ISOLATION: candidate incident repair.
-- Scheduler enrollment must never run inside the employee attendance write.
-- Deployment defaults to OFF. An explicit activation cutoff is required later.
BEGIN;
DO $gate$
BEGIN
 IF pg_catalog.to_regprocedure('private.tt_auto_clockout_sync()') IS NULL
 OR pg_catalog.to_regprocedure('private.tt_process_auto_clockouts()') IS NULL
 OR pg_catalog.to_regclass('private.tt_auto_clockout_sessions') IS NULL
 OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'private.tt_process_auto_clockouts()'::pg_catalog.regprocedure),'server-auto-clockout')=0
 THEN RAISE EXCEPTION 'Expected server auto-clockout baseline missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='tt-auto-clockout-processor')
 THEN RAISE EXCEPTION 'Expected clockout cron job missing'; END IF;
END;
$gate$;

-- Retire synchronous enrollment without changing attendance state.
ALTER TABLE public.module_state_entries DISABLE TRIGGER tt_auto_clockout_sync;
CREATE OR REPLACE FUNCTION private.tt_auto_clockout_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$ BEGIN RETURN NEW; END; $f$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_sync() FROM PUBLIC,anon,authenticated;

SELECT cron.alter_job(jobid,active:=false)
FROM cron.job WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile');
UPDATE private.tt_auto_clockout_config SET activated_at='infinity'::timestamptz
WHERE config_key='default';
-- Retire stale pending foreground closures and old scheduler work only.
-- Do not change an employee's attendance or invent historical clock-outs.
UPDATE private.tt_auto_clockout_sessions
SET status='CANCELLED',pending_at=NULL,scheduled_clock_out_at=NULL,
 last_error='Suspended for controlled incident recovery',updated_at=pg_catalog.clock_timestamp()
WHERE status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR');

CREATE FUNCTION private.tt_auto_clockout_employee_eligible(
 p_workspace uuid,p_board uuid,p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$
 SELECT EXISTS(
  SELECT 1 FROM public.profiles p JOIN public.workspace_members m
   ON m.user_id=p.id AND m.workspace_id=p_workspace AND m.active
  JOIN auth.users u ON u.id=p.id
  JOIN public.work_boards b ON b.id=p_board AND b.workspace_id=p_workspace
  WHERE p.id=p_employee AND p.status='active'
   AND b.id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
   AND b.name='TimeTracker Attendance' AND b.status='active'
   AND b.archived_at IS NULL AND b.trashed_at IS NULL
   AND public.has_module_access('time-tracker',p.id)
   AND public.module_role_for('time-tracker',p.id) IS NOT NULL
   AND p.id<>'d613280d-907b-418f-b872-c0f6dd53e580'::uuid
   AND NOT EXISTS(SELECT 1 FROM private.tt_ojt_shared_accounts a
    WHERE a.workspace_id=p_workspace AND a.board_id=p_board AND a.shared_user_id=p.id));
$f$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_employee_eligible(uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated;

-- Separate read/reconcile transaction. No authoritative attendance row lock,
-- no employee advisory lock, no attendance update, and no GPS fabrication.
CREATE FUNCTION private.tt_reconcile_auto_clockout_sessions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s'
AS $f$
DECLARE r record; v_id uuid; v_employee uuid; v_start timestamptz;
 v_activated_at timestamptz; v_added integer:=0; v_skipped integer:=0; v_count integer;
BEGIN
 SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config WHERE config_key='default';
 IF v_activated_at IS NULL OR v_activated_at='infinity'::timestamptz THEN
  RETURN pg_catalog.jsonb_build_object('added',0,'skipped',0,'suspended',true);
 END IF;
 FOR r IN
  SELECT e.workspace_id,b.id AS board_id,x.elem
  FROM public.module_state_entries e JOIN public.work_boards b ON b.workspace_id=e.workspace_id
   AND b.id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
   AND b.name='TimeTracker Attendance' AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records') x(elem)
  WHERE e.module_id='time-tracker' AND e.state_key='timetracker.attendance.v1'
   AND e.scope='shared' AND e.owner_key='*'
   AND (x.elem->'clockOut' IS NULL OR x.elem->'clockOut'='null'::jsonb)
 LOOP
  BEGIN
   IF COALESCE(r.elem->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(r.elem->>'ownerId','') !~* '^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN v_skipped:=v_skipped+1; CONTINUE; END IF;
   v_id:=(r.elem->>'id')::uuid;
   v_employee:=pg_catalog.substr(r.elem->>'ownerId',7)::uuid;
   v_start:=(r.elem#>>'{clockIn,timestamp}')::timestamptz;
   IF v_start IS NULL OR NOT pg_catalog.isfinite(v_start) OR v_start<v_activated_at
     OR v_start>pg_catalog.clock_timestamp()
     OR NOT private.tt_auto_clockout_employee_eligible(r.workspace_id,r.board_id,v_employee)
   THEN v_skipped:=v_skipped+1; CONTINUE; END IF;
   INSERT INTO private.tt_auto_clockout_sessions(
    workspace_id,board_id,record_id,employee_id,clock_in_at,threshold_at,status)
   VALUES(r.workspace_id,r.board_id,v_id,v_employee,v_start,
    private.tt_auto_clockout_threshold(v_start),'MONITORING')
   ON CONFLICT(board_id,record_id) DO NOTHING;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   v_added:=v_added+v_count;
  EXCEPTION WHEN foreign_key_violation OR invalid_text_representation
    OR invalid_datetime_format OR datetime_field_overflow OR lock_not_available OR deadlock_detected THEN
   -- A stale/deleted identity or busy row is isolated to this scheduler cycle.
   v_skipped:=v_skipped+1;
  END;
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('added',v_added,'skipped',v_skipped,'suspended',false);
END;
$f$;
REVOKE ALL ON FUNCTION private.tt_reconcile_auto_clockout_sessions()
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tt_process_auto_clockouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
SET lock_timeout='1s'
AS $function$
DECLARE
  v_candidate record;
  v_session record;
  v_ot record;
  v_current_value text;
  v_revision bigint;
  v_new_revision bigint;
  v_state jsonb;
  v_record jsonb;
  v_updated_records jsonb;
  v_updated_state jsonb;
  v_clock_in timestamptz;
  v_threshold timestamptz;
  v_grace_deadline timestamptz;
  v_ot_start timestamptz;
  v_ot_end timestamptz;
  v_cutoff timestamptz;
  v_clock_out_at timestamptz;
  v_now timestamptz:=clock_timestamp();
  v_stamp text;
  v_clock_out jsonb;
  v_out_geo jsonb;
  v_has_ot boolean;
  v_status text;
  v_reason text;
  v_backup_revision bigint;
  v_processed integer:=0;
  v_failed integer:=0;
  v_activated_at timestamptz;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tt-auto-clockout-worker',0)) THEN
    RETURN pg_catalog.jsonb_build_object('processed',0,'failed',0,'busy',true);
  END IF;

  SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config WHERE config_key='default';
  IF v_activated_at IS NULL OR v_activated_at='infinity'::timestamptz THEN
    RETURN pg_catalog.jsonb_build_object('processed',0,'failed',0,'suspended',true);
  END IF;

  FOR v_candidate IN
    SELECT workspace_id,board_id,record_id,employee_id
    FROM private.tt_auto_clockout_sessions
    WHERE status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
      AND threshold_at<=v_now AND clock_in_at>=v_activated_at
    ORDER BY last_evaluated_at NULLS FIRST,COALESCE(overtime_cutoff_at,threshold_at),record_id
    LIMIT 100
  LOOP
    -- Never wait on an employee while holding locks from another candidate.
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_candidate.workspace_id::text||':time-tracker:attendance:'||
        v_candidate.employee_id::text,0)) THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_session
    FROM private.tt_auto_clockout_sessions
    WHERE workspace_id=v_candidate.workspace_id
      AND board_id=v_candidate.board_id
      AND record_id=v_candidate.record_id
      AND status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
    FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      EXIT;
    END IF;
    BEGIN
      IF NOT private.tt_auto_clockout_employee_eligible(v_session.workspace_id,v_session.board_id,v_session.employee_id) THEN
        UPDATE private.tt_auto_clockout_sessions SET status='CANCELLED',pending_at=NULL,
          scheduled_clock_out_at=NULL,last_evaluated_at=v_now,last_error='Employee no longer eligible',updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;
      SELECT value,revision INTO v_current_value,v_revision
      FROM public.module_state_entries
      WHERE workspace_id=v_session.workspace_id
        AND module_id='time-tracker'
        AND state_key='timetracker.attendance.v1'
        AND scope='shared' AND owner_key='*'
      FOR UPDATE NOWAIT;

      IF NOT FOUND THEN
        UPDATE private.tt_auto_clockout_sessions
        SET status='CANCELLED',pending_at=NULL,scheduled_clock_out_at=NULL,last_evaluated_at=v_now,
            last_error='Authoritative attendance state is unavailable',
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;

      v_state:=v_current_value::jsonb;
      IF pg_catalog.jsonb_typeof(v_state)<>'object'
         OR pg_catalog.jsonb_typeof(v_state->'records')<>'array' THEN
        RAISE EXCEPTION 'Authoritative attendance state is malformed';
      END IF;

      SELECT elem INTO v_record
      FROM pg_catalog.jsonb_array_elements(v_state->'records') elem
      WHERE elem->>'id'=v_session.record_id::text
        AND elem->>'ownerId'='cloud:'||v_session.employee_id::text
      LIMIT 1;

      IF v_record IS NULL THEN
        UPDATE private.tt_auto_clockout_sessions
        SET status='CANCELLED',pending_at=NULL,scheduled_clock_out_at=NULL,last_evaluated_at=v_now,
            last_error='Attendance session no longer exists',
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;

      IF v_record->'clockOut' IS NOT NULL
         AND v_record->'clockOut'<>'null'::jsonb THEN
        UPDATE private.tt_auto_clockout_sessions
        SET status='COMPLETED',pending_at=NULL,scheduled_clock_out_at=NULL,
            completed_at=COALESCE(
              NULLIF(v_record#>>'{clockOut,timestamp}','')::timestamptz,v_now),
            clock_out_reason=COALESCE(
              v_record#>>'{clockOut,reason}','manual_clock_out'),
            last_evaluated_at=v_now,last_error=NULL,updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;

      v_clock_in:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
      IF v_clock_in IS NULL OR NOT pg_catalog.isfinite(v_clock_in) OR v_clock_in<v_activated_at THEN
        UPDATE private.tt_auto_clockout_sessions SET status='CANCELLED',pending_at=NULL,
          scheduled_clock_out_at=NULL,last_evaluated_at=v_now,last_error='Session outside activation scope',updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;
      IF v_clock_in IS DISTINCT FROM v_session.clock_in_at THEN
        v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
        UPDATE private.tt_auto_clockout_sessions
        SET clock_in_at=v_clock_in,threshold_at=v_threshold,
            grace_started_at=NULL,grace_deadline_at=NULL,overtime_cutoff_at=NULL,
            status='MONITORING',pending_at=NULL,scheduled_clock_out_at=NULL,
            last_evaluated_at=v_now,last_error=NULL,
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;

      v_threshold:=v_session.threshold_at;
      v_grace_deadline:=v_threshold; -- compatibility field: no extra grace
      v_cutoff:=v_threshold;
      v_has_ot:=false;

      -- Approved OT must continuously cover the cutoff and be approved by
      -- that cutoff. Late approval cannot revive an expired session.
      FOR v_ot IN
        SELECT r.ot_date,r.start_time,r.end_time,r.decided_at,r.status
        FROM public.timetracker_ot_requests r
        WHERE r.workspace_id=v_session.workspace_id
          AND r.owner_id=v_session.employee_id
          AND r.ot_date=(v_threshold AT TIME ZONE 'Asia/Manila')::date
        ORDER BY r.start_time,r.end_time
        FOR SHARE OF r NOWAIT
      LOOP
        v_ot_start:=(v_ot.ot_date+v_ot.start_time) AT TIME ZONE 'Asia/Manila';
        v_ot_end:=(v_ot.ot_date+v_ot.end_time) AT TIME ZONE 'Asia/Manila';
        IF v_ot.status='Approved'
           AND (
             (v_cutoff=v_threshold AND v_ot_start<=v_grace_deadline AND v_ot_end>v_grace_deadline)
             OR
             (v_cutoff<>v_threshold AND v_ot_start<=v_cutoff AND v_ot_end>v_cutoff)
           )
           AND v_ot.decided_at<=(
             CASE WHEN v_cutoff=v_threshold THEN v_grace_deadline
                  ELSE v_cutoff END
           ) THEN
          v_cutoff:=v_ot_end;
          v_has_ot:=true;
        END IF;
      END LOOP;

      v_reason:=NULL;
      v_clock_out_at:=NULL;
      IF v_now<v_threshold THEN
        v_status:='MONITORING';
      ELSIF v_has_ot THEN
        IF v_now>=v_cutoff THEN
          v_status:='COMPLETED';
          v_reason:='approved_overtime_ended';
          v_clock_out_at:=v_cutoff;
        ELSE
          v_status:='OVERTIME';
        END IF;
      ELSE
        IF v_now>=v_grace_deadline THEN
          v_status:='COMPLETED';
          v_reason:='nine_hour_threshold_grace_expired';
          v_clock_out_at:=v_threshold;
        ELSE
          v_status:='MONITORING';
        END IF;
      END IF;

      IF v_clock_out_at IS NOT NULL THEN
        v_stamp:=pg_catalog.to_char(
          v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        v_out_geo:=pg_catalog.jsonb_build_object(
          'status','not_captured',
          'source','server-auto-clockout',
          'generatedAt',v_stamp);
        v_clock_out:=pg_catalog.jsonb_build_object(
          'location',COALESCE(v_record#>>'{clockIn,location}',''),
          'department',COALESCE(v_record#>>'{clockIn,department}',''),
          'timestamp',pg_catalog.to_char(
            v_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'automatic',true,
          'reason',v_reason,
          'geo',v_out_geo);

        v_record:=v_record||pg_catalog.jsonb_build_object(
          'clockOut',v_clock_out,'updatedAt',v_stamp);
        SELECT COALESCE(pg_catalog.jsonb_agg(
          CASE WHEN elem->>'id'=v_session.record_id::text THEN v_record ELSE elem END
          ORDER BY ord),'[]'::jsonb)
        INTO v_updated_records
        FROM pg_catalog.jsonb_array_elements(v_state->'records')
          WITH ORDINALITY AS a(elem,ord);
        v_updated_state:=pg_catalog.jsonb_set(v_state,'{records}',v_updated_records,true);

        IF NOT public.module_state_invariants_valid(
          'time-tracker','timetracker.attendance.v1',v_updated_state::text) THEN
          RAISE EXCEPTION 'Automatic clock-out violates attendance state invariants';
        END IF;

        INSERT INTO public.module_state_entries(
          workspace_id,module_id,state_key,scope,owner_key,value,revision,
          updated_by,updated_at)
        VALUES(v_session.workspace_id,'time-tracker',
          'timetracker.attendance.v1.backup','shared','*',v_current_value,
          1,v_session.employee_id,v_now)
        ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
        SET value=EXCLUDED.value,
            revision=public.module_state_entries.revision+1,
            updated_by=EXCLUDED.updated_by,
            updated_at=EXCLUDED.updated_at
        RETURNING revision INTO v_backup_revision;

        UPDATE public.module_state_entries
        SET value=v_updated_state::text,
            revision=revision+1,
            updated_by=v_session.employee_id,
            updated_at=v_now
        WHERE workspace_id=v_session.workspace_id
          AND module_id='time-tracker'
          AND state_key='timetracker.attendance.v1'
          AND scope='shared' AND owner_key='*'
        RETURNING revision INTO v_new_revision;
        IF v_new_revision IS NULL OR v_new_revision<=v_revision THEN
          RAISE EXCEPTION 'Automatic attendance revision did not advance';
        END IF;

        INSERT INTO public.timetracker_attendance_mutation_audit(
          workspace_id,board_id,actor_id,record_id,action,revision,
          committed_at,offsite_note_supplied,source)
        VALUES(v_session.workspace_id,v_session.board_id,v_session.employee_id,
          v_session.record_id::text,'clock-out',v_new_revision,
          v_now,false,'automatic');

        -- Legacy or manually created attendance may have no linked Board row.
        -- Do not fabricate GPS or create a projection unsupported by evidence.
        IF EXISTS (SELECT 1 FROM private.tt_attendance_board_projection p
          WHERE p.board_id=v_session.board_id AND p.record_id=v_session.record_id) THEN
          PERFORM private.tt_auto_clockout_project(
            v_session.board_id,v_session.workspace_id,v_session.employee_id,
            v_record,v_new_revision);
        END IF;

        UPDATE private.tt_auto_clockout_sessions
        SET status='COMPLETED',pending_at=NULL,scheduled_clock_out_at=NULL,
            grace_started_at=v_threshold,
            grace_deadline_at=v_grace_deadline,
            overtime_cutoff_at=CASE WHEN v_has_ot THEN v_cutoff ELSE NULL END,
            last_evaluated_at=v_now,completed_at=v_now,
            clock_out_reason=v_reason,last_error=NULL,updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        v_processed:=v_processed+1;
      ELSE
        UPDATE private.tt_auto_clockout_sessions
        SET status=v_status,pending_at=NULL,scheduled_clock_out_at=NULL,
            grace_started_at=CASE WHEN v_now>=v_threshold THEN v_threshold ELSE NULL END,
            grace_deadline_at=CASE WHEN v_now>=v_threshold THEN v_grace_deadline ELSE NULL END,
            overtime_cutoff_at=CASE WHEN v_has_ot THEN v_cutoff ELSE NULL END,
            last_evaluated_at=v_now,last_error=NULL,updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
      END IF;
    EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
      RETURN pg_catalog.jsonb_build_object('processed',0,'failed',0,'busy',true);
    WHEN OTHERS THEN
      v_failed:=v_failed+1;
      UPDATE private.tt_auto_clockout_sessions
      SET status='ERROR',
          last_evaluated_at=clock_timestamp(),
          last_error=pg_catalog.left(SQLERRM,500),
          updated_at=clock_timestamp()
      WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
    END;
    -- At most one candidate with acquired employee lock per transaction.
    EXIT;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'processed',v_processed,'failed',v_failed,'busy',false,'evaluatedAt',v_now);
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('tt-auto-clockout-reconcile','30 seconds',
 'SELECT private.tt_reconcile_auto_clockout_sessions();');
SELECT cron.alter_job(jobid,active:=false)
 FROM cron.job WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile');
COMMIT;
