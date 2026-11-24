-- CP-TT-DEFERRED-FOREGROUND-CLOCKOUT-01
-- Keep due attendance sessions open until the employee enters TimeTracker,
-- obtains a fresh foreground GPS fix, and commits the scheduled clock-out.
BEGIN;

DO $gate$
DECLARE
  v_worker text;
  v_sync text;
BEGIN
  IF to_regclass('private.tt_auto_clockout_sessions') IS NULL
     OR to_regclass('public.timetracker_attendance_mutation_audit') IS NULL
     OR to_regclass('public.module_state_entries') IS NULL
     OR to_regprocedure('public.timetracker_ot_require_scope(uuid)') IS NULL
     OR to_regprocedure('private.tt_board_projection_upsert(uuid,uuid,uuid,jsonb,bigint,text)') IS NULL
     OR to_regprocedure('public.module_state_invariants_valid(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'CP-TT-DEFERRED-FOREGROUND-CLOCKOUT-01 prerequisites are missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'private.tt_process_auto_clockouts()'::pg_catalog.regprocedure)
  INTO v_worker;
  IF pg_catalog.md5(v_worker) IS DISTINCT FROM 'a80b397f9e8d1738ac3f056347473f51' THEN
    RAISE EXCEPTION 'Automatic clock-out worker differs from the verified production baseline';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'private.tt_auto_clockout_sync()'::pg_catalog.regprocedure)
  INTO v_sync;
  IF pg_catalog.md5(v_sync) IS DISTINCT FROM '448a9d46d464513360a6c135630c5a65' THEN
    RAISE EXCEPTION 'Automatic clock-out sync trigger differs from the verified production baseline';
  END IF;
END;
$gate$;

ALTER TABLE private.tt_auto_clockout_sessions
  ADD COLUMN IF NOT EXISTS pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_clock_out_at timestamptz;

ALTER TABLE private.tt_auto_clockout_sessions
  DROP CONSTRAINT IF EXISTS tt_auto_clockout_sessions_status_check;

ALTER TABLE private.tt_auto_clockout_sessions
  ADD CONSTRAINT tt_auto_clockout_sessions_status_check
  CHECK (status IN (
    'MONITORING','GRACE','OVERTIME','PENDING_GPS',
    'COMPLETED','CANCELLED','ERROR'
  ));

COMMENT ON COLUMN private.tt_auto_clockout_sessions.pending_at IS
  'Time the automatic clock-out became pending; attendance remains active until foreground GPS completion.';
COMMENT ON COLUMN private.tt_auto_clockout_sessions.scheduled_clock_out_at IS
  'Original scheduled automatic clock-out instant, preserved independently from the later GPS capture and commit times.';

-- Patch only the due-state transitions in the verified worker definition.
-- The server scheduler records PENDING_GPS and never writes a clock-out record.
DO $worker$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'private.tt_process_auto_clockouts()'::pg_catalog.regprocedure)
  INTO v_definition;

  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$          v_status:='COMPLETED';
          v_reason:='approved_overtime_ended';
          v_clock_out_at:=v_cutoff;$old$,
    $new$          v_status:='PENDING_GPS';
          v_reason:='approved_overtime_ended';
          v_clock_out_at:=v_cutoff;$new$
  );
  v_definition := pg_catalog.replace(
    v_definition,
    $old$          v_status:='COMPLETED';
          v_reason:='nine_hour_threshold_grace_expired';
          v_clock_out_at:=v_grace_deadline;$old$,
    $new$          v_status:='PENDING_GPS';
          v_reason:='nine_hour_threshold_grace_expired';
          v_clock_out_at:=v_grace_deadline;$new$
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'IF v_clock_out_at IS NOT NULL THEN',
    'IF v_clock_out_at IS NOT NULL AND v_status<>''PENDING_GPS'' THEN'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    '        SET status=v_status,',
    $new$        SET status=v_status,
            pending_at=CASE WHEN v_status='PENDING_GPS'
              THEN COALESCE(pending_at,v_now) ELSE NULL END,
            scheduled_clock_out_at=CASE WHEN v_status='PENDING_GPS'
              THEN v_clock_out_at ELSE NULL END,
            clock_out_reason=CASE WHEN v_status='PENDING_GPS'
              THEN v_reason ELSE NULL END,$new$
  );

  IF v_definition=v_before
     OR pg_catalog.strpos(v_definition,'v_status:=''PENDING_GPS''')=0
     OR pg_catalog.strpos(v_definition,'scheduled_clock_out_at=CASE WHEN v_status=''PENDING_GPS''')=0
     OR pg_catalog.strpos(v_definition,'IF v_clock_out_at IS NOT NULL AND v_status<>''PENDING_GPS'' THEN')=0 THEN
    RAISE EXCEPTION 'Automatic clock-out worker patch did not match all expected transitions';
  END IF;

  EXECUTE v_definition;
