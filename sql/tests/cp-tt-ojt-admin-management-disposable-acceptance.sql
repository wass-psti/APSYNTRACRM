-- Disposable-only CP-TT-OJT-04: signed admin corrections/edit/delete, CAS and audit.
-- Run after OJT-03 acceptance and the OJT-04 forward migration.
SET ROLE authenticated;
DO $accept$
DECLARE
 v_board uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_ojt uuid:='d613280d-907b-418f-b872-c0f6dd53e580';
 v_normal uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 v_intern uuid;
 v_record uuid;
 v_revision bigint;
 v_signed jsonb;
 v_receipt jsonb;
 v_geo jsonb;
 v_in timestamptz;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 PERFORM public.timetracker_ojt_group_set(v_board,v_ojt,true);
 v_receipt:=public.timetracker_ojt_intern_set(v_board,v_ojt,NULL,'Admin Edit Intern',true);
 v_intern:=(v_receipt->>'internId')::uuid;
 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_geo:=pg_catalog.jsonb_build_object('status','captured','latitude',25.2,
  'longitude',55.3,'accuracy',5,'capturedAt',pg_catalog.clock_timestamp()::text);
 v_receipt:=public.timetracker_ojt_commit(v_board,v_intern,'clock-in',NULL,
  'Office-Base Duty',v_geo,'');
 v_record:=(v_receipt->>'recordId')::uuid;

 PERFORM set_config('request.jwt.claim.sub',v_normal::text,false);
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'delete','{}'::jsonb,'',1);
  RAISE EXCEPTION 'Ordinary employee deleted OJT attendance';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 SELECT (item->>'revision')::bigint INTO v_revision
  FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
  WHERE item->>'id'=v_record::text;
 IF v_revision<>1 THEN
  RAISE EXCEPTION 'Signed OJT Log revision not returned';
 END IF;
 v_in:=pg_catalog.clock_timestamp()-INTERVAL '2 hours';
 v_receipt:=public.timetracker_ojt_admin_mutate(v_board,v_record,'correct-time',
  pg_catalog.jsonb_build_object('clockInAt',v_in),'Correcting arrival time',v_revision);
 IF v_receipt->>'contract'<>'tt-ojt-admin-mutate-1' OR
    (v_receipt->>'revision')::bigint<>2 OR
    v_receipt->>'action'<>'correct-time' THEN
  RAISE EXCEPTION 'Corrected OJT receipt invalid';
 END IF;
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'correct-time',
   pg_catalog.jsonb_build_object('clockInAt',v_in-INTERVAL '30 minutes'),
   'Stale correction',1);
  RAISE EXCEPTION 'Stale OJT correction was accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
   WHERE item->>'id'=v_record::text AND (item->>'revision')::bigint=2 AND
    (item->>'clockIn')::timestamptz=v_in) THEN
  RAISE EXCEPTION 'Corrected arrival not returned by signed Log';
 END IF;
 -- GPS integrity is verified after resetting the authenticated role.
END
$accept$;
RESET ROLE;

-- Only the test harness can change fixture module-role assignments.
UPDATE public.test_module_roles SET module_role='IT Administrator'
 WHERE module_id='time-tracker' AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $it$
DECLARE
 v_board uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_record uuid;v_revision bigint;v_signed jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 SELECT (item->>'id')::uuid,(item->>'revision')::bigint
   INTO v_record,v_revision
 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
 WHERE item->>'name'='Admin Edit Intern';
 IF v_record IS NULL OR v_revision<>2 THEN
  RAISE EXCEPTION 'IT signed OJT view did not include current record';
 END IF;
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'edit',
   pg_catalog.jsonb_build_object('location','Offsite (Home)',
    'workNote','Instrument checks'),'',v_revision);
  RAISE EXCEPTION 'IT Administrator edited OJT work details';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'delete',
   '{}'::jsonb,'',v_revision);
  RAISE EXCEPTION 'IT Administrator deleted OJT attendance';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'correct-time',
   pg_catalog.jsonb_build_object('location','Offsite (Home)'),
   'Invalid time-only patch',v_revision);
  RAISE EXCEPTION 'IT Administrator corrected a non-time field';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END
$it$;
RESET ROLE;

UPDATE public.test_module_roles SET module_role='System Admin'
 WHERE module_id='time-tracker' AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $system$
