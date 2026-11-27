-- CP-TT-LOG-LOCATION-01A synthetic signed role acceptance; all writes roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
DO $verify$
DECLARE
 b uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 d date:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 v jsonb; foreign_user uuid:='20000000-0000-4000-8000-000000000017';
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000012","session_id":"10000000-0000-4000-8000-000000000032"}',true);
 v:=public.timetracker_log_gps_snapshot(b,d,d,NULL);
 IF v->>'scope'<>'AUTHORIZED_WORKSPACE_GPS' OR v->>'actorId'<>'10000000-0000-4000-8000-000000000012'
  OR v->>'workspaceId'<>'10000000-0000-4000-8000-000000000001'
  OR v->>'boardId'<>b::text OR jsonb_array_length(v->'events')<>3 OR v->>'truncated'<>'false' THEN
  RAISE EXCEPTION 'FAIL: HR Log GPS evidence mismatch';
 END IF;
 v:=public.timetracker_log_gps_snapshot(b,d,d,'10000000-0000-4000-8000-000000000011');
 IF jsonb_array_length(v->'events')<>3 THEN
  RAISE EXCEPTION 'FAIL: HR employee-specific filter did not return all three captured fixes';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'events') e
  WHERE e->>'recordId'='synthetic-gps-record-1' AND e->>'kind'='out' AND (e->>'latitude')::numeric=10.3) THEN
  RAISE EXCEPTION 'FAIL: HR clock-out fix missing';
 END IF;
 BEGIN PERFORM public.timetracker_gps_snapshot(b,d,d,NULL);
  RAISE EXCEPTION 'FAIL: HR received GPS Hub access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000013","session_id":"10000000-0000-4000-8000-000000000033"}',true);
 v:=public.timetracker_log_gps_snapshot(b,d,d,NULL);
 IF jsonb_array_length(v->'events')<>3 THEN RAISE EXCEPTION 'FAIL: System Admin Log GPS denied'; END IF;
 BEGIN PERFORM public.timetracker_gps_snapshot(b,d,d,NULL);
  RAISE EXCEPTION 'FAIL: non-bootstrap System Admin received GPS Hub access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000014","session_id":"10000000-0000-4000-8000-000000000034"}',true);
 v:=public.timetracker_log_gps_snapshot(b,d,d,NULL);
 IF jsonb_array_length(v->'events')<>3 THEN RAISE EXCEPTION 'FAIL: Supervisor Log behavior changed'; END IF;
 v:=public.timetracker_gps_snapshot(b,d,d,NULL);
 IF jsonb_array_length(v->'events')<>3 THEN RAISE EXCEPTION 'FAIL: Supervisor Hub behavior changed'; END IF;

 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000015","session_id":"10000000-0000-4000-8000-000000000035"}',true);
 v:=public.timetracker_log_gps_snapshot(b,d,d,NULL);
 IF jsonb_array_length(v->'events')<>3 THEN RAISE EXCEPTION 'FAIL: Bootstrap Log behavior changed'; END IF;
 v:=public.timetracker_gps_snapshot(b,d,d,NULL);
 IF jsonb_array_length(v->'events')<>3 THEN RAISE EXCEPTION 'FAIL: Bootstrap Hub behavior changed'; END IF;

 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000016","session_id":"10000000-0000-4000-8000-000000000036"}',true);
 BEGIN PERFORM public.timetracker_log_gps_snapshot(b,d,d,NULL);
  RAISE EXCEPTION 'FAIL: ordinary Employee received Log GPS access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000012","session_id":"10000000-0000-4000-8000-000000000032"}',true);
 BEGIN PERFORM public.timetracker_log_gps_snapshot(b,d,d,foreign_user);
  RAISE EXCEPTION 'FAIL: foreign workspace employee filter accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.timetracker_log_gps_snapshot('20000000-0000-4000-8000-000000000022',d,d,NULL);
  RAISE EXCEPTION 'FAIL: foreign workspace board accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.timetracker_log_gps_snapshot(b,d-31,d,NULL);
  RAISE EXCEPTION 'FAIL: oversized date window accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF has_function_privilege('authenticated','private.tt_gps_snapshot_read(uuid,date,date,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'FAIL: API role can directly execute private reader';
 END IF;
 IF NOT has_function_privilege('authenticated','public.timetracker_log_gps_snapshot(uuid,date,date,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'FAIL: Log RPC missing authenticated execute grant';
 END IF;
END;
$verify$;
ROLLBACK;
\echo 'CP-TT-LOG-LOCATION-01A PASS';
