-- CP-TT-AUTO-CLOCKOUT-02B: disposable PostgreSQL 17 transaction only.
-- Runs after GPS01, the department catalog migration, and the 02B fix.
\set ON_ERROR_STOP on
BEGIN;

-- The latest catalog and department identity remain authoritative.
SELECT private.tt_department_catalog_init(
 '10000000-0000-4000-8000-000000000001'::uuid);
INSERT INTO private.tt_employee_departments(
 workspace_id,user_id,department,changed_by
) VALUES(
 '10000000-0000-4000-8000-000000000001',
 '21000000-0000-4000-8000-000000000001',
 'Information Technology',
 '20000000-0000-4000-8000-000000000001'
);
DO $gate$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.tt_department_catalog
   WHERE workspace_id='10000000-0000-4000-8000-000000000001'
     AND name='Information Technology') THEN
  RAISE EXCEPTION 'Catalog preparation failed';
 END IF;
 IF position('tt_board_projection_upsert' IN pg_get_functiondef(
  'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Restored atomic Board projection call is absent';
 END IF;
END
$gate$;

SELECT set_config('request.jwt.claim.sub',
 '21000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.session_id',
 '22000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $clock_in$
DECLARE v_receipt jsonb;v_geo jsonb;
BEGIN
 v_geo:=jsonb_build_object(
   'status','captured','source','browser-geolocation',
   'latitude',10.3,'longitude',123.9,'accuracy',12,
   'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 v_receipt:=public.timetracker_attendance_commit_v2(
   '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
   'clock-in',NULL,'Office-Base Duty','Information Technology',
   v_geo,NULL);
 IF v_receipt->>'mode'<>'COMMITTED' OR v_receipt->>'action'<>'clock-in' THEN
  RAISE EXCEPTION 'Signed Clock-In receipt invalid: %',v_receipt;
 END IF;
END
$clock_in$;
RESET ROLE;

-- Direct source test table is disposable; genuine production source remains
-- untouched. Confirm attendance, audit and Board are one committed write.
DO $after_in$
DECLARE v_record uuid;v_count integer;
BEGIN
 SELECT (record->>'id')::uuid INTO v_record FROM public.tt_test_attendance_source
 WHERE employee_id='21000000-0000-4000-8000-000000000001';
 IF v_record IS NULL THEN RAISE EXCEPTION 'Raw Clock-In missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_attendance_board_projection
   WHERE board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'
    AND record_id=v_record
    AND employee_id='21000000-0000-4000-8000-000000000001'
    AND clock_out_at IS NULL) THEN
   RAISE EXCEPTION 'Atomic Clock-In projection missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.work_board_items i
  WHERE i.id=(SELECT board_item_id FROM private.tt_attendance_board_projection
    WHERE record_id=v_record) AND i.status='in_progress') THEN
  RAISE EXCEPTION 'Clock-In Board item missing';
 END IF;
 SELECT count(*) INTO v_count FROM public.work_board_item_values v
 JOIN public.work_board_columns c ON c.id=v.column_id
 JOIN private.tt_attendance_board_projection p ON p.board_item_id=v.item_id
 WHERE p.record_id=v_record;
 IF v_count<6 THEN RAISE EXCEPTION 'Clock-In typed Board values missing: %',v_count; END IF;
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE record_id=v_record::text AND action='clock-in')<>1 THEN
  RAISE EXCEPTION 'Clock-In mutation audit missing or duplicated';
 END IF;
END
$after_in$;

SELECT record->>'id' AS auto_02b_record_id
FROM public.tt_test_attendance_source
WHERE employee_id='21000000-0000-4000-8000-000000000001'
\gset

SET LOCAL ROLE authenticated;
SELECT public.timetracker_attendance_commit_v2(
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'clock-out',:'auto_02b_record_id','Office-Base Duty',
 'Information Technology',
 jsonb_build_object('status','captured','source','browser-geolocation',
   'latitude',10.31,'longitude',123.91,'accuracy',13,
   'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
 NULL);
RESET ROLE;

DO $after_out$
DECLARE v_record uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.tt_attendance_board_projection p
   JOIN public.work_board_items i ON i.id=p.board_item_id
   WHERE p.record_id=v_record AND p.clock_out_at IS NOT NULL
     AND p.clock_out_geo->>'source'='browser-geolocation'
     AND i.status='done') THEN
  RAISE EXCEPTION 'Clock-Out and Board projection were not committed together';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_item_values v
   JOIN public.work_board_columns c ON c.id=v.column_id
   JOIN private.tt_attendance_board_projection p ON p.board_item_id=v.item_id
   WHERE p.record_id=v_record AND c.name='Attendance Status'
     AND v.value='"complete"'::jsonb) THEN
  RAISE EXCEPTION 'Clock-Out Board status column not completed';
 END IF;
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
   WHERE record_id=v_record::text
     AND action IN ('clock-in','clock-out'))<>2 THEN
  RAISE EXCEPTION 'Attendance audit not exactly once per action';
 END IF;
 IF (SELECT count(*) FROM private.tt_attendance_board_projection
     WHERE record_id=v_record)<>1 THEN
  RAISE EXCEPTION 'Duplicate Board projection created';
 END IF;
END
$after_out$;

\echo 'CP-TT-AUTO-CLOCKOUT-02B atomic signed write and Board projection PASS'
ROLLBACK;
