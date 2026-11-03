-- CP-TT-GPS01 disposable PostgreSQL 17 only. Run after COL01 fixture.
\set ON_ERROR_STOP on
CREATE SCHEMA private;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
INSERT INTO public.workspaces(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');

ALTER TABLE public.work_boards
 ADD COLUMN name text NOT NULL DEFAULT 'TimeTracker Attendance',
 ADD COLUMN status text NOT NULL DEFAULT 'active',
 ADD COLUMN created_by uuid REFERENCES public.profiles(id),
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN trashed_at timestamptz;
UPDATE public.work_boards SET created_by='20000000-0000-4000-8000-000000000001';
UPDATE public.work_boards SET name='Foreign Board'
 WHERE id='30000000-0000-4000-8000-000000000002';

CREATE TABLE public.work_board_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 title text NOT NULL DEFAULT 'Main group',position integer NOT NULL DEFAULT 0);
INSERT INTO public.work_board_groups(id,board_id)
 VALUES('90000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001');

ALTER TABLE public.work_board_items
 ADD COLUMN group_id uuid REFERENCES public.work_board_groups(id),
 ADD COLUMN title text NOT NULL DEFAULT 'Existing item',
 ADD COLUMN status text,
 ADD COLUMN position integer NOT NULL DEFAULT 0,
 ADD COLUMN created_by uuid REFERENCES public.profiles(id),
 ADD COLUMN updated_by uuid REFERENCES public.profiles(id),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.work_board_items SET
 group_id='90000000-0000-4000-8000-000000000001',
 created_by='20000000-0000-4000-8000-000000000001',
 updated_by='20000000-0000-4000-8000-000000000001'
 WHERE board_id='30000000-0000-4000-8000-000000000001';

CREATE TABLE public.work_board_columns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 column_key text NOT NULL,name text NOT NULL,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 position integer NOT NULL DEFAULT 0);
CREATE TABLE public.work_board_item_values(
 item_id uuid NOT NULL REFERENCES public.work_board_items(id),
 column_id uuid NOT NULL REFERENCES public.work_board_columns(id),
 value jsonb,updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,column_id));
ALTER TABLE public.work_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_item_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_columns,public.work_board_item_values
 FROM PUBLIC,anon,authenticated;

INSERT INTO public.work_board_columns(board_id,column_key,name,config,position)
SELECT '30000000-0000-4000-8000-000000000001',
 'col_'||n::text,nm,CASE
 WHEN nm='Sync State' THEN
   '{"labels":[{"id":"sync","name":"Synchronized"},{"id":"pending","name":"Pending"}]}'::jsonb
 WHEN nm='Attendance Status' THEN
   '{"labels":[{"id":"inprogress","name":"In progress"},{"id":"complete","name":"Done"}]}'::jsonb
 ELSE '{}'::jsonb END, n
FROM unnest(ARRAY[
 'Source Record ID','Source Revision','Sync State','Attendance Ref',
 'Attendance Date','Hours Total','Attendance Status','Shift Ref'
]) WITH ORDINALITY v(nm,n);

CREATE TABLE public.timetracker_attendance_mutation_audit(
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid,board_id uuid,actor_id uuid,record_id text,
 action text,revision bigint,committed_at timestamptz,
 offsite_note_supplied boolean);

CREATE TABLE public.tt_test_attendance_source(
 employee_id uuid PRIMARY KEY,record jsonb NOT NULL,revision bigint NOT NULL);

CREATE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $scope$
DECLARE ws uuid; sid text:=auth.jwt()->>'session_id';a uuid:=auth.uid();
BEGIN
 IF a IS NULL OR sid IS NULL OR sid !~* '^[0-9a-f-]{36}$'
  OR NOT EXISTS(SELECT 1 FROM auth.sessions
    WHERE id=sid::uuid AND user_id=a AND (not_after IS NULL OR not_after>now())) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 ws:=public.current_workspace_id(a);
 IF NOT EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
  AND b.workspace_id=ws AND b.name='TimeTracker Attendance'
  AND public.work_board_access(b.id,'view')) THEN
  RAISE EXCEPTION 'Invalid scope' USING ERRCODE='42501';
 END IF;
 RETURN ws;
END $scope$;
CREATE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
SELECT CASE WHEN p_module_id='time-tracker' AND
 public.current_workspace_id(p_user_id) IS NOT NULL
 THEN CASE WHEN p_user_id='20000000-0000-4000-8000-000000000001'
  THEN 'Supervisor' ELSE 'Employee' END END;
$role$;
CREATE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $$SELECT false$$;

-- Raw attendance stub simulates an authoritative state write while retaining
-- source/record identity. The full wrapper and projection are real candidate SQL.
CREATE FUNCTION public.timetracker_commit_attendance_raw_gps03(
 p_action text,p_record_id text,p_location text,p_department text,p_geo jsonb,
 p_work_note text,p_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $raw$
DECLARE actor uuid:=auth.uid(); old_record jsonb; new_record jsonb;
 v_revision bigint; v_id uuid; v_now text;
BEGIN
 SELECT record,revision INTO old_record,v_revision
 FROM public.tt_test_attendance_source WHERE employee_id=actor FOR UPDATE;
 v_revision:=coalesce(v_revision,0)+1;
 v_now:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 IF p_action='clock-in' THEN
  IF old_record IS NOT NULL AND (old_record->'clockOut' IS NULL OR old_record->'clockOut'='null'::jsonb) THEN
   RAISE EXCEPTION 'Already active'; END IF;
  v_id:=gen_random_uuid();
  new_record:=jsonb_build_object(
   'id',v_id,'ownerId','cloud:'||actor::text,
   'clockIn',jsonb_build_object('timestamp',v_now,'geo',p_geo,
     'location',p_location,'department',p_department),
   'clockOut',NULL);
 ELSE
  IF old_record IS NULL OR (old_record->'clockOut' IS NOT NULL AND old_record->'clockOut'<>'null'::jsonb)
   OR old_record->>'id'<>p_record_id THEN
   RAISE EXCEPTION 'No active matching session'; END IF;
  v_id:=(old_record->>'id')::uuid;
  new_record:=old_record||jsonb_build_object('clockOut',
   jsonb_build_object('timestamp',
     to_char((now()+interval '2 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'geo',p_geo,'location',p_location,'department',p_department));
 END IF;
 INSERT INTO public.tt_test_attendance_source(employee_id,record,revision)
 VALUES(actor,new_record,v_revision)
 ON CONFLICT(employee_id) DO UPDATE SET
  record=EXCLUDED.record,revision=EXCLUDED.revision;
 RETURN jsonb_build_object('state_key','timetracker.attendance.v1',
  'action',p_action,'revision',v_revision,'record',new_record,'committed_at',v_now);
END $raw$;
