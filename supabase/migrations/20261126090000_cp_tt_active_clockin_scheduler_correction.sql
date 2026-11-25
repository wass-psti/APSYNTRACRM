-- CP-TT: reconcile administrative corrections without re-enabling synchronous
-- attendance enrollment or widening the incident-recovery activation cutoff.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

-- Exclude worker/reconciler and operator activation during this transactional
-- upgrade. No cron job, cutoff, canonical record or attendance revision changes.
SELECT pg_catalog.pg_advisory_xact_lock(
 pg_catalog.hashtextextended('tt-auto-clockout-control',0));
DO $gate$
BEGIN
 IF private.tt_auto_clockout_mode() NOT IN ('active','suspended') THEN
  RAISE EXCEPTION 'Invalid scheduler mode; review before migration' USING ERRCODE='55000';
 END IF;
END;
$gate$;

ALTER TABLE private.tt_auto_clockout_config
 ADD COLUMN activation_epoch uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid();
ALTER TABLE private.tt_auto_clockout_sessions
 ADD COLUMN enrollment_epoch uuid,
 ADD COLUMN enrollment_clock_in_at timestamptz,
 ADD CONSTRAINT tt_auto_clockout_enrollment_pair CHECK (
  (enrollment_epoch IS NULL AND enrollment_clock_in_at IS NULL)
  OR (enrollment_epoch IS NOT NULL AND enrollment_clock_in_at IS NOT NULL
      AND pg_catalog.isfinite(enrollment_clock_in_at)));

-- A new activation (including suspension/reactivation on the same day) must
-- not inherit the exception to the previous activation's cutoff.
CREATE FUNCTION private.tt_auto_clockout_rotate_epoch()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $epoch$
BEGIN
 NEW.activation_epoch:=pg_catalog.gen_random_uuid();
 RETURN NEW;
END;
$epoch$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_rotate_epoch()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tt_auto_clockout_rotate_epoch
 BEFORE UPDATE OF activated_at ON private.tt_auto_clockout_config
 FOR EACH ROW WHEN (OLD.activated_at IS DISTINCT FROM NEW.activated_at)
 EXECUTE FUNCTION private.tt_auto_clockout_rotate_epoch();

-- Existing live enrollment is proof only if its original scheduler start
-- was inside the current window and it was enrolled after that cutoff.
-- Do not mark historical/terminal rows or revive a cancelled record.
UPDATE private.tt_auto_clockout_sessions s
 SET enrollment_epoch=c.activation_epoch,enrollment_clock_in_at=s.clock_in_at
 FROM private.tt_auto_clockout_config c
 WHERE c.config_key='default' AND private.tt_auto_clockout_mode()='active'
 AND s.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
 AND pg_catalog.isfinite(s.clock_in_at)
 AND s.clock_in_at>=c.activated_at AND s.created_at>=c.activated_at
 AND s.clock_in_at<=pg_catalog.clock_timestamp()
 AND private.tt_auto_clockout_employee_eligible(s.workspace_id,s.board_id,s.employee_id);

