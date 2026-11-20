-- CP-TT-AUTO-CLOCKOUT-02: disposable PostgreSQL 17 only.
-- Run after the existing COL01, GPS01, ARM01 and OT01 fixtures.
-- NEVER run this fixture against a production database.
\set ON_ERROR_STOP on

-- The production migration is intentionally bound to the existing Attendance
-- board UUID. Recreate that exact identity in this isolated database.
INSERT INTO public.work_boards(
 id,workspace_id,name,status,created_by,archived_at,trashed_at
) VALUES (
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 '10000000-0000-4000-8000-000000000001',
 'TimeTracker Attendance','active',
 '20000000-0000-4000-8000-000000000001',NULL,NULL
);

INSERT INTO public.work_board_groups(id,board_id,title,position)
VALUES('90000000-0000-4000-8000-000000000010',
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3','Main group',0);

INSERT INTO public.work_board_columns(board_id,column_key,name,config,position)
SELECT '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'auto_'||n::text,nm,
 CASE
  WHEN nm='Sync State' THEN
   '{"labels":[{"id":"sync","name":"Synchronized"},{"id":"pending","name":"Pending"}]}'::jsonb
  WHEN nm='Attendance Status' THEN
   '{"labels":[{"id":"inprogress","name":"In progress"},{"id":"complete","name":"Done"}]}'::jsonb
  ELSE '{}'::jsonb
 END,n
FROM unnest(ARRAY[
 'Source Record ID','Source Revision','Sync State','Attendance Ref',
 'Attendance Date','Hours Total','Attendance Status','Shift Ref'
]) WITH ORDINALITY v(nm,n);

INSERT INTO public.profiles(id,email,display_name,platform_role,status) VALUES
 ('21000000-0000-4000-8000-000000000001','auto-a@example.test','Auto Employee A','employee','active'),
 ('21000000-0000-4000-8000-000000000002','auto-b@example.test','Auto Employee B','employee','active'),
 ('21000000-0000-4000-8000-000000000003','auto-c@example.test','Auto Employee C','employee','active'),
 ('21000000-0000-4000-8000-000000000004','auto-d@example.test','Auto Employee D','employee','active'),
 ('21000000-0000-4000-8000-000000000005','auto-e@example.test','Auto Employee E','employee','active'),
 ('21000000-0000-4000-8000-000000000006','auto-f@example.test','Auto Employee F','employee','active'),
 ('21000000-0000-4000-8000-000000000007','auto-g@example.test','Auto Employee G','employee','active');

INSERT INTO public.workspace_members(workspace_id,user_id,active)
SELECT '10000000-0000-4000-8000-000000000001',id,true
FROM public.profiles
WHERE id BETWEEN '21000000-0000-4000-8000-000000000001'::uuid
            AND '21000000-0000-4000-8000-000000000007'::uuid;

INSERT INTO public.work_board_members(board_id,user_id,role)
SELECT '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',id,'editor'
FROM public.profiles
WHERE id BETWEEN '21000000-0000-4000-8000-000000000001'::uuid
            AND '21000000-0000-4000-8000-000000000007'::uuid;
INSERT INTO public.work_board_members(board_id,user_id,role)
VALUES('46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 '20000000-0000-4000-8000-000000000001','owner');

INSERT INTO auth.sessions(id,user_id) VALUES
 ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001'),
 ('22000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');

-- The migration expects the existing pg_cron catalog. A deterministic local
-- catalog stub verifies that it registers exactly its own named 30s job.
CREATE SCHEMA cron;
CREATE TABLE cron.job(
 jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 jobname text NOT NULL UNIQUE,
 schedule text NOT NULL,
 command text NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION cron.schedule(text,text,text)
RETURNS bigint LANGUAGE plpgsql
AS $$
DECLARE v_id bigint;
BEGIN
 INSERT INTO cron.job(jobname,schedule,command)
 VALUES($1,$2,$3) RETURNING jobid INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION cron.unschedule(bigint)
RETURNS boolean LANGUAGE plpgsql
AS $$
BEGIN
 DELETE FROM cron.job WHERE jobid=$1;
 RETURN FOUND;
END $$;

-- In this disposable fixture only, identify the synthetic bootstrap approver.
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT auth.uid()='20000000-0000-4000-8000-000000000001'::uuid $$;

\echo 'CP-TT-AUTO-CLOCKOUT-02 disposable prerequisites ready'
