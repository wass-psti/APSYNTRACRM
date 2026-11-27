-- CP-TT-LOG-LOCATION-01A disposable signed GPS role acceptance.
-- Synthetic-only coordinates. This runs only in the disposable PostgreSQL service.
\set ON_ERROR_STOP on
\echo 'CP-TT-LOG-LOCATION-01A: HR and System Admin recorded GPS visibility'
\if :{?gps_actor}
\else
\set gps_actor '20000000-0000-4000-8000-000000000001'
\endif
\if :{?gps_session}
\else
\set gps_session '70000000-0000-4000-8000-000000000001'
\endif
\if :{?gps_board}
\else
\set gps_board '30000000-0000-4000-8000-000000000001'
\endif
\if :{?gps_foreign}
\else
\set gps_foreign '20000000-0000-4000-8000-000000000004'
\endif
BEGIN;
-- The standalone and combined CI fixtures use different synthetic identities.
-- Preserve the same positive/negative matrix in both, and fail on missing fixtures.
SELECT pg_catalog.set_config('qa.gps_actor', :'gps_actor', true);
SELECT pg_catalog.set_config('qa.gps_session', :'gps_session', true);
SELECT pg_catalog.set_config('qa.gps_board', :'gps_board', true);
SELECT pg_catalog.set_config('qa.gps_foreign', :'gps_foreign', true);
DO $fixtures$
DECLARE a uuid:=current_setting('qa.gps_actor')::uuid;
 s uuid:=current_setting('qa.gps_session')::uuid;
 b uuid:=current_setting('qa.gps_board')::uuid;
 f uuid:=current_setting('qa.gps_foreign')::uuid;
BEGIN
 IF public.current_workspace_id(a) IS DISTINCT FROM '10000000-0000-4000-8000-000000000001'::uuid
  OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=s AND user_id=a)
  OR NOT EXISTS(SELECT 1 FROM public.work_boards WHERE id=b AND workspace_id=public.current_workspace_id(a))
  OR public.current_workspace_id(f) IS NULL
  OR public.current_workspace_id(f)=public.current_workspace_id(a) THEN
  RAISE EXCEPTION 'GPS acceptance fixture identities are missing or not isolated';
 END IF;
END $fixtures$;
CREATE TABLE public.module_state_entries(
 workspace_id uuid NOT NULL,module_id text NOT NULL,state_key text NOT NULL,
 scope text NOT NULL,owner_key text NOT NULL,value text NOT NULL,
 PRIMARY KEY(workspace_id,module_id,state_key,scope,owner_key)
);
INSERT INTO public.module_state_entries(
 workspace_id,module_id,state_key,scope,owner_key,value
) VALUES (
 '10000000-0000-4000-8000-000000000001'::uuid,'time-tracker',
 'timetracker.attendance.v1','shared','*',
 pg_catalog.jsonb_build_object('version',1,'records',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
   'id','synthetic-gps-log-location-01a',
   'ownerId','cloud:'|| :'gps_actor',
   'clockIn',pg_catalog.jsonb_build_object(
    'timestamp',pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'location','Office-Base Duty','department','Engineering',
    'geo',pg_catalog.jsonb_build_object(
     'status','captured','source','browser-geolocation',
     'latitude',10.2,'longitude',123.9,'accuracy',14)),
   'clockOut',NULL)
 ))::text
);
UPDATE auth.sessions SET not_after=pg_catalog.clock_timestamp()+INTERVAL '2 hours'
 WHERE id=:'gps_session'::uuid AND user_id=:'gps_actor'::uuid;
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE WHEN p_module_id='time-tracker'
   AND public.current_workspace_id(p_user_id) IS NOT NULL
  THEN COALESCE(NULLIF(pg_catalog.current_setting('qa.time_tracker_role',true),''),'Employee')
  ELSE NULL END;