DECLARE
 v_board uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_ojt uuid:='d613280d-907b-418f-b872-c0f6dd53e580';
 v_record uuid;v_intern uuid;v_revision bigint;
 v_signed jsonb;v_receipt jsonb;v_geo jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 SELECT (item->>'id')::uuid,(item->>'internId')::uuid,(item->>'revision')::bigint
   INTO v_record,v_intern,v_revision
 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
 WHERE item->>'name'='Admin Edit Intern';
 IF v_revision<>2 THEN RAISE EXCEPTION 'OJT revision unexpectedly changed'; END IF;
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'edit',
   pg_catalog.jsonb_build_object('location','Offsite (Home)'),
   'Invalid offsite without note',v_revision);
  RAISE EXCEPTION 'OJT offsite note policy was bypassed';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 v_receipt:=public.timetracker_ojt_admin_mutate(v_board,v_record,'edit',
   pg_catalog.jsonb_build_object('location','Offsite (Home)',
    'workNote','Checked instrument panels'),
   'Corrected work location',v_revision);
 IF (v_receipt->>'revision')::bigint<>3 THEN
  RAISE EXCEPTION 'OJT admin edit did not advance the revision';
 END IF;
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
   WHERE item->>'id'=v_record::text AND item->>'location'='Offsite (Home)'
   AND item->>'workNote'='Checked instrument panels') THEN
  RAISE EXCEPTION 'OJT edited location/note not shown in signed Log';
 END IF;
 -- A later intern Clock-Out advances the same row revision.
 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_geo:=pg_catalog.jsonb_build_object('status','captured','latitude',25.2,
  'longitude',55.3,'accuracy',5,'capturedAt',pg_catalog.clock_timestamp()::text);
 PERFORM public.timetracker_ojt_commit(v_board,v_intern,'clock-out',v_record,
  'Offsite (Home)',v_geo,'');
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 BEGIN
  PERFORM public.timetracker_ojt_admin_mutate(v_board,v_record,'edit',
   pg_catalog.jsonb_build_object('location','Office-Base Duty'),
   'Stale after clock-out',3);
  RAISE EXCEPTION 'Admin overwrote concurrent intern clock-out';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 SELECT (item->>'revision')::bigint INTO v_revision
 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
 WHERE item->>'id'=v_record::text;
 IF v_revision<>4 THEN
  RAISE EXCEPTION 'Concurrent clock-out did not bump OJT CAS revision';
 END IF;
 v_receipt:=public.timetracker_ojt_admin_mutate(v_board,v_record,'delete',
   '{}'::jsonb,'Removed duplicate training entry',v_revision);
 IF v_receipt->>'action'<>'delete' THEN RAISE EXCEPTION 'OJT deletion unverified'; END IF;
 v_signed:=public.timetracker_ojt_admin_attendance(v_board);
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_signed->'records') AS item
  WHERE item->>'id'=v_record::text) THEN
  RAISE EXCEPTION 'Deleted OJT row remains in signed Log';
 END IF;
END
$system$;
RESET ROLE;

DO $audit$
DECLARE v_count bigint;
BEGIN
 SELECT count(*) INTO v_count FROM private.tt_ojt_audit
 WHERE action IN ('admin-correct-time','admin-edit','admin-delete')
  AND before_row IS NOT NULL;
 IF v_count<>3 THEN
  RAISE EXCEPTION 'Expected 3 append-only OJT admin audit entries; got %',v_count;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_ojt_audit
  WHERE action='admin-delete' AND after_row IS NULL
    AND before_row->>'intern_name'='Admin Edit Intern') THEN
  RAISE EXCEPTION 'Deleted OJT row has no preserved audit evidence';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tt_ojt_audit
  WHERE action='admin-correct-time'
    AND before_row->'clock_in_geo'=after_row->'clock_in_geo') THEN
  RAISE EXCEPTION 'GPS evidence changed during OJT time correction';
 END IF;
 IF has_function_privilege('anon',
  'public.timetracker_ojt_admin_mutate(uuid,uuid,text,jsonb,text,bigint)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
  'public.timetracker_ojt_admin_mutate(uuid,uuid,text,jsonb,text,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'Signed OJT admin mutation grants unsafe';
 END IF;
END $audit$;
