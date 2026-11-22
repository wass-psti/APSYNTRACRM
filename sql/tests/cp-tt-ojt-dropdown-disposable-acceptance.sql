-- Disposable-only CP-TT-OJT dropdown identity acceptance.
-- Run after setup.sql and migrations 20261123100000, 20261123130000, 20261123140000.
SET ROLE authenticated;
DO $accept$
DECLARE
 v_board uuid:='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 v_ws uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 v_admin uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_ojt uuid:='d613280d-907b-418f-b872-c0f6dd53e580';
 v_normal uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 v_intern uuid;
 v_beta uuid;
 v_receipt jsonb;
 v_roster jsonb;
 v_snapshot jsonb;
 v_admin_rows jsonb;
 v_admin_roster jsonb;
 v_record uuid;
 v_beta_record uuid;
 v_legacy_record uuid:='22222222-2222-4222-8222-222222222222';
 v_geo jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_receipt:=public.timetracker_ojt_group_set(v_board,v_ojt,true);
 IF v_receipt->>'contract'<>'tt-ojt-admin-write-1'
   OR v_receipt->>'enabled'<>'true'
   OR v_receipt->>'userId'<>v_ojt::text THEN
  RAISE EXCEPTION 'OJT shared account enable receipt invalid';
 END IF;

 v_receipt:=public.timetracker_ojt_intern_set(
  v_board,v_ojt,NULL,'Intern Alpha',true);
 v_intern:=(v_receipt->>'internId')::uuid;
 IF v_intern IS NULL OR v_receipt->>'active'<>'true' THEN
  RAISE EXCEPTION 'Intern creation receipt invalid';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_roster:=public.timetracker_ojt_roster(v_board);
 IF v_roster->>'mode'<>'SHARED_LOGIN'
   OR jsonb_array_length(v_roster->'interns')<>1
   OR v_roster->'interns'->0->>'name'<>'Intern Alpha' THEN
  RAISE EXCEPTION 'Shared OJT dropdown roster did not return the active intern';
 END IF;
 v_snapshot:=public.timetracker_ojt_snapshot(v_board,v_intern);
 IF v_snapshot->>'name'<>'Intern Alpha'
   OR jsonb_array_length(v_snapshot->'records')<>0 THEN
  RAISE EXCEPTION 'Selected intern attendance snapshot invalid';
 END IF;

 v_geo:=jsonb_build_object('status','captured','latitude',25.2,
  'longitude',55.3,'accuracy',5,'capturedAt',clock_timestamp()::text);
 BEGIN
  PERFORM public.timetracker_ojt_commit(v_board,v_intern,'clock-in',NULL,
   'Offsite (Home)',v_geo,'');
  RAISE EXCEPTION 'Offsite clock-in without a work note was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;

 v_receipt:=public.timetracker_ojt_commit(v_board,v_intern,'clock-in',NULL,
  'Office-Base Duty',v_geo,'');
 IF v_receipt->>'contract'<>'tt-ojt-commit-1'
   OR v_receipt->>'mode'<>'COMMITTED'
   OR v_receipt->>'internId'<>v_intern::text
   OR v_receipt->>'action'<>'clock-in' THEN
  RAISE EXCEPTION 'OJT clock-in receipt invalid';
 END IF;
 v_record:=(v_receipt->>'recordId')::uuid;

 BEGIN
  PERFORM public.timetracker_ojt_commit(v_board,v_intern,'clock-in',NULL,
   'Office-Base Duty',v_geo,'');
  RAISE EXCEPTION 'Duplicate active intern clock-in was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 -- Renaming an intern must not rewrite the name already captured on attendance.
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 PERFORM public.timetracker_ojt_intern_set(
  v_board,v_ojt,v_intern,'Intern Alpha Renamed',true);
 v_admin_rows:=public.timetracker_ojt_admin_attendance(v_board);
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_admin_rows->'records') AS row_data(item)
  WHERE item->>'id'=v_record::text AND item->>'name'='Intern Alpha'
 ) THEN
  RAISE EXCEPTION 'Historical attendance name changed after roster rename';
 END IF;
 v_admin_roster:=public.timetracker_ojt_admin_snapshot(v_board);
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_admin_roster->'groups') AS group_data(item),
   LATERAL jsonb_array_elements(item->'interns') AS intern_data(person)
  WHERE person->>'id'=v_intern::text
   AND person->>'name'='Intern Alpha Renamed'
   AND person->>'active'='true'
 ) THEN
  RAISE EXCEPTION 'Admin roster did not show the updated active intern name';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_snapshot:=public.timetracker_ojt_snapshot(v_board,v_intern);
 v_record:=(v_snapshot->'records'->0->>'id')::uuid;
 v_receipt:=public.timetracker_ojt_commit(v_board,v_intern,'clock-out',v_record,
  'Office-Base Duty',v_geo,'');
 IF v_receipt->>'action'<>'clock-out'
   OR v_receipt->>'recordId'<>v_record::text THEN
  RAISE EXCEPTION 'OJT clock-out did not close the selected intern record';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_receipt:=public.timetracker_ojt_intern_set(
  v_board,v_ojt,NULL,'Intern Beta',true);
 v_beta:=(v_receipt->>'internId')::uuid;

 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_receipt:=public.timetracker_ojt_commit(v_board,v_beta,'clock-in',NULL,
  'Office-Base Duty',v_geo,'');
 v_beta_record:=(v_receipt->>'recordId')::uuid;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 BEGIN
  PERFORM public.timetracker_ojt_intern_set(
   v_board,v_ojt,v_beta,'Intern Beta',false);
  RAISE EXCEPTION 'An intern with an active session was deactivated';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM public.timetracker_ojt_group_set(v_board,v_ojt,false);
  RAISE EXCEPTION 'The shared OJT login was disabled with active attendance';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 v_snapshot:=public.timetracker_ojt_snapshot(v_board,v_beta);
 v_beta_record:=(v_snapshot->'records'->0->>'id')::uuid;
 v_receipt:=public.timetracker_ojt_commit(v_board,v_beta,'clock-out',v_beta_record,
  'Office-Base Duty',v_geo,'');
 IF v_receipt->>'action'<>'clock-out' THEN
  RAISE EXCEPTION 'Beta clock-out failed';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 PERFORM public.timetracker_ojt_intern_set(
  v_board,v_ojt,v_beta,'Intern Beta',false);

 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 BEGIN
  PERFORM public.timetracker_ojt_snapshot(v_board,v_beta);
  RAISE EXCEPTION 'An inactive intern was accepted by the attendance snapshot';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
 v_receipt:=public.timetracker_ojt_group_set(v_board,v_ojt,false);
 IF v_receipt->>'enabled'<>'false' THEN
  RAISE EXCEPTION 'OJT shared account disable receipt invalid';
 END IF;

 -- A registered shared OJT account remains blocked from legacy shared JSON
 -- attendance even after its dropdown group is disabled.
 PERFORM set_config('request.jwt.claim.sub',v_ojt::text,false);
 BEGIN
  INSERT INTO public.module_state_entries(
   workspace_id,module_id,state_key,scope,value)
  VALUES(v_ws,'time-tracker','timetracker.attendance.v1','shared','{}'::jsonb);
  RAISE EXCEPTION 'OJT account wrote a legacy attendance record';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;

 -- An unrelated ordinary Employee remains on the original attendance path.
 PERFORM set_config('request.jwt.claim.sub',v_normal::text,false);
 INSERT INTO public.module_state_entries(
  workspace_id,module_id,state_key,scope,value)
 VALUES(v_ws,'time-tracker','timetracker.attendance.v1','shared','{}'::jsonb);
