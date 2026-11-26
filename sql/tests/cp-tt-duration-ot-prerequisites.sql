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

-- Surrounding fixture only. Install the worker directly from the three
-- actual repository migrations via the shell harness, never a stub worker.
ALTER TABLE private.tt_auto_clockout_sessions
 ADD COLUMN pending_at timestamptz,
 ADD COLUMN scheduled_clock_out_at timestamptz,
 ADD COLUMN grace_started_at timestamptz,
 ADD COLUMN grace_deadline_at timestamptz,
 ADD COLUMN completed_at timestamptz,
 ADD COLUMN clock_out_reason text,
 ADD COLUMN last_error text,
 ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp();
CREATE TABLE private.tt_auto_clockout_config(
 config_key text PRIMARY KEY, activated_at timestamptz NOT NULL, activation_epoch uuid NOT NULL);
INSERT INTO private.tt_auto_clockout_config VALUES
 ('default','infinity','40000000-0000-4000-8000-000000000001');
CREATE FUNCTION private.tt_auto_clockout_mode() RETURNS text LANGUAGE sql STABLE SET search_path=''
AS $$ SELECT CASE WHEN pg_catalog.isfinite(activated_at) THEN 'active' ELSE 'suspended' END
 FROM private.tt_auto_clockout_config WHERE config_key='default' $$;
CREATE TABLE public.timetracker_attendance_mutation_audit(
 workspace_id uuid, board_id uuid, actor_id uuid, record_id text, action text,
 revision bigint, committed_at timestamptz, offsite_note_supplied boolean, source text);
CREATE TABLE private.tt_attendance_board_projection(board_id uuid,record_id uuid);
-- Projection is deliberately not modeled in this worker-only acceptance.
-- Fail if unexpectedly invoked; production projection acceptance is separate.
CREATE FUNCTION private.tt_auto_clockout_project(uuid,uuid,uuid,jsonb,bigint)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Projection fixture is not a production projection test'; END $$;
CREATE FUNCTION public.module_state_invariants_valid(text,text,text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT $1='time-tracker' AND $2='timetracker.attendance.v1'
 AND pg_catalog.jsonb_typeof($3::jsonb->'records')='array' $$;
INSERT INTO public.work_boards(id,workspace_id,name,status)
 VALUES ('46bf4ee7-368a-4c35-842c-8593ea1f6ac3','10000000-0000-4000-8000-000000000001','TimeTracker Attendance','active');
COMMIT;
