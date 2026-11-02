-- CP-TT-GPS-04 disposable signed security + non-empty evidence regression.
-- Synthetic-only records; no real employee locations or production mutations.
\set ON_ERROR_STOP on
\echo 'CP-TT-GPS-04: signed GPS snapshot returns synthetic fixes and denies ordinary users'
BEGIN;
CREATE TABLE public.module_state_entries(
 workspace_id uuid NOT NULL,module_id text NOT NULL,state_key text NOT NULL,
 scope text NOT NULL,owner_key text NOT NULL,value text NOT NULL,
 PRIMARY KEY (workspace_id,module_id,state_key,scope,owner_key)
);
INSERT INTO public.module_state_entries(
 workspace_id,module_id,state_key,scope,owner_key,value
) VALUES (
 '10000000-0000-4000-8000-000000000001'::uuid,'time-tracker',
 'timetracker.attendance.v1','shared','*',
 pg_catalog.jsonb_build_object('version',1,'records',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'id','synthetic-gps-test','ownerId','cloud:10000000-0000-4000-8000-000000000011',
    'clockIn',pg_catalog.jsonb_build_object(
      'timestamp',pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'location','Office-Base Duty','department','Engineering',
      'geo',pg_catalog.jsonb_build_object(
       'status','captured','source','browser-geolocation','latitude',10.2,
       'longitude',123.9,'accuracy',14)
    ),'clockOut',NULL)
  ))::text
);
UPDATE auth.sessions SET not_after=pg_catalog.clock_timestamp()+INTERVAL '2 hours'
 WHERE id='10000000-0000-4000-8000-000000000031';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"10000000-0000-4000-8000-000000000011","session_id":"10000000-0000-4000-8000-000000000031"}',true);
SELECT pg_catalog.set_config('qa.time_tracker_role','Supervisor',true);
DO $verify$
DECLARE
 v jsonb;
 v_day date:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 v:=public.timetracker_gps_snapshot('10000000-0000-4000-8000-000000000021'::uuid,
    v_day,v_day,NULL);
 IF v->>'scope'<>'AUTHORIZED_WORKSPACE_GPS'
  OR v->>'actorId'<>'10000000-0000-4000-8000-000000000011'
  OR v->>'workspaceId'<>'10000000-0000-4000-8000-000000000001'
  OR pg_catalog.jsonb_array_length(v->'events')<>1
  OR v->>'truncated'<>'false'
  OR v #>> '{events,0,recordId}'<>'synthetic-gps-test'
  OR v #>> '{events,0,kind}'<>'in'
  OR (v #>> '{events,0,latitude}')::double precision<>10.2
  OR (v #>> '{events,0,longitude}')::double precision<>123.9
  OR (v #>> '{events,0,accuracyM}')::double precision<>14 THEN
    RAISE EXCEPTION 'FAIL: signed GPS snapshot does not preserve sanitized synthetic fix';
 END IF;
END $verify$;
-- Degrade within same isolated actor session to nonprivileged role.
SELECT pg_catalog.set_config('qa.time_tracker_role','Employee',true);
DO $deny$
DECLARE
 v_day date:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 BEGIN
  PERFORM public.timetracker_gps_snapshot(
   '10000000-0000-4000-8000-000000000021'::uuid,v_day,v_day,NULL);
  RAISE EXCEPTION 'FAIL: ordinary TimeTracker member viewed precise GPS';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $deny$;
ROLLBACK;
\echo 'CP-TT-GPS-04 PASS: signed fix read, bounded CTE scope and role denial'