END
$accept$;
RESET ROLE;

DO $catalog$
DECLARE v_audit_id bigint;
BEGIN
 IF to_regclass('private.tt_ojt_sessions') IS NOT NULL THEN
  RAISE EXCEPTION 'OJT bearer session table still exists';
 END IF;
 IF EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='private' AND table_name='tt_ojt_interns'
   AND column_name IN ('pin_hash','failed_attempts','locked_until')
 ) THEN
  RAISE EXCEPTION 'OJT PIN or lockout columns remain';
 END IF;
 IF to_regprocedure('public.timetracker_ojt_select(uuid,uuid,text)') IS NOT NULL
  OR to_regprocedure('public.timetracker_ojt_leave(uuid,text)') IS NOT NULL
  OR to_regprocedure('public.timetracker_ojt_snapshot(uuid,text)') IS NOT NULL
  OR to_regprocedure('public.timetracker_ojt_commit(uuid,text,text,uuid,text,jsonb,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Legacy PIN or token RPC signature remains';
 END IF;
 IF to_regprocedure('public.timetracker_ojt_snapshot(uuid,uuid)') IS NULL
  OR to_regprocedure('public.timetracker_ojt_commit(uuid,uuid,text,uuid,text,jsonb,text)') IS NULL
  OR to_regprocedure('public.timetracker_ojt_intern_set(uuid,uuid,uuid,text,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Dropdown-only OJT RPC signatures missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_indexes
  WHERE schemaname='private' AND indexname='tt_ojt_one_active_per_intern') THEN
  RAISE EXCEPTION 'One-active-session-per-intern constraint missing';
 END IF;
 IF NOT has_function_privilege('authenticated',
   'public.timetracker_ojt_commit(uuid,uuid,text,uuid,text,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.timetracker_ojt_commit(uuid,uuid,text,uuid,text,jsonb,text)','EXECUTE') THEN
  RAISE EXCEPTION 'OJT attendance RPC grants are not least-privilege';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname='tt_ojt_attendance') THEN
  RAISE EXCEPTION 'OJT attendance RLS is not enabled';
 END IF;
 SELECT max(id) INTO v_audit_id FROM private.tt_ojt_audit;
 IF v_audit_id IS NULL THEN RAISE EXCEPTION 'OJT audit rows were not written'; END IF;
 BEGIN
  UPDATE private.tt_ojt_audit SET action='tampered' WHERE id=v_audit_id;
  RAISE EXCEPTION 'OJT audit append-only trigger allowed mutation';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
END
$catalog$;

-- Direct private-table reads are not available to an authenticated client.
SET ROLE authenticated;
DO $private$
DECLARE v_count integer;
BEGIN
 BEGIN
  SELECT count(*) INTO v_count FROM private.tt_ojt_interns;
  RAISE EXCEPTION 'Authenticated client read the private OJT roster table';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$private$;
RESET ROLE;
