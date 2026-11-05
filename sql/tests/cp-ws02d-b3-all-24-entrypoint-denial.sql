-- CP-WS-02D/B3: invoke ALL 24 original source-based RPCs under signed Viewer,
-- revoked session, and workspace Member manage-denial conditions.
-- Denial-only acceptance: does NOT prove valid domain write semantics.
-- Disposable PG17 only. Synthetic identities, no domain data, rollback.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 THEN RAISE EXCEPTION 'All-domain denial acceptance requires isolated disabled test DB'
 USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.append_module_activity(text,text,text,text,text,text,jsonb)') IS NULL
 OR has_function_privilege('anon','public.append_module_activity(text,text,text,text,text,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.append_module_activity(text,text,text,text,text,text,jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.append_module_activity(text,text,text,text,text,text,jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant append_module_activity' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.charter_admin_set_role(uuid,text,boolean)') IS NULL
 OR has_function_privilege('anon','public.charter_admin_set_role(uuid,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.charter_admin_set_role(uuid,text,boolean)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.charter_admin_set_role(uuid,text,boolean)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant charter_admin_set_role' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)') IS NULL
 OR has_function_privilege('anon','public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant commit_fueltrack_requests_with_activity' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.employee_evaluation_create_employee(jsonb)') IS NULL
 OR has_function_privilege('anon','public.employee_evaluation_create_employee(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.employee_evaluation_create_employee(jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.employee_evaluation_create_employee(jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant employee_evaluation_create_employee' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.employee_evaluation_review_transition(uuid,text,text,bigint)') IS NULL
 OR has_function_privilege('anon','public.employee_evaluation_review_transition(uuid,text,text,bigint)','EXECUTE')
 OR has_function_privilege('authenticated','public.employee_evaluation_review_transition(uuid,text,text,bigint)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.employee_evaluation_review_transition(uuid,text,text,bigint)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant employee_evaluation_review_transition' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.employee_evaluation_save(jsonb)') IS NULL
 OR has_function_privilege('anon','public.employee_evaluation_save(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.employee_evaluation_save(jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.employee_evaluation_save(jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant employee_evaluation_save' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.employee_evaluation_update_employee(uuid,jsonb)') IS NULL
 OR has_function_privilege('anon','public.employee_evaluation_update_employee(uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.employee_evaluation_update_employee(uuid,jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.employee_evaluation_update_employee(uuid,jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant employee_evaluation_update_employee' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.employee_evaluation_update_settings(jsonb)') IS NULL
 OR has_function_privilege('anon','public.employee_evaluation_update_settings(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.employee_evaluation_update_settings(jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.employee_evaluation_update_settings(jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant employee_evaluation_update_settings' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.import_fueltrack_activity_backup(jsonb)') IS NULL
 OR has_function_privilege('anon','public.import_fueltrack_activity_backup(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.import_fueltrack_activity_backup(jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.import_fueltrack_activity_backup(jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant import_fueltrack_activity_backup' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_archive(uuid,integer)') IS NULL
 OR has_function_privilege('anon','public.order_intake_archive(uuid,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_archive(uuid,integer)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_archive(uuid,integer)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_archive' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_create(jsonb)') IS NULL
 OR has_function_privilege('anon','public.order_intake_create(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_create(jsonb)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_create(jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_create' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_create_idempotent(jsonb,uuid)') IS NULL
 OR has_function_privilege('anon','public.order_intake_create_idempotent(jsonb,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_create_idempotent(jsonb,uuid)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_create_idempotent(jsonb,uuid)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_create_idempotent' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_qa_archive_once()') IS NULL
 OR has_function_privilege('anon','public.order_intake_qa_archive_once()','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_qa_archive_once()','EXECUTE') IS DISTINCT FROM false
 OR pg_get_functiondef('public.order_intake_qa_archive_once()'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_qa_archive_once' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_restore(uuid,integer)') IS NULL
 OR has_function_privilege('anon','public.order_intake_restore(uuid,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_restore(uuid,integer)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_restore(uuid,integer)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_restore' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_update_details(uuid,jsonb,integer)') IS NULL
 OR has_function_privilege('anon','public.order_intake_update_details(uuid,jsonb,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_update_details(uuid,jsonb,integer)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_update_details(uuid,jsonb,integer)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_update_details' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.order_intake_update_status(uuid,text,integer)') IS NULL
 OR has_function_privilege('anon','public.order_intake_update_status(uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_update_status(uuid,text,integer)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.order_intake_update_status(uuid,text,integer)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant order_intake_update_status' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)') IS NULL
 OR has_function_privilege('anon','public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)','EXECUTE') IS DISTINCT FROM false
 OR pg_get_functiondef('public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant timetracker_commit_attendance_raw_gps03' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_asset_write(text,text,text,bigint)') IS NULL
 OR has_function_privilege('anon','public.tradelink_asset_write(text,text,text,bigint)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_asset_write(text,text,text,bigint)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_asset_write(text,text,text,bigint)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_asset_write' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_cleanup_fence_activate(text,bigint)') IS NULL
 OR has_function_privilege('anon','public.tradelink_cleanup_fence_activate(text,bigint)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_cleanup_fence_activate(text,bigint)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_cleanup_fence_activate(text,bigint)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_cleanup_fence_activate' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_cleanup_fence_release(text)') IS NULL
 OR has_function_privilege('anon','public.tradelink_cleanup_fence_release(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_cleanup_fence_release(text)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_cleanup_fence_release(text)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_cleanup_fence_release' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_reconciliation_assess(text)') IS NULL
 OR has_function_privilege('anon','public.tradelink_reconciliation_assess(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_reconciliation_assess(text)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_reconciliation_assess(text)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_reconciliation_assess' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_reconciliation_report(text,text,text)') IS NULL
 OR has_function_privilege('anon','public.tradelink_reconciliation_report(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_reconciliation_report(text,text,text)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_reconciliation_report(text,text,text)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_reconciliation_report' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.tradelink_reconciliation_request_cleanup(text,bigint)') IS NULL
 OR has_function_privilege('anon','public.tradelink_reconciliation_request_cleanup(text,bigint)','EXECUTE')
 OR has_function_privilege('authenticated','public.tradelink_reconciliation_request_cleanup(text,bigint)','EXECUTE') IS DISTINCT FROM true
 OR pg_get_functiondef('public.tradelink_reconciliation_request_cleanup(text,bigint)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant tradelink_reconciliation_request_cleanup' USING ERRCODE='42501'; END IF;
 IF to_regprocedure('public.wm_admin_set_application_role(uuid,text,text,boolean)') IS NULL
 OR has_function_privilege('anon','public.wm_admin_set_application_role(uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_admin_set_application_role(uuid,text,text,boolean)','EXECUTE') IS DISTINCT FROM false
 OR pg_get_functiondef('public.wm_admin_set_application_role(uuid,text,text,boolean)'::regprocedure) NOT LIKE '%WS02D_B3_WORKSPACE_CEILING_DENIED%'
 THEN RAISE EXCEPTION 'Incorrect staged function/grant wm_admin_set_application_role' USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer'),
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member');
-- Authenticated clients must not receive EXECUTE on 3 restricted functions.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
-- Signed Viewer when advanced roles are disabled: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.append_module_activity(NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: append_module_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(NULL::uuid,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: charter_admin_set_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.commit_fueltrack_requests_with_activity(NULL::text,NULL::bigint,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: commit_fueltrack_requests_with_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_create_employee(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_create_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_review_transition(NULL::uuid,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_review_transition' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_save(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_save' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_employee(NULL::uuid,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_settings(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_settings' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: import_fueltrack_activity_backup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_archive(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_archive' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create_idempotent(NULL::jsonb,NULL::uuid);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create_idempotent' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_restore(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_restore' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_details(NULL::uuid,NULL::jsonb,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_details' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_status(NULL::uuid,NULL::text,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_status' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_asset_write(NULL::text,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_asset_write' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_activate(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_activate' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_release' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_assess' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_report(NULL::text,NULL::text,NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_report' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_request_cleanup(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_request_cleanup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
SET ROLE authenticated;
-- Signed Viewer when advanced roles are enabled: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.append_module_activity(NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: append_module_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(NULL::uuid,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: charter_admin_set_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.commit_fueltrack_requests_with_activity(NULL::text,NULL::bigint,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: commit_fueltrack_requests_with_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_create_employee(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_create_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_review_transition(NULL::uuid,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_review_transition' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_save(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_save' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_employee(NULL::uuid,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_settings(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_settings' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: import_fueltrack_activity_backup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_archive(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_archive' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create_idempotent(NULL::jsonb,NULL::uuid);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create_idempotent' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_restore(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_restore' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_details(NULL::uuid,NULL::jsonb,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_details' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_status(NULL::uuid,NULL::text,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_status' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_asset_write(NULL::text,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_asset_write' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_activate(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_activate' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_release' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_assess' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_report(NULL::text,NULL::text,NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_report' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_request_cleanup(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_request_cleanup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
-- Restricted RPCs remain nonclient executable; superuser fixture invokes body
-- with same synthetic signed user to prove that internal paths also fail closed.
-- Restricted internal routines under signed Viewer: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_qa_archive_once();
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_qa_archive_once' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: timetracker_commit_attendance_raw_gps03' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(NULL::uuid,NULL::text,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: wm_admin_set_application_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
-- Workspace Member cannot perform workspace-manage operations: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(NULL::uuid,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: charter_admin_set_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_settings(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_settings' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_archive(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_archive' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_restore(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_restore' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_activate(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_activate' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_release' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_assess' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_request_cleanup(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_request_cleanup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
-- Internal manage-only methods deny signed workspace Member: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_qa_archive_once();
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_qa_archive_once' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(NULL::uuid,NULL::text,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: wm_admin_set_application_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
-- Expire synthetic Viewer session and exercise every client-callable function.
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='dddddddd-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
-- Expired Viewer session denies every authenticated entrypoint: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.append_module_activity(NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: append_module_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(NULL::uuid,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: charter_admin_set_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.commit_fueltrack_requests_with_activity(NULL::text,NULL::bigint,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: commit_fueltrack_requests_with_activity' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_create_employee(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_create_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_review_transition(NULL::uuid,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_review_transition' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_save(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_save' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_employee(NULL::uuid,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_settings(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: employee_evaluation_update_settings' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.import_fueltrack_activity_backup(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: import_fueltrack_activity_backup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_archive(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_archive' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create(NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_create_idempotent(NULL::jsonb,NULL::uuid);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_create_idempotent' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_restore(NULL::uuid,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_restore' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_details(NULL::uuid,NULL::jsonb,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_details' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_update_status(NULL::uuid,NULL::text,NULL::integer);
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_update_status' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_asset_write(NULL::text,NULL::text,NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_asset_write' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_activate(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_activate' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_cleanup_fence_release' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_assess' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_report(NULL::text,NULL::text,NULL::text);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_report' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_request_cleanup(NULL::text,NULL::bigint);
  RAISE EXCEPTION 'Unexpected authorization success: tradelink_reconciliation_request_cleanup' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
-- Expired Viewer session denies restricted/internal RPC bodies: individual source-preserved domain function entrypoint denials.
DO $test$
BEGIN
 BEGIN
  PERFORM public.order_intake_qa_archive_once();
  RAISE EXCEPTION 'Unexpected authorization success: order_intake_qa_archive_once' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.timetracker_commit_attendance_raw_gps03(NULL::text,NULL::text,NULL::text,NULL::text,NULL::jsonb,NULL::text,NULL::jsonb);
  RAISE EXCEPTION 'Unexpected authorization success: timetracker_commit_attendance_raw_gps03' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
DO $test$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(NULL::uuid,NULL::text,NULL::text,NULL::boolean);
  RAISE EXCEPTION 'Unexpected authorization success: wm_admin_set_application_role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $test$;
ROLLBACK;
DO $after$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR (SELECT not_after<now() FROM auth.sessions
  WHERE id='dddddddd-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'All-domain denial test failed to roll back'
 USING ERRCODE='42501'; END IF;
 RAISE NOTICE 'WS02D/B3 all 24 source-preserved functions Viewer, manage and expired denial PASS';
END $after$;