END;
$worker$;

-- Manual Clock Out still wins normally. Clear pending metadata when the
-- existing attendance-state trigger observes any completed clock-out.
DO $sync$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'private.tt_auto_clockout_sync()'::pg_catalog.regprocedure)
  INTO v_definition;

  v_definition := pg_catalog.replace(
    v_definition,
    $old$      SET status='COMPLETED',
          completed_at=COALESCE($old$,
    $new$      SET status='COMPLETED',
          pending_at=NULL,
          scheduled_clock_out_at=NULL,
          completed_at=COALESCE($new$
  );

  IF pg_catalog.strpos(v_definition,'pending_at=NULL')=0
     OR pg_catalog.strpos(v_definition,'scheduled_clock_out_at=NULL')=0 THEN
    RAISE EXCEPTION 'Automatic clock-out pending cleanup patch failed';
  END IF;

  EXECUTE v_definition;
END;
$sync$;

CREATE OR REPLACE FUNCTION public.timetracker_auto_clockout_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_record_id text;
  v_session jsonb;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  SELECT elem->>'id' INTO v_record_id
  FROM public.module_state_entries e
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records')
    AS records(elem)
  WHERE e.workspace_id=v_workspace
    AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*'
    AND elem->>'ownerId'='cloud:'||v_actor::text
    AND (elem->'clockOut' IS NULL OR elem->'clockOut'='null'::jsonb)
  LIMIT 1;

  IF v_record_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'recordId',s.record_id::text,
      'status',s.status,
      'thresholdAt',s.threshold_at,
      'graceStartedAt',s.grace_started_at,
      'graceDeadlineAt',s.grace_deadline_at,
      'overtimeCutoffAt',s.overtime_cutoff_at,
      'scheduledClockOutAt',s.scheduled_clock_out_at,
      'pendingAt',s.pending_at,
      'nextAt',CASE
        WHEN s.status='MONITORING' THEN s.threshold_at
        WHEN s.status='GRACE' THEN s.grace_deadline_at
        WHEN s.status='OVERTIME' THEN s.overtime_cutoff_at
        WHEN s.status='PENDING_GPS' THEN s.scheduled_clock_out_at
        ELSE NULL END,
      'lastEvaluatedAt',s.last_evaluated_at,
      'clockOutReason',s.clock_out_reason)
    INTO v_session
    FROM private.tt_auto_clockout_sessions s
    WHERE s.workspace_id=v_workspace AND s.board_id=p_board_id
      AND s.employee_id=v_actor AND s.record_id=v_record_id::uuid;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-auto-clockout-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'session',v_session);
END;
$function$;