$role$;
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $$ SELECT COALESCE(pg_catalog.current_setting('qa.bootstrap',true),'false')='true' $$;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', :'gps_actor',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id', :'gps_session',true);
-- The standalone fixture reads individual GUCs; combined OT reads JSON claims.
-- Set both to the same synthetic actor and verify before any role assertion.
SELECT pg_catalog.set_config('request.jwt.claims',
 pg_catalog.jsonb_build_object('sub', :'gps_actor','session_id', :'gps_session')::text,true);
DO $identity$
BEGIN
 IF auth.uid() IS DISTINCT FROM current_setting('qa.gps_actor')::uuid
  OR auth.jwt()->>'session_id' IS DISTINCT FROM current_setting('qa.gps_session') THEN
  RAISE EXCEPTION 'GPS signed fixture actor/session mismatch';
 END IF;
END $identity$;
SELECT pg_catalog.set_config('qa.bootstrap','false',true);
DO $verify$
DECLARE v jsonb; v_role text;
 v_actor uuid:=current_setting('qa.gps_actor')::uuid;
 v_board uuid:=current_setting('qa.gps_board')::uuid;
 v_foreign uuid:=current_setting('qa.gps_foreign')::uuid;
 v_day date:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 FOREACH v_role IN ARRAY ARRAY[
  'HR','System Admin','Supervisor','Employee','Finance','IT Administrator','OJT'
 ] LOOP
  PERFORM pg_catalog.set_config('qa.time_tracker_role',v_role,true);
  IF v_role IN ('HR','System Admin','Supervisor') THEN
   v:=public.timetracker_gps_snapshot(v_board,v_day,v_day,NULL);
   IF v->>'scope' IS DISTINCT FROM 'AUTHORIZED_WORKSPACE_GPS'
    OR v->>'actorId' IS DISTINCT FROM v_actor::text
    OR v->>'workspaceId' IS DISTINCT FROM '10000000-0000-4000-8000-000000000001'
    OR v->>'boardId' IS DISTINCT FROM v_board::text
    OR pg_catalog.jsonb_array_length(v->'events') IS DISTINCT FROM 1
    OR v->>'truncated' IS DISTINCT FROM 'false'
    OR v #>> '{events,0,recordId}' IS DISTINCT FROM 'synthetic-gps-log-location-01a'
    OR v #>> '{events,0,kind}' IS DISTINCT FROM 'in'
    OR (v #>> '{events,0,latitude}')::double precision IS DISTINCT FROM 10.2
    OR (v #>> '{events,0,longitude}')::double precision IS DISTINCT FROM 123.9
    OR (v #>> '{events,0,accuracyM}')::double precision IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'FAIL: signed GPS evidence contract failed for role %',v_role;
   END IF;
  ELSE
   BEGIN
    PERFORM public.timetracker_gps_snapshot(v_board,v_day,v_day,NULL);
    RAISE EXCEPTION 'FAIL: unexpected GPS evidence access for role %',v_role;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END IF;
 END LOOP;
 PERFORM pg_catalog.set_config('qa.time_tracker_role','Employee',true);
 PERFORM pg_catalog.set_config('qa.bootstrap','true',true);
 v:=public.timetracker_gps_snapshot(v_board,v_day,v_day,NULL);
 IF pg_catalog.jsonb_array_length(v->'events') IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'FAIL: bootstrap administrator GPS access regressed';
 END IF;
 PERFORM pg_catalog.set_config('qa.bootstrap','false',true);
 PERFORM pg_catalog.set_config('qa.time_tracker_role','HR',true);
 BEGIN
  PERFORM public.timetracker_gps_snapshot(v_board,v_day,v_day,
   v_foreign);
  RAISE EXCEPTION 'FAIL: foreign workspace GPS employee filter was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $verify$;
ROLLBACK;
\echo 'CP-TT-LOG-LOCATION-01A PASS: HR, System Admin, Supervisor and bootstrap allowed; unrelated roles denied'
