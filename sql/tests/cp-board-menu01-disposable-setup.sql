-- CP-BOARD-MENU01 synthetic PostgreSQL 17 fixture, isolated from production.
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.work_boards
 ADD COLUMN name text NOT NULL DEFAULT 'General Board',
 ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN status text NOT NULL DEFAULT 'active',
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN created_by uuid,
 ADD COLUMN updated_by uuid,
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN trashed_at timestamptz;
UPDATE public.work_boards SET
 created_by='20000000-0000-4000-8000-000000000001',
 updated_by='20000000-0000-4000-8000-000000000001';
UPDATE public.work_boards SET name='Foreign Board'
 WHERE id='30000000-0000-4000-8000-000000000002';
INSERT INTO public.work_boards(id,workspace_id,name,description,created_by,updated_by)
VALUES
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
 'TimeTracker Attendance','[APSYNTRA:MODULE:timetracker:v1] Restricted domain board',
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
 'APSYNTRA QA','',
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',
 'Second Board','',
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
INSERT INTO public.work_board_members(board_id,user_id,role)
VALUES
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','owner');

CREATE FUNCTION private.wm_board_config_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $live$
DECLARE sid text:=auth.jwt()->>'session_id'; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR sid IS NULL OR
  sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid
  AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now()));
END $live$;
REVOKE ALL ON FUNCTION private.wm_board_config_session_active()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