-- A correction crossing the cutoff before initial asynchronous enrollment
-- must fail closed, rather than silently leaving an ineligible open record.
-- This is a read-only guard in the signed admin path, not scheduler enrollment.
CREATE FUNCTION private.tt_check_active_clockin_correction(
 p_workspace uuid,p_board uuid,p_before jsonb,p_after jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $guard$
DECLARE r record; v_cutoff timestamptz; v_epoch uuid; v_employee uuid;
BEGIN
 IF private.tt_auto_clockout_mode() IS DISTINCT FROM 'active' THEN RETURN; END IF;
 SELECT activated_at,activation_epoch INTO v_cutoff,v_epoch
 FROM private.tt_auto_clockout_config WHERE config_key='default';
 FOR r IN
  SELECT b.elem AS prior,a.elem AS corrected
  FROM pg_catalog.jsonb_array_elements(p_before) b(elem)
  JOIN pg_catalog.jsonb_array_elements(p_after) a(elem)
   ON a.elem->>'id'=b.elem->>'id' AND a.elem->>'ownerId'=b.elem->>'ownerId'
  WHERE (b.elem->'clockOut' IS NULL OR b.elem->'clockOut'='null'::jsonb)
    AND (a.elem->'clockOut' IS NULL OR a.elem->'clockOut'='null'::jsonb)
    AND a.elem#>>'{clockIn,timestamp}' IS DISTINCT FROM b.elem#>>'{clockIn,timestamp}'
 LOOP
  IF COALESCE(r.prior->>'ownerId','') !~* '^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN CONTINUE; END IF;
  v_employee:=pg_catalog.substr(r.prior->>'ownerId',7)::uuid;
  IF (r.prior#>>'{clockIn,timestamp}')::timestamptz>=v_cutoff
   AND (r.corrected#>>'{clockIn,timestamp}')::timestamptz<v_cutoff
   AND private.tt_auto_clockout_employee_eligible(p_workspace,p_board,v_employee)
   AND NOT EXISTS (
    SELECT 1 FROM private.tt_auto_clockout_sessions q
    WHERE q.workspace_id=p_workspace AND q.board_id=p_board
     AND q.employee_id=v_employee AND q.record_id::text=r.prior->>'id'
     AND q.enrollment_epoch=v_epoch AND q.enrollment_clock_in_at>=v_cutoff
     AND q.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
   ) THEN
   RAISE EXCEPTION 'Wait for automatic clock-out enrollment before correcting an active clock-in before the activation cutoff; refresh and retry'
    USING ERRCODE='55000';
  END IF;
 END LOOP;
END;
$guard$;
REVOKE ALL ON FUNCTION private.tt_check_active_clockin_correction(uuid,uuid,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

-- Apply guarded patches to the deployed definitions rather than replacing
-- the tested worker/OT/audit/GPS/projection implementation wholesale.
DO $patch$
DECLARE d text; old text; replacement text; target text;
BEGIN
 FOR target,old,replacement IN VALUES
 ('private.tt_reconcile_auto_clockout_sessions()',
  'v_activated_at timestamptz; v_added',
  'v_activated_at timestamptz; v_epoch uuid; v_added'),
 ('private.tt_reconcile_auto_clockout_sessions()',
  'SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config',
  'SELECT activated_at,activation_epoch INTO v_activated_at,v_epoch FROM private.tt_auto_clockout_config'),
 ('private.tt_reconcile_auto_clockout_sessions()',
  $old$workspace_id,board_id,record_id,employee_id,clock_in_at,threshold_at,status)
   VALUES(r.workspace_id,r.board_id,v_id,v_employee,v_start,
    private.tt_auto_clockout_threshold(v_start),'MONITORING')$old$,
  $new$workspace_id,board_id,record_id,employee_id,clock_in_at,threshold_at,status,
    enrollment_epoch,enrollment_clock_in_at)
   VALUES(r.workspace_id,r.board_id,v_id,v_employee,v_start,
    private.tt_auto_clockout_threshold(v_start),'MONITORING',v_epoch,v_start)$new$),
 ('private.tt_reconcile_auto_clockout_sessions()',
  $old$clock_in_at=EXCLUDED.clock_in_at,threshold_at=EXCLUDED.threshold_at,
     status='MONITORING'$old$,
  $new$clock_in_at=EXCLUDED.clock_in_at,threshold_at=EXCLUDED.threshold_at,
     enrollment_epoch=EXCLUDED.enrollment_epoch,
     enrollment_clock_in_at=EXCLUDED.enrollment_clock_in_at,
     status='MONITORING'$new$),
 ('private.tt_reconcile_auto_clockout_sessions()',
  $old$WHERE q.status='CANCELLED'
     AND q.last_error='Suspended for controlled incident recovery'
     AND q.workspace_id=EXCLUDED.workspace_id
     AND q.employee_id=EXCLUDED.employee_id;$old$,
  $new$WHERE q.workspace_id=EXCLUDED.workspace_id
     AND q.employee_id=EXCLUDED.employee_id
     AND ((q.status='CANCELLED' AND q.last_error='Suspended for controlled incident recovery')
       OR (q.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
           AND q.enrollment_epoch IS DISTINCT FROM EXCLUDED.enrollment_epoch));$new$),
 ('private.tt_process_auto_clockouts()',
  'v_activated_at timestamptz;',
  'v_activated_at timestamptz; v_epoch uuid;'),
 ('private.tt_process_auto_clockouts()',
  'SELECT activated_at INTO v_activated_at FROM private.tt_auto_clockout_config',
  'SELECT activated_at,activation_epoch INTO v_activated_at,v_epoch FROM private.tt_auto_clockout_config'),
 ('private.tt_process_auto_clockouts()',
  $old$SELECT workspace_id,board_id,record_id,employee_id
    FROM private.tt_auto_clockout_sessions
    WHERE status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
      AND threshold_at<=v_now AND clock_in_at>=v_activated_at
    ORDER BY last_evaluated_at NULLS FIRST,COALESCE(overtime_cutoff_at,threshold_at),record_id$old$,
  $new$WITH canonical_open AS MATERIALIZED (
      SELECT e.workspace_id,x.elem->>'id' AS record_id,x.elem->>'ownerId' AS owner_id,
        CASE WHEN pg_catalog.pg_input_is_valid(x.elem#>>'{clockIn,timestamp}','timestamp with time zone')
         THEN (x.elem#>>'{clockIn,timestamp}')::timestamptz END AS clock_in_at
      FROM public.module_state_entries e
      JOIN public.work_boards b ON b.workspace_id=e.workspace_id
       AND b.id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(e.value::jsonb->'records')='array'
          THEN e.value::jsonb->'records' ELSE '[]'::jsonb END) x(elem)
      WHERE e.module_id='time-tracker' AND e.state_key='timetracker.attendance.v1'
       AND e.scope='shared' AND e.owner_key='*'
       AND (x.elem->'clockOut' IS NULL OR x.elem->'clockOut'='null'::jsonb)
    )
    SELECT s.workspace_id,s.board_id,s.record_id,s.employee_id
    FROM private.tt_auto_clockout_sessions s
    LEFT JOIN canonical_open a ON a.workspace_id=s.workspace_id
      AND a.record_id=s.record_id::text AND a.owner_id='cloud:'||s.employee_id::text
    WHERE s.status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
      AND s.enrollment_epoch=v_epoch AND s.enrollment_clock_in_at>=v_activated_at
      AND (s.threshold_at<=v_now OR a.clock_in_at IS DISTINCT FROM s.clock_in_at)
    ORDER BY s.last_evaluated_at NULLS FIRST,COALESCE(s.overtime_cutoff_at,s.threshold_at),s.record_id$new$),
 ('private.tt_process_auto_clockouts()',
  $old$IF v_clock_in IS NULL OR NOT pg_catalog.isfinite(v_clock_in) OR v_clock_in<v_activated_at THEN$old$,
  $new$IF v_clock_in IS NULL OR NOT pg_catalog.isfinite(v_clock_in)
       OR v_clock_in>pg_catalog.clock_timestamp()
       OR v_session.enrollment_epoch IS DISTINCT FROM v_epoch
       OR v_session.enrollment_clock_in_at IS NULL
       OR v_session.enrollment_clock_in_at<v_activated_at THEN$new$),
 ('private.tt_process_auto_clockouts()',
  $old$WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        EXIT;
      END IF;

      v_threshold:=v_session.threshold_at;$old$,
  $new$WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
      END IF;

      -- Use the locked canonical time in this same evaluation; recheck OT
      -- before closing and never wait for the superseded threshold.
      v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);$new$),
 ('public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint)',
  $old$v_updated_state := pg_catalog.jsonb_set(v_state,ARRAY['records'],v_updated_records,true);$old$,
  $new$IF p_action IN ('edit','bulk-edit') THEN
    PERFORM private.tt_check_active_clockin_correction(
      v_workspace,p_board_id,v_before_records,v_after_records);
  END IF;
  v_updated_state := pg_catalog.jsonb_set(v_state,ARRAY['records'],v_updated_records,true);$new$),
 ('private.tt_activate_isolated_auto_clockout(date,integer)',
  $old$AND q.employee_id=v_employees[i] AND q.clock_in_at>=v_cutoff$old$,
  $new$AND q.employee_id=v_employees[i] AND q.clock_in_at>=v_cutoff
    AND q.enrollment_epoch=(SELECT activation_epoch FROM private.tt_auto_clockout_config
      WHERE config_key='default')
    AND q.enrollment_clock_in_at>=v_cutoff$new$),
 ('public.timetracker_auto_clockout_snapshot(uuid)',
  $old$'recordId',s.record_id::text,$old$,
  $new$'recordId',s.record_id::text,'clockInAt',s.clock_in_at,$new$),
 ('public.timetracker_auto_clockout_snapshot(uuid)',
  'v_record_id text;',
  'v_record_id text; v_clock_in timestamptz;'),
 ('public.timetracker_auto_clockout_snapshot(uuid)',
  $old$SELECT elem->>'id' INTO v_record_id$old$,
  $new$SELECT elem->>'id',(elem#>>'{clockIn,timestamp}')::timestamptz INTO v_record_id,v_clock_in$new$),
 ('public.timetracker_auto_clockout_snapshot(uuid)',
  $old$AND s.employee_id=v_actor AND s.record_id=v_record_id::uuid;$old$,
  $new$AND s.employee_id=v_actor AND s.record_id=v_record_id::uuid
      -- Never advertise a stale deadline or foreground pending action.
      AND s.clock_in_at=v_clock_in;$new$)
 LOOP
  d:=pg_catalog.pg_get_functiondef(target::regprocedure);
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Clock-in correction baseline differs: %',target USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(d,old,replacement);
 END LOOP;
END;
$patch$;

REVOKE ALL ON FUNCTION private.tt_reconcile_auto_clockout_sessions() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts() FROM PUBLIC,anon,authenticated,service_role;
-- Administrative time corrections preserve authentic server no-GPS evidence.
-- The exception is confined to an already completed session with the original
-- automatic closure evidence and matching immutable audit in this workspace.
-- Do not relax employee GPS requirements or create a no-GPS closure via edit.
CREATE FUNCTION private.tt_is_server_clockout_evidence(p_workspace uuid,p_record jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $evidence$
 SELECT COALESCE(
  pg_catalog.jsonb_typeof(p_record->'clockOut')='object'
  AND p_record#>'{clockOut,automatic}'='true'::jsonb
  AND p_record#>>'{clockOut,reason}' IN (
    'nine_hour_threshold_grace_expired','approved_overtime_ended')
  AND p_record#>>'{clockOut,geo,status}'='not_captured'
  AND p_record#>>'{clockOut,geo,source}'='server-auto-clockout'
  AND NOT (p_record#>'{clockOut,geo}' ?| ARRAY['latitude','longitude','accuracy'])
  AND EXISTS (
   SELECT 1 FROM public.timetracker_attendance_mutation_audit a
   WHERE a.workspace_id=p_workspace
    AND a.board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
    AND a.record_id=p_record->>'id'
    AND 'cloud:'||a.actor_id::text=p_record->>'ownerId'
    AND a.action='clock-out' AND a.source='automatic'
    AND CASE WHEN pg_catalog.pg_input_is_valid(
      p_record#>>'{clockOut,geo,generatedAt}','timestamp with time zone')
      THEN pg_catalog.date_trunc('milliseconds',a.committed_at)=
       (p_record#>>'{clockOut,geo,generatedAt}')::timestamptz
      ELSE false END
  ),false);
$evidence$;
REVOKE ALL ON FUNCTION private.tt_is_server_clockout_evidence(uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

DO $gps_patch$
DECLARE d text; old text; replacement text; target text;
BEGIN
 FOR target,old,replacement IN VALUES
 ('private.tt_attendance_admin_apply_patch(jsonb,jsonb,uuid,uuid)',
  $old$pg_catalog.jsonb_typeof(v_clock_out->'geo')<>'object'$old$,
  $new$pg_catalog.jsonb_typeof(v_clock_out->'geo') IS DISTINCT FROM 'object'$new$),
 ('private.tt_attendance_admin_apply_patch(jsonb,jsonb,uuid,uuid)',
  $old$v_clock_out#>>'{geo,status}'<>'captured'$old$,
  $new$v_clock_out#>>'{geo,status}' IS DISTINCT FROM 'captured'$new$),
 ('private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)',
  $old$pg_catalog.jsonb_typeof(v_out_geo)<>'object'$old$,
  $new$pg_catalog.jsonb_typeof(v_out_geo) IS DISTINCT FROM 'object'$new$),
 ('private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)',
  $old$v_out_geo->>'status'<>'captured'$old$,
  $new$v_out_geo->>'status' IS DISTINCT FROM 'captured'$new$),
 ('private.tt_attendance_admin_apply_patch(jsonb,jsonb,uuid,uuid)',
  $old$AND COALESCE(v_clock_out#>>'{geo,source}','')='admin-manual-clockout'))) THEN$old$,
  $new$AND COALESCE(v_clock_out#>>'{geo,source}','')='admin-manual-clockout')))
     AND NOT (
       private.tt_is_server_clockout_evidence(p_workspace,p_record)
       AND v_record->>'ownerId'=p_record->>'ownerId'
       AND v_clock_out->'geo'=p_record#>'{clockOut,geo}'
       AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) k
        WHERE k NOT IN ('clockInAt','clockOutAt','creditedMsOverride')
       )
     ) THEN$new$),
 ('private.tt_attendance_admin_sync_projection(uuid,uuid,uuid,jsonb,bigint)',
  $old$AND COALESCE(v_out_geo->>'source','')='admin-manual-clockout')) THEN$old$,
  $new$AND COALESCE(v_out_geo->>'source','')='admin-manual-clockout')
       AND NOT private.tt_is_server_clockout_evidence(p_workspace_id,p_record)) THEN$new$)
 LOOP
  d:=pg_catalog.pg_get_functiondef(target::regprocedure);
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'Admin GPS correction baseline differs: %',target USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(d,old,replacement);
 END LOOP;
END;
$gps_patch$;

COMMIT;
