-- CP-TT-LOG-LOCATION-01A disposable signed GPS role acceptance.
-- Synthetic-only coordinates. This runs only in the disposable PostgreSQL service.
\set ON_ERROR_STOP on
\echo 'CP-TT-LOG-LOCATION-01A: HR and System Admin recorded GPS visibility'
BEGIN;
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
   'ownerId','cloud:20000000-0000-4000-8000-000000000001',
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
 WHERE id='70000000-0000-4000-8000-000000000001';
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
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
SELECT pg_catalog.set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('qa.bootstrap','false',true);
DO $verify$
DECLARE v jsonb; v_role text;
 v_day date:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 FOREACH v_role IN ARRAY ARRAY[
  'HR','System Admin','Supervisor','Employee','Finance','IT Administrator','OJT'
 ] LOOP
  PERFORM pg_catalog.set_config('qa.time_tracker_role',v_role,true);
  IF v_role IN ('HR','System Admin','Supervisor') THEN
   v:=public.timetracker_gps_snapshot('30000000-0000-4000-8000-000000000001'::uuid,v_day,v_day,NULL);
   IF v->>'scope'<>'AUTHORIZED_WORKSPACE_GPS'
    OR v->>'actorId'<>'20000000-0000-4000-8000-000000000001'
    OR v->>'workspaceId'<>'10000000-0000-4000-8000-000000000001'
    OR v->>'boardId'<>'30000000-0000-4000-8000-000000000001'
    OR pg_catalog.jsonb_array_length(v->'events')<>1
    OR v->>'truncated'<>'false'
    OR v #>> '{events,0,recordId}'<>'synthetic-gps-log-location-01a'
    OR v #>> '{events,0,kind}'<>'in'
    OR (v #>> '{events,0,latitude}')::double precision<>10.2
    OR (v #>> '{events,0,longitude}')::double precision<>123.9
    OR (v #>> '{events,0,accuracyM}')::double precision<>14 THEN
    RAISE EXCEPTION 'FAIL: signed GPS evidence contract failed for role %',v_role;
   END IF;
  ELSE
   BEGIN
    PERFORM public.timetracker_gps_snapshot('30000000-0000-4000-8000-000000000001'::uuid,v_day,v_day,NULL);
    RAISE EXCEPTION 'FAIL: unexpected GPS evidence access for role %',v_role;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END IF;
 END LOOP;
 PERFORM pg_catalog.set_config('qa.time_tracker_role','Employee',true);
 PERFORM pg_catalog.set_config('qa.bootstrap','true',true);
 v:=public.timetracker_gps_snapshot('30000000-0000-4000-8000-000000000001'::uuid,v_day,v_day,NULL);
 IF pg_catalog.jsonb_array_length(v->'events')<>1 THEN
  RAISE EXCEPTION 'FAIL: bootstrap administrator GPS access regressed';
 END IF;
 PERFORM pg_catalog.set_config('qa.bootstrap','false',true);
 PERFORM pg_catalog.set_config('qa.time_tracker_role','HR',true);
 BEGIN
  PERFORM public.timetracker_gps_snapshot('30000000-0000-4000-8000-000000000001'::uuid,v_day,v_day,
   '20000000-0000-4000-8000-000000000004'::uuid);
  RAISE EXCEPTION 'FAIL: foreign workspace GPS employee filter was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $verify$;
ROLLBACK;
\echo 'CP-TT-LOG-LOCATION-01A PASS: HR, System Admin, Supervisor and bootstrap allowed; unrelated roles denied'