REVOKE ALL ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.timetracker_auto_clockout_complete(
  p_board_id uuid,
  p_record_id uuid,
  p_geo jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_role text;
  v_session private.tt_auto_clockout_sessions%ROWTYPE;
  v_session_found boolean:=false;
  v_current_value text;
  v_revision bigint;
  v_new_revision bigint;
  v_backup_revision bigint;
  v_state jsonb;
  v_record jsonb;
  v_updated_records jsonb;
  v_updated_state jsonb;
  v_clock_out jsonb;
  v_clock_out_at timestamptz;
  v_fix_time timestamptz;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_stamp text;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_actor);
  IF v_actor IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Signed TimeTracker session required' USING ERRCODE='42501';
  END IF;
  IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'Pending attendance record id required' USING ERRCODE='22023';
  END IF;

  IF p_geo IS NULL OR pg_catalog.jsonb_typeof(p_geo)<>'object'
     OR p_geo->>'status'<>'captured'
     OR p_geo->>'source'<>'browser-geolocation'
     OR COALESCE(p_geo->>'latitude','') !~ '^-?[0-9]+(\.[0-9]+)?$'
     OR COALESCE(p_geo->>'longitude','') !~ '^-?[0-9]+(\.[0-9]+)?$'
     OR COALESCE(p_geo->>'accuracy','') !~ '^[0-9]+(\.[0-9]+)?$'
     OR COALESCE(p_geo->>'capturedAt','') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION 'Fresh foreground browser GPS evidence required' USING ERRCODE='22023';
  END IF;
  IF (p_geo->>'latitude')::numeric NOT BETWEEN -90 AND 90
     OR (p_geo->>'longitude')::numeric NOT BETWEEN -180 AND 180
     OR (p_geo->>'accuracy')::numeric NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'GPS coordinates or accuracy invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_fix_time:=(p_geo->>'capturedAt')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'GPS capture timestamp invalid' USING ERRCODE='22023';
  END;
  IF v_fix_time IS NULL
     OR v_fix_time < v_now-INTERVAL '5 minutes'
     OR v_fix_time > v_now+INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'GPS fix is stale or has a future timestamp' USING ERRCODE='22023';
  END IF;

  -- Match the existing worker lock order: employee lock, scheduler row,
  -- then authoritative attendance state. Manual writes share the employee lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_workspace::text||':time-tracker:attendance:'||v_actor::text,0));

  SELECT * INTO v_session
  FROM private.tt_auto_clockout_sessions
  WHERE workspace_id=v_workspace AND board_id=p_board_id
    AND employee_id=v_actor AND record_id=p_record_id
  FOR UPDATE;
  v_session_found:=FOUND;

  SELECT value,revision INTO v_current_value,v_revision
  FROM public.module_state_entries
  WHERE workspace_id=v_workspace
    AND module_id='time-tracker'
    AND state_key='timetracker.attendance.v1'
    AND scope='shared' AND owner_key='*'
  FOR UPDATE;
  IF NOT FOUND OR v_current_value IS NULL THEN
    RAISE EXCEPTION 'Authoritative attendance state is unavailable' USING ERRCODE='40001';
  END IF;

  v_state:=v_current_value::jsonb;
  IF pg_catalog.jsonb_typeof(v_state)<>'object'
     OR pg_catalog.jsonb_typeof(v_state->'records')<>'array' THEN
    RAISE EXCEPTION 'Authoritative attendance state is malformed' USING ERRCODE='22023';
  END IF;

  SELECT elem INTO v_record
  FROM pg_catalog.jsonb_array_elements(v_state->'records') elem
  WHERE elem->>'id'=p_record_id::text
    AND elem->>'ownerId'='cloud:'||v_actor::text
  LIMIT 1;
  IF v_record IS NULL THEN
    RAISE EXCEPTION 'Attendance record is no longer available' USING ERRCODE='PT409';
  END IF;

  -- An interrupted response can be reconciled without replaying the write.
  IF v_record->'clockOut' IS NOT NULL
     AND v_record->'clockOut'<>'null'::jsonb THEN
    IF v_record#>>'{clockOut,automatic}'='true'
       AND v_record#>>'{clockOut,geo,status}'='captured'
       AND v_record#>>'{clockOut,geo,source}'='browser-geolocation' THEN
      RETURN pg_catalog.jsonb_build_object(
        'mode','ALREADY_COMMITTED','contract','tt-auto-clockout-complete-1',
        'actorId',v_actor::text,'workspaceId',v_workspace::text,
        'boardId',p_board_id::text,'recordId',p_record_id::text,
        'scheduledClockOutAt',v_record#>>'{clockOut,timestamp}',
        'gpsCapturedAt',v_record#>>'{clockOut,geo,capturedAt}',
        'revision',v_revision,
        'committedAt',v_record->>'updatedAt');
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'mode','ALREADY_CLOSED','contract','tt-auto-clockout-complete-1',
      'actorId',v_actor::text,'workspaceId',v_workspace::text,
      'boardId',p_board_id::text,'recordId',p_record_id::text,
      'revision',v_revision);
  END IF;

  IF NOT v_session_found OR v_session.status<>'PENDING_GPS'
     OR v_session.pending_at IS NULL
     OR v_session.scheduled_clock_out_at IS NULL
     OR v_session.clock_out_reason NOT IN (
       'nine_hour_threshold_grace_expired','approved_overtime_ended') THEN
    RAISE EXCEPTION 'Attendance session is not pending foreground GPS completion'
      USING ERRCODE='PT409';
  END IF;

  v_clock_out_at:=v_session.scheduled_clock_out_at;
  IF v_clock_out_at<(v_record#>>'{clockIn,timestamp}')::timestamptz
     OR v_clock_out_at>v_now THEN
    RAISE EXCEPTION 'Scheduled clock-out timestamp is invalid' USING ERRCODE='22023';
  END IF;

  v_stamp:=pg_catalog.to_char(
    v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_clock_out:=pg_catalog.jsonb_build_object(
    'location',COALESCE(v_record#>>'{clockIn,location}',''),
    'department',COALESCE(v_record#>>'{clockIn,department}',''),
    'timestamp',pg_catalog.to_char(
      v_clock_out_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'automatic',true,
    'reason',v_session.clock_out_reason,
    'geo',p_geo);

  v_record:=v_record||pg_catalog.jsonb_build_object(
    'clockOut',v_clock_out,'updatedAt',v_stamp);
  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE WHEN elem->>'id'=p_record_id::text THEN v_record ELSE elem END
    ORDER BY ord),'[]'::jsonb)
  INTO v_updated_records
  FROM pg_catalog.jsonb_array_elements(v_state->'records')
    WITH ORDINALITY AS a(elem,ord);
  v_updated_state:=pg_catalog.jsonb_set(v_state,'{records}',v_updated_records,true);

  IF NOT public.module_state_invariants_valid(
    'time-tracker','timetracker.attendance.v1',v_updated_state::text) THEN
    RAISE EXCEPTION 'Foreground automatic clock-out violates attendance state invariants';
  END IF;

  INSERT INTO public.module_state_entries(
    workspace_id,module_id,state_key,scope,owner_key,value,revision,
    updated_by,updated_at)
  VALUES(v_workspace,'time-tracker','timetracker.attendance.v1.backup',
    'shared','*',v_current_value,1,v_actor,v_now)
  ON CONFLICT ON CONSTRAINT module_state_entries_pkey DO UPDATE
  SET value=EXCLUDED.value,
      revision=public.module_state_entries.revision+1,
      updated_by=EXCLUDED.updated_by,
      updated_at=EXCLUDED.updated_at
  RETURNING revision INTO v_backup_revision;

  UPDATE public.module_state_entries
  SET value=v_updated_state::text,
      revision=revision+1,
      updated_by=v_actor,
      updated_at=v_now
  WHERE workspace_id=v_workspace
    AND module_id='time-tracker'
    AND state_key='timetracker.attendance.v1'
    AND scope='shared' AND owner_key='*'
  RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL OR v_new_revision<=v_revision THEN
    RAISE EXCEPTION 'Foreground automatic attendance revision did not advance';
  END IF;

  INSERT INTO public.timetracker_attendance_mutation_audit(
    workspace_id,board_id,actor_id,record_id,action,revision,
    committed_at,offsite_note_supplied,source)
  VALUES(v_workspace,p_board_id,v_actor,p_record_id::text,'clock-out',
    v_new_revision,v_now,false,'automatic');

  PERFORM private.tt_board_projection_upsert(
    p_board_id,v_workspace,v_actor,v_record,v_new_revision,'clock-out');

  UPDATE private.tt_auto_clockout_sessions
  SET status='COMPLETED',
      pending_at=NULL,
      scheduled_clock_out_at=NULL,
      last_evaluated_at=v_now,
      completed_at=v_now,
      clock_out_reason=v_session.clock_out_reason,
      last_error=NULL,
      updated_at=v_now
  WHERE workspace_id=v_workspace AND board_id=p_board_id
    AND employee_id=v_actor AND record_id=p_record_id;

  RETURN pg_catalog.jsonb_build_object(
    'mode','COMMITTED','contract','tt-auto-clockout-complete-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'recordId',p_record_id::text,
    'scheduledClockOutAt',v_clock_out#>>'{timestamp}',
    'gpsCapturedAt',p_geo->>'capturedAt',
    'revision',v_new_revision,'committedAt',v_stamp);
END;
$function$;

REVOKE ALL ON FUNCTION public.timetracker_auto_clockout_complete(uuid,uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_auto_clockout_complete(uuid,uuid,jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.timetracker_auto_clockout_complete(uuid,uuid,jsonb) IS
  'Completes a due automatic attendance session only after fresh foreground browser GPS is supplied; preserves the scheduled clock-out instant and commits attendance, audit and Board projection atomically.';

COMMIT;
