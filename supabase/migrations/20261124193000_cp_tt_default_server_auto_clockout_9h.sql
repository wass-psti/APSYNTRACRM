-- CP-TT-DEFAULT-SERVER-AUTO-CLOCKOUT-09
-- Regular employee attendance closes at nine credited hours without foreground GPS.
-- Existing OJT server policy is unchanged. Preserve signed and approved OT boundaries.
BEGIN;

DO $gate$
BEGIN
  IF pg_catalog.to_regprocedure('private.tt_process_auto_clockouts()') IS NULL
     OR pg_catalog.to_regprocedure('private.tt_auto_clockout_project(uuid,uuid,uuid,jsonb,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('private.tt_auto_clockout_threshold(timestamptz)') IS NULL
     OR pg_catalog.to_regclass('private.tt_auto_clockout_sessions') IS NULL
     OR pg_catalog.to_regclass('cron.job') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='private' AND table_name='tt_auto_clockout_sessions'
         AND column_name='scheduled_clock_out_at'
     ) THEN
    RAISE EXCEPTION 'Deferred clock-out and signed attendance prerequisites are missing';
  END IF;
  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'private.tt_process_auto_clockouts()'::pg_catalog.regprocedure),'PENDING_GPS')=0 THEN
    RAISE EXCEPTION 'Expected deferred worker baseline missing; inspect before replacing';
  END IF;
END;
$gate$;

-- The legacy reason literal remains a compatibility contract; grace is now zero.
-- Restore atomic server completion with existing locking, backup, audit and projection.
CREATE OR REPLACE FUNCTION private.tt_process_auto_clockouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
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
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tt-auto-clockout-worker',0)) THEN
    RETURN pg_catalog.jsonb_build_object('processed',0,'failed',0,'busy',true);
  END IF;

  FOR v_candidate IN
    SELECT workspace_id,board_id,record_id,employee_id
    FROM private.tt_auto_clockout_sessions
    WHERE status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
      AND threshold_at<=v_now
    ORDER BY COALESCE(overtime_cutoff_at,threshold_at),record_id
    LIMIT 100
  LOOP
    -- Acquire the employee lock BEFORE the session-row lock. Manual clock-out
    -- takes the same order and its trigger updates this scheduler row.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_candidate.workspace_id::text||':time-tracker:attendance:'||
        v_candidate.employee_id::text,0));
    SELECT * INTO v_session
    FROM private.tt_auto_clockout_sessions
    WHERE workspace_id=v_candidate.workspace_id
      AND board_id=v_candidate.board_id
      AND record_id=v_candidate.record_id
      AND status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
    FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    BEGIN
      SELECT value,revision INTO v_current_value,v_revision
      FROM public.module_state_entries
      WHERE workspace_id=v_session.workspace_id
        AND module_id='time-tracker'
        AND state_key='timetracker.attendance.v1'
        AND scope='shared' AND owner_key='*'
      FOR UPDATE;

      IF NOT FOUND THEN
        UPDATE private.tt_auto_clockout_sessions
        SET status='CANCELLED',pending_at=NULL,scheduled_clock_out_at=NULL,last_evaluated_at=v_now,
            last_error='Authoritative attendance state is unavailable',
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        CONTINUE;
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
        CONTINUE;
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
        CONTINUE;
      END IF;

      v_clock_in:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
      IF v_clock_in IS DISTINCT FROM v_session.clock_in_at THEN
        v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
        UPDATE private.tt_auto_clockout_sessions
        SET clock_in_at=v_clock_in,threshold_at=v_threshold,
            grace_started_at=NULL,grace_deadline_at=NULL,overtime_cutoff_at=NULL,
            status='MONITORING',pending_at=NULL,scheduled_clock_out_at=NULL,
            last_evaluated_at=v_now,last_error=NULL,
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        CONTINUE;
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
        FOR SHARE OF r
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
    EXCEPTION WHEN OTHERS THEN
      v_failed:=v_failed+1;
      UPDATE private.tt_auto_clockout_sessions
      SET status='ERROR',
          last_evaluated_at=clock_timestamp(),
          last_error=pg_catalog.left(SQLERRM,500),
          updated_at=clock_timestamp()
      WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'processed',v_processed,'failed',v_failed,'busy',false,'evaluatedAt',v_now);
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts() FROM PUBLIC,anon,authenticated;


-- Enroll already-open signed sessions, including records predating the earlier
-- activation date. Completed records are never backfilled or modified.
-- Keep the original canonical attendance board scope.
UPDATE private.tt_auto_clockout_config
SET activated_at='-infinity'::timestamptz WHERE config_key='default';

INSERT INTO private.tt_auto_clockout_sessions(
  workspace_id,board_id,record_id,employee_id,clock_in_at,threshold_at,status)
SELECT e.workspace_id,b.id,(r.elem->>'id')::uuid,p.id,
  (r.elem#>>'{clockIn,timestamp}')::timestamptz,
  private.tt_auto_clockout_threshold((r.elem#>>'{clockIn,timestamp}')::timestamptz),
  'MONITORING'
FROM public.module_state_entries e
JOIN public.work_boards b ON b.workspace_id=e.workspace_id
  AND b.id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
  AND b.name='TimeTracker Attendance' AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
  COALESCE(e.value::jsonb->'records','[]'::jsonb)) r(elem)
JOIN public.profiles p ON r.elem->>'ownerId'='cloud:'||p.id::text
WHERE e.module_id='time-tracker' AND e.state_key='timetracker.attendance.v1'
  AND e.scope='shared' AND e.owner_key='*'
  AND (r.elem->'clockOut' IS NULL OR r.elem->'clockOut'='null'::jsonb)
  AND COALESCE(r.elem->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND COALESCE(r.elem#>>'{clockIn,timestamp}','') ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
ON CONFLICT(board_id,record_id) DO NOTHING;

-- Existing deferred sessions are re-evaluated against the nine-hour threshold
-- by the worker; no client GPS or browser visit is required.
DO $cron$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job
  WHERE jobname='tt-auto-clockout-processor' LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  PERFORM cron.schedule('tt-auto-clockout-processor','30 seconds',
    'SELECT private.tt_process_auto_clockouts();');
END;
$cron$;

COMMENT ON FUNCTION private.tt_process_auto_clockouts() IS
  'Default server clock-out at nine credited hours or approved continuous overtime endpoint; no foreground GPS required; atomic audit and existing Board projection.';

COMMIT;
