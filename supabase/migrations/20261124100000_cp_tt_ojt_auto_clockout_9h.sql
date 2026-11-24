-- CP-TT-OJT-AUTO-CLOCKOUT-05: close shared-login intern attendance at nine elapsed hours.
-- Additive to the signed OJT attendance service; standard employee OT/grace is unchanged.
-- Clock-out is authoritative server-side and does not depend on an open browser or GPS.
BEGIN;

DO $gate$
BEGIN
  IF pg_catalog.to_regclass('private.tt_ojt_attendance') IS NULL
    OR pg_catalog.to_regclass('private.tt_ojt_audit') IS NULL
    OR pg_catalog.to_regclass('cron.job') IS NULL
    OR pg_catalog.to_regprocedure(
      'public.timetracker_ojt_admin_mutate(uuid,uuid,text,jsonb,text,bigint)') IS NULL
  THEN
    RAISE EXCEPTION 'Signed OJT attendance, admin correction and pg_cron must be deployed before auto clock-out';
  END IF;
END;
$gate$;

-- The partial index avoids scanning completed attendance on every scheduled run.
CREATE INDEX IF NOT EXISTS tt_ojt_auto_clockout_due_idx
  ON private.tt_ojt_attendance(clock_in_at,id)
  WHERE clock_out_at IS NULL;

CREATE FUNCTION private.tt_process_ojt_auto_clockouts()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_candidate record;
  v_before private.tt_ojt_attendance%ROWTYPE;
  v_after private.tt_ojt_attendance%ROWTYPE;
  v_cutoff timestamptz;
  v_processed integer:=0;
BEGIN
  -- The exact stored clock-out is the original Clock-In + nine elapsed hours.
  -- Cron may execute seconds later; it never extends the attendance period.
  FOR v_candidate IN
    SELECT a.id,a.workspace_id,a.board_id,a.intern_id
    FROM private.tt_ojt_attendance a
    WHERE a.clock_out_at IS NULL
      AND a.clock_in_at <= pg_catalog.clock_timestamp()-INTERVAL '9 hours'
    ORDER BY a.clock_in_at,a.id
    LIMIT 250
  LOOP
    -- Use the exact per-intern key used by timetracker_ojt_commit and the
    -- signed OJT admin mutate RPC, before taking the attendance row lock.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_candidate.workspace_id::text||':tt-ojt:'||
        v_candidate.intern_id::text,0));

    SELECT * INTO v_before
    FROM private.tt_ojt_attendance
    WHERE id=v_candidate.id
      AND workspace_id=v_candidate.workspace_id
      AND board_id=v_candidate.board_id
      AND intern_id=v_candidate.intern_id
    FOR UPDATE;

    -- A concurrent manual clock-out, deletion, or admin time correction wins
    -- only after its row is reread under the same lock.
    IF NOT FOUND OR v_before.clock_out_at IS NOT NULL THEN
      CONTINUE;
    END IF;
    v_cutoff:=v_before.clock_in_at+INTERVAL '9 hours';
    IF v_cutoff>pg_catalog.clock_timestamp() THEN
      CONTINUE;
    END IF;

    UPDATE private.tt_ojt_attendance
    SET clock_out_at=v_cutoff,
        clock_out_geo=pg_catalog.jsonb_build_object(
          'status','not_captured',
          'source','server-auto-clockout',
          'reason','nine_hour_elapsed'),
        -- No signed intern/administrator performed this operation.
        clock_out_actor=NULL
    WHERE id=v_before.id AND clock_out_at IS NULL
    RETURNING * INTO v_after;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Existing revision-bump trigger increments CAS revision on UPDATE.
    -- Preserve before/after evidence in the existing append-only audit table.
    INSERT INTO private.tt_ojt_audit(
      workspace_id,board_id,actor_id,intern_id,record_id,action,
      before_row,after_row,reason)
    VALUES(
      v_before.workspace_id,v_before.board_id,v_before.shared_user_id,
      v_before.intern_id,v_before.id,'server-auto-clock-out',
      pg_catalog.to_jsonb(v_before),pg_catalog.to_jsonb(v_after),
      'Nine elapsed hours from Clock-In; server scheduler; GPS not captured');
    v_processed:=v_processed+1;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('processed',v_processed);
END;
$function$;

REVOKE ALL ON FUNCTION private.tt_process_ojt_auto_clockouts()
  FROM PUBLIC,anon,authenticated;

-- Independent of the regular employee scheduler, which retains its
-- existing nine credited-work hours + grace/approved OT behavior.
-- Replacing this job name cannot disturb any unrelated scheduled task.
DO $cron$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname='tt-ojt-auto-clockout-9h'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'tt-ojt-auto-clockout-9h',
    '30 seconds',
    'SELECT private.tt_process_ojt_auto_clockouts();');
END;
$cron$;

COMMENT ON FUNCTION private.tt_process_ojt_auto_clockouts() IS
  'Server-side 9 elapsed-hour clock-out for distinct intern IDs under shared OJT login. Idempotent, lock-safe, append-only audited; clock-out GPS never fabricated.';

COMMIT;
