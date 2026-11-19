-- CP-TT-AUTO-CLOCKOUT-01
-- Conditional 9-hour credited-work expiration, 30-minute grace, approved OT extension.
-- Existing active sessions are intentionally NOT backfilled. Monitoring begins
-- with Clock-In records created after this migration's activation timestamp.

DO $gate$
BEGIN
  IF to_regclass('public.module_state_entries') IS NULL
     OR to_regclass('public.timetracker_ot_requests') IS NULL
     OR to_regclass('public.timetracker_attendance_mutation_audit') IS NULL
     OR to_regclass('private.tt_attendance_board_projection') IS NULL
     OR to_regclass('cron.job') IS NULL
     OR to_regprocedure('private.tt_attendance_credited_ms(timestamptz,timestamptz)') IS NULL
     OR to_regprocedure('public.timetracker_ot_require_scope(uuid)') IS NULL
     OR to_regprocedure('public.module_state_invariants_valid(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'CP-TT-AUTO-CLOCKOUT-01 prerequisites are not installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.work_boards
    WHERE id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
      AND name='TimeTracker Attendance' AND status='active'
      AND archived_at IS NULL AND trashed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing TimeTracker Attendance board is unavailable';
  END IF;
END;
$gate$;

ALTER TABLE public.timetracker_attendance_mutation_audit
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual','automatic'));

CREATE TABLE private.tt_auto_clockout_config (
  config_key text PRIMARY KEY CHECK (config_key='default'),
  activated_at timestamptz NOT NULL
);
ALTER TABLE private.tt_auto_clockout_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_auto_clockout_config FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tt_auto_clockout_config FROM PUBLIC,anon,authenticated;
INSERT INTO private.tt_auto_clockout_config(config_key,activated_at)
VALUES ('default',clock_timestamp())
ON CONFLICT (config_key) DO NOTHING;

CREATE TABLE private.tt_auto_clockout_sessions (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  board_id uuid NOT NULL REFERENCES public.work_boards(id),
  record_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  clock_in_at timestamptz NOT NULL,
  threshold_at timestamptz NOT NULL,
  grace_started_at timestamptz,
  grace_deadline_at timestamptz,
  overtime_cutoff_at timestamptz,
  status text NOT NULL DEFAULT 'MONITORING'
    CHECK (status IN ('MONITORING','GRACE','OVERTIME','COMPLETED','CANCELLED','ERROR')),
  last_evaluated_at timestamptz,
  completed_at timestamptz,
  clock_out_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(board_id,record_id),
  CHECK (threshold_at>=clock_in_at),
  CHECK (grace_deadline_at IS NULL OR grace_deadline_at>=threshold_at),
  CHECK (overtime_cutoff_at IS NULL OR overtime_cutoff_at>threshold_at)
);
CREATE INDEX tt_auto_clockout_due_idx
  ON private.tt_auto_clockout_sessions(status,threshold_at)
  WHERE status IN ('MONITORING','GRACE','OVERTIME','ERROR');
CREATE INDEX tt_auto_clockout_employee_idx
  ON private.tt_auto_clockout_sessions(workspace_id,employee_id,clock_in_at DESC);
ALTER TABLE private.tt_auto_clockout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tt_auto_clockout_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tt_auto_clockout_sessions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tt_auto_clockout_threshold(p_clock_in timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path=''
AS $function$
DECLARE
  v_low_ms integer:=0;
  v_high_ms integer:=172800000; -- 48 hours, safely above nine credited hours.
  v_mid_ms integer;
BEGIN
  IF p_clock_in IS NULL THEN
    RAISE EXCEPTION 'Clock-In timestamp is required' USING ERRCODE='22023';
  END IF;
  IF private.tt_attendance_credited_ms(
       p_clock_in,p_clock_in+(v_high_ms*INTERVAL '1 millisecond'))<32400000 THEN
    RAISE EXCEPTION 'Nine-hour attendance threshold is outside the supported window'
      USING ERRCODE='22023';
  END IF;
  WHILE v_low_ms<v_high_ms LOOP
    v_mid_ms:=v_low_ms+((v_high_ms-v_low_ms)/2);
    IF private.tt_attendance_credited_ms(
         p_clock_in,p_clock_in+(v_mid_ms*INTERVAL '1 millisecond'))>=32400000 THEN
      v_high_ms:=v_mid_ms;
    ELSE
      v_low_ms:=v_mid_ms+1;
    END IF;
  END LOOP;
  RETURN p_clock_in+(v_low_ms*INTERVAL '1 millisecond');
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_threshold(timestamptz)
  FROM PUBLIC,anon,authenticated;

-- Update the already-existing private attendance-board projection for an automatic
-- clock-out. No fabricated GPS coordinates are written: the evidence explicitly
-- records that no live browser GPS sensor was available to the server scheduler.
CREATE OR REPLACE FUNCTION private.tt_auto_clockout_project(
  p_board_id uuid,
  p_workspace_id uuid,
  p_employee_id uuid,
  p_record jsonb,
  p_revision bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_projection private.tt_attendance_board_projection%ROWTYPE;
  v_clock_out timestamptz;
  v_out_geo jsonb;
  v_credited bigint;
  v_hours numeric;
  v_creator uuid;
  v_column record;
  v_value jsonb;
  v_label text;
  v_label_id text;
  v_column_count integer;
BEGIN
  IF p_record IS NULL OR pg_catalog.jsonb_typeof(p_record)<>'object'
     OR p_record->>'ownerId' IS DISTINCT FROM 'cloud:'||p_employee_id::text
     OR p_record#>>'{clockOut,automatic}' IS DISTINCT FROM 'true'
     OR COALESCE(p_record#>>'{clockOut,reason}','') NOT IN (
       'nine_hour_threshold_grace_expired','approved_overtime_ended')
  THEN
    RAISE EXCEPTION 'Automatic attendance projection source is invalid'
      USING ERRCODE='22023';
  END IF;

  v_clock_out:=(p_record#>>'{clockOut,timestamp}')::timestamptz;
  v_out_geo:=p_record#>'{clockOut,geo}';
  IF v_clock_out IS NULL OR pg_catalog.jsonb_typeof(v_out_geo)<>'object'
     OR v_out_geo->>'status'<>'not_captured'
     OR v_out_geo->>'source'<>'server-auto-clockout'
  THEN
    RAISE EXCEPTION 'Automatic clock-out evidence contract is invalid'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_projection
  FROM private.tt_attendance_board_projection
  WHERE board_id=p_board_id AND record_id=(p_record->>'id')::uuid
  FOR UPDATE;
  IF NOT FOUND OR v_projection.workspace_id<>p_workspace_id
     OR v_projection.employee_id<>p_employee_id
     OR v_projection.clock_out_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Active attendance board projection is missing or already closed'
      USING ERRCODE='40001';
  END IF;

  v_credited:=private.tt_attendance_credited_ms(v_projection.clock_in_at,v_clock_out);
  v_hours:=pg_catalog.round(v_credited::numeric/3600000,2);
  UPDATE private.tt_attendance_board_projection
  SET source_revision=p_revision,
      clock_out_at=v_clock_out,
      clock_out_geo=v_out_geo,
      clock_out_location=pg_catalog.left(
        COALESCE(p_record#>>'{clockOut,location}',''),100),
      credited_ms=v_credited,
      modified_at=pg_catalog.clock_timestamp()
  WHERE board_id=p_board_id AND record_id=v_projection.record_id;

  SELECT created_by INTO v_creator
  FROM public.work_boards
  WHERE id=p_board_id AND workspace_id=p_workspace_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'Attendance board technical owner is unavailable'
      USING ERRCODE='23503';
  END IF;

  UPDATE public.work_board_items
  SET status='done',updated_by=v_creator,updated_at=pg_catalog.clock_timestamp()
  WHERE id=v_projection.board_item_id AND board_id=p_board_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance board item is missing'
      USING ERRCODE='23503';
  END IF;

  SELECT count(*) INTO v_column_count
  FROM public.work_board_columns
  WHERE board_id=p_board_id
    AND name IN ('Source Record ID','Source Revision','Sync State','Attendance Ref',
                 'Attendance Date','Hours Total','Attendance Status','Shift Ref');
  IF v_column_count<>8 THEN
    RAISE EXCEPTION 'Attendance board typed-column contract drift'
      USING ERRCODE='23503';
  END IF;

  FOR v_column IN
    SELECT id,name,config FROM public.work_board_columns
    WHERE board_id=p_board_id
      AND name IN ('Source Record ID','Source Revision','Sync State','Attendance Ref',
                   'Attendance Date','Hours Total','Attendance Status','Shift Ref')
  LOOP
    v_value:=NULL;
    v_label:=NULL;
    CASE v_column.name
      WHEN 'Source Revision' THEN v_value:=pg_catalog.to_jsonb(p_revision);
      WHEN 'Sync State' THEN v_label:='Synchronized';
      WHEN 'Hours Total' THEN v_value:=pg_catalog.to_jsonb(v_hours);
      WHEN 'Attendance Status' THEN v_label:='Done';
      ELSE NULL;
    END CASE;
    IF v_label IS NOT NULL THEN
      SELECT e->>'id' INTO v_label_id
      FROM pg_catalog.jsonb_array_elements(v_column.config->'labels') e
      WHERE e->>'name'=v_label
      LIMIT 1;
      IF v_label_id IS NULL THEN
        RAISE EXCEPTION 'Attendance board label contract drift'
          USING ERRCODE='23503';
      END IF;
      v_value:=pg_catalog.to_jsonb(v_label_id);
    END IF;
    IF v_value IS NOT NULL THEN
      INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
      VALUES(v_projection.board_item_id,v_column.id,v_value,v_creator)
      ON CONFLICT(item_id,column_id) DO UPDATE SET
        value=EXCLUDED.value,
        updated_by=EXCLUDED.updated_by,
        updated_at=pg_catalog.clock_timestamp();
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_project(uuid,uuid,uuid,jsonb,bigint)
  FROM PUBLIC,anon,authenticated;

-- The trigger initializes monitoring in the same transaction as Clock-In.
-- The activation timestamp deliberately excludes attendance sessions already open
-- when this feature is installed.
CREATE OR REPLACE FUNCTION private.tt_auto_clockout_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_board_id uuid;
  v_activated_at timestamptz;
  v_record jsonb;
  v_record_id uuid;
  v_employee_id uuid;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
BEGIN
  IF NEW.module_id<>'time-tracker'
     OR NEW.state_key<>'timetracker.attendance.v1'
     OR NEW.scope<>'shared'
     OR NEW.owner_key<>'*' THEN
    RETURN NEW;
  END IF;

  SELECT activated_at INTO v_activated_at
  FROM private.tt_auto_clockout_config
  WHERE config_key='default';
  SELECT id INTO v_board_id
  FROM public.work_boards
  WHERE id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
    AND workspace_id=NEW.workspace_id
    AND name='TimeTracker Attendance'
    AND status='active' AND archived_at IS NULL AND trashed_at IS NULL;
  IF v_board_id IS NULL OR v_activated_at IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_record IN
    SELECT elem
    FROM pg_catalog.jsonb_array_elements(
      COALESCE(NEW.value::jsonb->'records','[]'::jsonb)) AS records(elem)
  LOOP
    IF COALESCE(v_record->>'id','') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(v_record->>'ownerId','') !~*
         '^cloud:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      CONTINUE;
    END IF;
    v_record_id:=(v_record->>'id')::uuid;
    v_employee_id:=(pg_catalog.substr(v_record->>'ownerId',7))::uuid;

    IF v_record->'clockOut' IS NULL OR v_record->'clockOut'='null'::jsonb THEN
      BEGIN
        v_clock_in:=(v_record#>>'{clockIn,timestamp}')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      IF v_clock_in IS NULL OR v_clock_in<v_activated_at THEN
        CONTINUE;
      END IF;
      INSERT INTO private.tt_auto_clockout_sessions(
        workspace_id,board_id,record_id,employee_id,clock_in_at,threshold_at,status)
      VALUES(NEW.workspace_id,v_board_id,v_record_id,v_employee_id,v_clock_in,
        private.tt_auto_clockout_threshold(v_clock_in),'MONITORING')
      ON CONFLICT(board_id,record_id) DO NOTHING;
    ELSE
      BEGIN
        v_clock_out:=NULLIF(v_record#>>'{clockOut,timestamp}','')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_clock_out:=clock_timestamp();
      END;
      UPDATE private.tt_auto_clockout_sessions
      SET status='COMPLETED',
          completed_at=COALESCE(v_clock_out,clock_timestamp()),
          clock_out_reason=COALESCE(v_record#>>'{clockOut,reason}','manual_clock_out'),
          last_evaluated_at=clock_timestamp(),
          last_error=NULL,
          updated_at=clock_timestamp()
      WHERE board_id=v_board_id AND record_id=v_record_id
        AND status NOT IN ('COMPLETED','CANCELLED');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_sync()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS tt_auto_clockout_sync ON public.module_state_entries;
CREATE TRIGGER tt_auto_clockout_sync
AFTER INSERT OR UPDATE OF value ON public.module_state_entries
FOR EACH ROW EXECUTE FUNCTION private.tt_auto_clockout_sync();

-- The existing OT submit/decision RPCs acquire the same per-employee advisory
-- lock before writes. The worker takes that lock before locking OT rows, avoiding
-- approval/expiration races without adding another user-facing gate.
CREATE OR REPLACE FUNCTION public.timetracker_ot_submit(
  p_board_id uuid,p_date date,p_start time without time zone,
  p_end time without time zone,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_ws uuid;
  v_actor uuid:=auth.uid();
  v_today date;
  v_mins integer;
  v_reason text:=trim(coalesce(p_reason,''));
  v_id uuid;
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_ws::text||':time-tracker:attendance:'||v_actor::text,0));
  v_today:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  IF p_date IS NULL OR p_date<v_today-30 OR p_date>v_today+7 OR
     p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR
     length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Invalid OT date, interval or reason' USING ERRCODE='22023';
  END IF;
  v_mins:=(extract(epoch FROM p_end-p_start)/60)::integer;
  IF v_mins NOT BETWEEN 30 AND 360 THEN
    RAISE EXCEPTION 'OT interval must be 30 to 360 minutes' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.timetracker_ot_requests
    (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason)
  VALUES(v_ws,v_actor,p_date,p_start,p_end,v_mins,v_reason)
  RETURNING id INTO v_id;
  INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event)
  VALUES(v_ws,v_id,v_actor,'submitted');
  RETURN jsonb_build_object('id',v_id::text,'workspaceId',v_ws::text,
    'ownerId','cloud:'||v_actor::text,'status','Submitted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.timetracker_ot_decide(
  p_board_id uuid,p_request_id uuid,p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_ws uuid;
  v_actor uuid:=auth.uid();
  v_owner uuid;
  v_status text;
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  IF NOT public.apsyntra_role_is_bootstrap() THEN
    RAISE EXCEPTION 'Bootstrap administrator OT approval required' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('Approved','Rejected') OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid OT decision' USING ERRCODE='22023';
  END IF;
  -- Read owner without a row lock, acquire the shared employee lock, then lock
  -- and revalidate the request. This ordering prevents worker/approval deadlocks.
  SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
  WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_ws::text||':time-tracker:attendance:'||v_owner::text,0));
  SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
  WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
  END IF;
  IF v_owner=v_actor THEN
    RAISE EXCEPTION 'Self-approval is not permitted' USING ERRCODE='42501';
  END IF;
  UPDATE public.timetracker_ot_requests SET status=p_decision,
    decided_by=v_actor,decided_at=clock_timestamp()
  WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
  RETURNING status INTO v_status;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Concurrent OT decision conflict' USING ERRCODE='PT409';
  END IF;
  INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event)
  VALUES(v_ws,p_request_id,v_actor,lower(p_decision));
  RETURN jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
    'status',v_status,'decidedBy',v_actor::text);
END;
$function$;

-- Database worker: no browser timer, user tab, or GPS device is required.
-- A server-generated closure explicitly records GPS as not captured.
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
    WHERE status IN ('MONITORING','GRACE','OVERTIME','ERROR')
    ORDER BY threshold_at,record_id
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
      AND status IN ('MONITORING','GRACE','OVERTIME','ERROR')
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
        SET status='CANCELLED',last_evaluated_at=v_now,
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
        SET status='CANCELLED',last_evaluated_at=v_now,
            last_error='Attendance session no longer exists',
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        CONTINUE;
      END IF;

      IF v_record->'clockOut' IS NOT NULL
         AND v_record->'clockOut'<>'null'::jsonb THEN
        UPDATE private.tt_auto_clockout_sessions
        SET status='COMPLETED',
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
            status='MONITORING',last_evaluated_at=v_now,last_error=NULL,
            updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        CONTINUE;
      END IF;

      v_threshold:=v_session.threshold_at;
      v_grace_deadline:=v_threshold+INTERVAL '30 minutes';
      v_cutoff:=v_threshold;
      v_has_ot:=false;

      -- An approved interval must continuously cover the current cutoff.
      -- Its approval must occur before the nine-hour threshold or within the
      -- current grace/overtime window; late approval cannot revive an expired session.
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
             (v_cutoff=v_threshold AND v_ot_start<=v_grace_deadline AND v_ot_end>v_threshold)
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
          v_clock_out_at:=v_grace_deadline;
        ELSE
          v_status:='GRACE';
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

        PERFORM private.tt_auto_clockout_project(
          v_session.board_id,v_session.workspace_id,v_session.employee_id,
          v_record,v_new_revision);

        UPDATE private.tt_auto_clockout_sessions
        SET status='COMPLETED',grace_started_at=v_threshold,
            grace_deadline_at=v_grace_deadline,
            overtime_cutoff_at=CASE WHEN v_has_ot THEN v_cutoff ELSE NULL END,
            last_evaluated_at=v_now,completed_at=v_now,
            clock_out_reason=v_reason,last_error=NULL,updated_at=v_now
        WHERE board_id=v_session.board_id AND record_id=v_session.record_id;
        v_processed:=v_processed+1;
      ELSE
        UPDATE private.tt_auto_clockout_sessions
        SET status=v_status,
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
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts()
  FROM PUBLIC,anon,authenticated;

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
      'nextAt',CASE
        WHEN s.status='MONITORING' THEN s.threshold_at
        WHEN s.status='GRACE' THEN s.grace_deadline_at
        WHEN s.status='OVERTIME' THEN s.overtime_cutoff_at
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

-- The existing Supabase Cron extension is already active in this project.
-- Replace only this feature's named job; leave all other scheduled jobs untouched.
DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname='tt-auto-clockout-processor'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'tt-auto-clockout-processor',
    '30 seconds',
    'SELECT private.tt_process_auto_clockouts();');
END;
$cron$;

COMMENT ON TABLE private.tt_auto_clockout_sessions IS
  'Durable TimeTracker nine-hour threshold, grace, approved-overtime and completion state.';
COMMENT ON FUNCTION private.tt_process_auto_clockouts() IS
  'Server-side idempotent automatic Clock-Out processor invoked by the dedicated pg_cron job.';
COMMENT ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid) IS
  'Signed actor-bound read of the current attendance session automatic Clock-Out schedule.';
