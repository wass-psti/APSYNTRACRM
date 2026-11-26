-- Minimal, isolated prerequisites for the staged duration-OT migration.
-- Loaded only by cp-tt-bootstrap-ot02-signed-disposable.sh in a fresh PG17 container.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END;
$roles$;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.module_state_entries(
 workspace_id uuid NOT NULL,
 module_id text NOT NULL,
 state_key text NOT NULL,
 scope text NOT NULL,
 owner_key text NOT NULL,
 value text NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 updated_by uuid,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,module_id,state_key,scope,owner_key)
);

CREATE TABLE private.tt_auto_clockout_sessions(
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL,
 record_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 status text NOT NULL,
 threshold_at timestamptz NOT NULL,
 clock_in_at timestamptz NOT NULL,
 overtime_cutoff_at timestamptz,
 last_evaluated_at timestamptz,
 enrollment_epoch uuid,
 enrollment_clock_in_at timestamptz,
 PRIMARY KEY(board_id,record_id)
);

CREATE FUNCTION private.tt_role_in_workspace(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT m.role
 FROM public.module_role_assignments m
 JOIN public.workspace_members wm ON wm.user_id=m.user_id
  AND wm.workspace_id=p_workspace AND wm.active
 JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
 WHERE m.user_id=p_user AND m.module_id='time-tracker' AND m.enabled
$role$;
REVOKE ALL ON FUNCTION private.tt_role_in_workspace(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tt_auto_clockout_employee_eligible(
 p_workspace uuid,p_board uuid,p_employee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $eligible$
 SELECT EXISTS(
  SELECT 1 FROM public.work_boards b
  JOIN public.workspace_members wm ON wm.workspace_id=b.workspace_id
   AND wm.user_id=p_employee AND wm.active
  JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
  WHERE b.id=p_board AND b.workspace_id=p_workspace
   AND private.tt_role_in_workspace(p_employee,p_workspace)
    IN ('Employee','HR','Supervisor','System Admin')
 )
$eligible$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_employee_eligible(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tt_attendance_credited_ms(p_in timestamptz,p_out timestamptz)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $credited$
DECLARE
 v_day date;
 v_last_day date;
 v_lunch_start timestamptz;
 v_lunch_end timestamptz;
 v_overlap_start timestamptz;
 v_overlap_end timestamptz;
 v_elapsed bigint;
 v_deducted bigint:=0;
BEGIN
 IF p_in IS NULL OR p_out IS NULL OR p_out<=p_in THEN RETURN 0; END IF;
 v_elapsed:=(extract(epoch FROM p_out-p_in)*1000)::bigint;
 v_day:=(p_in AT TIME ZONE 'Asia/Manila')::date;
 v_last_day:=(p_out AT TIME ZONE 'Asia/Manila')::date;
 WHILE v_day<=v_last_day LOOP
  v_lunch_start:=(v_day::timestamp+INTERVAL '12 hours') AT TIME ZONE 'Asia/Manila';
  v_lunch_end:=v_lunch_start+INTERVAL '1 hour';
  v_overlap_start:=GREATEST(p_in,v_lunch_start);
  v_overlap_end:=LEAST(p_out,v_lunch_end);
  IF v_overlap_end>v_overlap_start THEN
   v_deducted:=v_deducted+(extract(epoch FROM v_overlap_end-v_overlap_start)*1000)::bigint;
  END IF;
  v_day:=v_day+1;
 END LOOP;
 RETURN GREATEST(0,v_elapsed-v_deducted);
END;
$credited$;
REVOKE ALL ON FUNCTION private.tt_attendance_credited_ms(timestamptz,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.tt_auto_clockout_threshold(p_clock_in timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $threshold$
DECLARE lo integer:=0; hi integer:=172800000; mid integer;
BEGIN
 IF p_clock_in IS NULL THEN RAISE EXCEPTION 'Clock-in required'; END IF;
 IF private.tt_attendance_credited_ms(p_clock_in,p_clock_in+hi*INTERVAL '1 millisecond')<32400000
 THEN RAISE EXCEPTION 'Threshold outside supported window'; END IF;
 WHILE lo<hi LOOP
  mid:=lo+((hi-lo)/2);
  IF private.tt_attendance_credited_ms(p_clock_in,p_clock_in+mid*INTERVAL '1 millisecond')>=32400000
  THEN hi:=mid; ELSE lo:=mid+1; END IF;
 END LOOP;
 RETURN p_clock_in+lo*INTERVAL '1 millisecond';
END;
$threshold$;
REVOKE ALL ON FUNCTION private.tt_auto_clockout_threshold(timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;

-- Small but structurally faithful baseline used to exercise the migration's
-- exact, guarded pg_get_functiondef patch anchors.
CREATE FUNCTION private.tt_process_auto_clockouts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $worker$
DECLARE
 v_candidate record;
 v_session record;
 v_ot record;
 v_clock_in timestamptz;
 v_threshold timestamptz;
 v_cutoff timestamptz;
 v_has_ot boolean;
 v_reason text;
 v_state jsonb;
 v_now timestamptz:=clock_timestamp();
 v_activated_at timestamptz:=clock_timestamp()-INTERVAL '1 day';
BEGIN
 FOR v_candidate IN
    SELECT workspace_id,board_id,record_id,employee_id
    FROM private.tt_auto_clockout_sessions
    WHERE status IN ('MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR')
      AND threshold_at<=v_now AND clock_in_at>=v_activated_at
    ORDER BY last_evaluated_at NULLS FIRST,COALESCE(overtime_cutoff_at,threshold_at),record_id
    LIMIT 100
 LOOP
  SELECT * INTO v_session FROM private.tt_auto_clockout_sessions s
  WHERE s.workspace_id=v_candidate.workspace_id AND s.board_id=v_candidate.board_id
   AND s.record_id=v_candidate.record_id AND s.employee_id=v_candidate.employee_id;
  v_clock_in:=v_session.clock_in_at;
  v_threshold:=private.tt_auto_clockout_threshold(v_clock_in);
  v_cutoff:=v_threshold;
  v_has_ot:=false;
  v_state:='{}'::jsonb;

      -- Approved OT must continuously cover the cutoff and be approved by
      -- that cutoff. Late approval cannot revive an expired session.
      FOR v_ot IN
        SELECT r.ot_date,r.start_time,r.end_time,r.decided_at,r.status
        FROM public.timetracker_ot_requests r
        WHERE r.workspace_id=v_session.workspace_id
          AND r.owner_id=v_session.employee_id
          AND r.ot_date=(v_threshold AT TIME ZONE 'Asia/Manila')::date
        ORDER BY r.start_time,r.end_time
      LOOP
       NULL;
      END LOOP;

      v_reason:=NULL;
 END LOOP;
 RETURN '{}'::jsonb;
END;
$worker$;
REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
