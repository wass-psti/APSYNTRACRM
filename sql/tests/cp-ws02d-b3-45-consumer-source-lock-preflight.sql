-- CP-WS-02D/B3 — READ-ONLY, source-locked privacy compatibility catalog.
-- Exact 45 observed consumer fingerprints taken from the existing production
-- Supabase pg_proc catalog on 2026-11-06. NO DML/DDL, credentials or user rows.
-- Static classification is source-level only; genuine action runtime tests
-- and signed HTTP denial checks remain mandatory before production cutover.
-- Source drift MUST stop the cutover pending independent code review.
WITH expected(signature, source_md5, argument_source, authenticated_execute, security_definer) AS (
 VALUES
  ('public.acquire_module_operation_lock(p_module_id text, p_lock_key text, p_ttl_seconds integer)', '72cbaba52785b8ae3b29f9a3341d6ee9', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.append_module_activity(p_module_id text, p_event_id text, p_event_type text, p_title text, p_message text, p_request_id text, p_payload jsonb)', '5b37cb732bfd115cab7e90db58ed192f', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.aps_aims_custody_transition(p_asset_id uuid, p_action text, p_target_id uuid, p_notes text)', '2e4859f28f54eb28216390420fb5ab5d', 'DIRECT_AUTH_UID', TRUE, FALSE),
  ('public.aps_aims_finish_workflow(p_entity_id uuid, p_kind text, p_action text, p_notes text)', '4b702bd151e63c5af41255a0e43346f2', 'DIRECT_AUTH_UID', TRUE, FALSE),
  ('public.aps_aims_service_transition(p_asset_id uuid, p_kind text, p_action text, p_service_id uuid, p_input jsonb)', 'f313579534554f5ee634b7bf605c7eb6', 'DIRECT_AUTH_UID', TRUE, FALSE),
  ('public.aps_aims_transfer_asset(p_asset_id uuid, p_location_id uuid, p_notes text)', '213444b2bc9f845e87dab49b04816a9b', 'DIRECT_AUTH_UID', TRUE, FALSE),
  ('public.apsyntra_crm_my_effective_access()', '0106afb3cf4b33cc17822674920f5ac7', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.commit_fueltrack_requests_with_activity(p_value text, p_expected_revision bigint, p_event_id text, p_event_type text, p_title text, p_message text, p_request_id text, p_payload jsonb)', '4ed0b71c722ef5165250b651f3af05ce', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.delete_module_state(p_module_id text, p_state_key text, p_scope text, p_expected_revision bigint)', '74c5b010c94ad82abdddffb7236c4e03', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_create_employee(p_input jsonb)', '3dd42c3432a005df286313c92d9f1345', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_management_snapshot()', 'cfffc5bfcc2a817e36f9f544e27a4d89', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_my_snapshot()', 'ba6f93e8c3a975d15dae01cae90a8344', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_review_transition(p_evaluation_id uuid, p_target_status text, p_review_comment text, p_expected_revision bigint)', '0dba32d8f84cc3ccecec8dc12b60a4b3', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_save(p_input jsonb)', '71f32c1ba726e32e9fda0ffbab139efa', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_update_employee(p_id uuid, p_patch jsonb)', 'ff6444c8ebbb11e7966dd25a655e8f60', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.employee_evaluation_update_settings(p_patch jsonb)', 'c573ec4251b51a6f1865561aeac684cc', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.list_module_activity(p_module_id text, p_before_sequence bigint, p_limit integer)', '6ce047eb18e1419ce81129d4697b012d', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.list_module_directory(p_module_id text)', 'aa18e31dbae477e012d72dee238352c8', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.list_module_state(p_module_id text)', '4c50740bd81e40a4568b48686195e7f9', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.module_state_delete_allowed(p_module_id text, p_scope text, p_user_id uuid)', '0da3bb17c44ddf8158abaadd1460a5d5', 'INTERNAL_EXPLICIT_PARAM', FALSE, TRUE),
  ('public.module_state_write_allowed(p_module_id text, p_state_key text, p_user_id uuid)', '7d04960ae75b3cbf4d2326111eed2b30', 'INTERNAL_EXPLICIT_PARAM', FALSE, TRUE),
  ('public.order_intake_archive(p_id uuid, p_expected_revision integer)', '893ef210228eeaa5e07f4e1c777982d4', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.order_intake_create(p_order jsonb)', '97365c21506bf81389667b1314ad9a13', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.order_intake_create_idempotent(p_order jsonb, p_request_id uuid)', 'bf1d6594b6846ff5d8b0acdf77799ce3', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.order_intake_qa_archive_once()', '545be53d8ded36aff7ebc423b57dd741', 'AUTH_UID_LOCAL', FALSE, TRUE),
  ('public.order_intake_qa_create_once()', 'b3bea2bce00dee91c89df52f1ad3252b', 'AUTH_UID_LOCAL', FALSE, TRUE),
  ('public.order_intake_restore(p_id uuid, p_expected_revision integer)', '32998bbb80e1a15a5dd12f14a7f8f96a', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.order_intake_update_details(p_id uuid, p_patch jsonb, p_expected_revision integer)', '1c6d418d29f31b27a8e35597c7ca3c7a', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.order_intake_update_status(p_id uuid, p_status text, p_expected_revision integer)', 'ae38dd0d556a963388b513501beb9942', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.put_module_state(p_module_id text, p_state_key text, p_value text, p_scope text, p_expected_revision bigint)', 'cb66214a6f7970f0c272d59ab2c2f741', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.release_module_operation_lock(p_module_id text, p_lock_key text, p_token text)', '41662f82357f35042ec681f8f1a70152', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.timetracker_commit_attendance_raw_gps03(p_action text, p_record_id text, p_location text, p_department text, p_geo jsonb, p_work_note text, p_attendance_policy jsonb)', '985640385f673b5b8ef74ce480ec6ccd', 'AUTH_UID_LOCAL', FALSE, TRUE),
  ('public.timetracker_ot_require_scope(p_board_id uuid)', '6675db3a3ce62ceb9b6002c0009f13d5', 'AUTH_UID_LOCAL', FALSE, TRUE),
  ('public.tradelink_asset_read(p_vendor_id text, p_kind text)', '1e88ecf5d442bfaea96472ac9cf14557', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_asset_write(p_vendor_id text, p_kind text, p_image_data text, p_expected_revision bigint)', '1f00702f27deee65b3f134e81bb36cb7', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_cleanup_fence_activate(p_storage_key text, p_expected_revision bigint)', 'aeda00392edb96c1269e7c60bc6e1f56', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_cleanup_fence_release(p_storage_key text)', '7ecd455a908c55d3136a85c2bfd01660', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_assess(p_storage_key text)', '55678732a50cca6d4d4dd2cd0b0b4810', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_cleanup_audit_list(p_limit integer)', '51593fd9f77ba8622b539818b74d05ce', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_cleanup_preflight(p_storage_key text, p_expected_revision bigint)', 'a4bf9429401aca7787e3b9a73dbae40e', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_list(p_limit integer)', '15d3a91f7da75b7d14816728865014d7', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_report(p_storage_key text, p_attachment_id text, p_reason text)', '6327889c48be4e8d69c576513958c3c1', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_request_cleanup(p_storage_key text, p_expected_revision bigint)', 'fa073e92fe1300403d3088a927b53b44', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.tradelink_reconciliation_verify_revision(p_storage_key text, p_expected_revision bigint)', 'fc911ce0107286ebea8f670d77f2629c', 'AUTH_UID_LOCAL', TRUE, TRUE),
  ('public.wm_board_permission_allowed(p_workspace_id uuid, p_module_id text, p_capability text)', '38e67feeb13bd146443594422c061fd8', 'AUTH_UID_LOCAL', TRUE, TRUE)
), live AS (
 SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS signature,
  md5(pg_get_functiondef(p.oid)) AS source_md5,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS body,
  split_part(pg_get_functiondef(p.oid),'has_module_access(',2) AS after_call
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind='f'
  AND p.proname <> 'has_module_access'
  AND pg_get_functiondef(p.oid) ILIKE '%has_module_access(%'
), observed AS (
 SELECT signature,source_md5,authenticated_execute,security_definer,
  CASE
   WHEN after_call ~ '^[^,]+,\s*auth\.uid\(\)\s*\)' THEN 'DIRECT_AUTH_UID'
   WHEN after_call ~ '^[^,]+,\s*p_user_id\s*\)' THEN 'INTERNAL_EXPLICIT_PARAM'
   WHEN substring(after_call FROM '^[^,]+,\s*([a-z_][a-z_0-9]*)\s*\)') IS NOT NULL
    AND body ~* ('\m' || substring(after_call FROM '^[^,]+,\s*([a-z_][a-z_0-9]*)\s*\)') || '\s+uuid\s*:?=\s*auth\.uid\(\)')
    THEN 'AUTH_UID_LOCAL'
   ELSE 'REQUIRES_MANUAL_REVIEW' END AS argument_source
 FROM live
), comparison AS (
 SELECT coalesce(e.signature,o.signature) AS signature,
  e.argument_source AS expected_origin,
  o.argument_source AS observed_origin,
  e.signature IS NOT NULL AND o.signature IS NOT NULL
   AND e.source_md5 = o.source_md5
   AND e.argument_source = o.argument_source
   AND e.authenticated_execute = o.authenticated_execute
   AND e.security_definer = o.security_definer AS matches
 FROM expected e FULL OUTER JOIN observed o ON o.signature = e.signature
)
SELECT 'CP-WS-02D/B3-45-CONSUMER-SOURCE-LOCK' AS checkpoint,
 count(*)::integer AS compared,
 count(*) FILTER (WHERE matches IS TRUE)::integer AS matched,
 count(*) FILTER (WHERE matches IS NOT TRUE)::integer AS drifted,
 count(*) FILTER (WHERE observed_origin='DIRECT_AUTH_UID')::integer AS direct_auth_uid,
 count(*) FILTER (WHERE observed_origin='AUTH_UID_LOCAL')::integer AS signed_local_actor,
 count(*) FILTER (WHERE observed_origin='INTERNAL_EXPLICIT_PARAM')::integer AS delegated_parameter,
 CASE WHEN count(*)=45 AND count(*) FILTER (WHERE matches IS TRUE)=45
  THEN 'SOURCE_LOCK_MATCH__RUNTIME_COMPATIBILITY_STILL_PENDING'
  ELSE 'BLOCKED_SOURCE_DRIFT__CUTOVER_NOT_AUTHORIZED' END AS result
FROM comparison;
