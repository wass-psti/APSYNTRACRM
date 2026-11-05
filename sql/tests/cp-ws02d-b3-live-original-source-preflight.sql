-- CP-WS-02D/B3 — READ ONLY production fingerprint / activation inventory.
-- Does NOT impersonate or simulate a signed user. No writes, grants or PII.
-- Expected source hashes come from live inspected original definitions (2026-11-05).
-- Re-run before separately authorized role migration; never use this result
-- alone as evidence of genuine signed-user domain write authorization.
WITH expected(signature, fingerprint) AS (
 VALUES
  ('public.wm_create_board(text,text)'::text,'8925b3f3203d41306cfbc8a8f21bae87'::text),
  ('public.wm_create_board_configured(text,text,jsonb)'::text,'46576d8e4a295fa95f158d87dc1f0504'::text),
  ('public.put_module_state(text,text,text,text,bigint)'::text,'cb66214a6f7970f0c272d59ab2c2f741'::text),
  ('public.delete_module_state(text,text,text,bigint)'::text,'74c5b010c94ad82abdddffb7236c4e03'::text),
  ('public.acquire_module_operation_lock(text,text,integer)'::text,'72cbaba52785b8ae3b29f9a3341d6ee9'::text),
  ('public.release_module_operation_lock(text,text,text)'::text,'41662f82357f35042ec681f8f1a70152'::text),
  ('public.append_module_activity(text,text,text,text,text,text,jsonb)'::text,'5b37cb732bfd115cab7e90db58ed192f'::text),
  ('public.charter_admin_set_role(uuid,text,boolean)'::text,'105feace9e2f6b6248e062b6b8829767'::text),
  ('public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)'::text,'4ed0b71c722ef5165250b651f3af05ce'::text),
  ('public.employee_evaluation_create_employee(jsonb)'::text,'3dd42c3432a005df286313c92d9f1345'::text),
  ('public.employee_evaluation_review_transition(uuid,text,text,bigint)'::text,'0dba32d8f84cc3ccecec8dc12b60a4b3'::text),
  ('public.employee_evaluation_save(jsonb)'::text,'71f32c1ba726e32e9fda0ffbab139efa'::text),
  ('public.employee_evaluation_update_employee(uuid,jsonb)'::text,'ff6444c8ebbb11e7966dd25a655e8f60'::text),
  ('public.employee_evaluation_update_settings(jsonb)'::text,'c573ec4251b51a6f1865561aeac684cc'::text),
  ('public.import_fueltrack_activity_backup(jsonb)'::text,'2dc777a252161222a3d2e316dd458eb6'::text),
  ('public.order_intake_archive(uuid,integer)'::text,'893ef210228eeaa5e07f4e1c777982d4'::text),
  ('public.order_intake_create(jsonb)'::text,'97365c21506bf81389667b1314ad9a13'::text),
  ('public.order_intake_create_idempotent(jsonb,uuid)'::text,'bf1d6594b6846ff5d8b0acdf77799ce3'::text),
  ('public.order_intake_qa_archive_once()'::text,'545be53d8ded36aff7ebc423b57dd741'::text),
  ('public.order_intake_restore(uuid,integer)'::text,'32998bbb80e1a15a5dd12f14a7f8f96a'::text),
  ('public.order_intake_update_details(uuid,jsonb,integer)'::text,'1c6d418d29f31b27a8e35597c7ca3c7a'::text),
  ('public.order_intake_update_status(uuid,text,integer)'::text,'ae38dd0d556a963388b513501beb9942'::text),
  ('public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)'::text,'985640385f673b5b8ef74ce480ec6ccd'::text),
  ('public.tradelink_asset_write(text,text,text,bigint)'::text,'1f00702f27deee65b3f134e81bb36cb7'::text),
  ('public.tradelink_cleanup_fence_activate(text,bigint)'::text,'aeda00392edb96c1269e7c60bc6e1f56'::text),
  ('public.tradelink_cleanup_fence_release(text)'::text,'7ecd455a908c55d3136a85c2bfd01660'::text),
  ('public.tradelink_reconciliation_assess(text)'::text,'55678732a50cca6d4d4dd2cd0b0b4810'::text),
  ('public.tradelink_reconciliation_report(text,text,text)'::text,'6327889c48be4e8d69c576513958c3c1'::text),
  ('public.tradelink_reconciliation_request_cleanup(text,bigint)'::text,'fa073e92fe1300403d3088a927b53b44'::text),
  ('public.wm_admin_set_application_role(uuid,text,text,boolean)'::text,'3bd0edfb36b956ca68729ea81dc7a83e'::text)
), source_integrity AS (
 SELECT count(*)::int AS expected_paths,
  count(*) FILTER(WHERE to_regprocedure(signature) IS NOT NULL)::int AS existing_paths,
  count(*) FILTER(WHERE md5(pg_get_functiondef(to_regprocedure(signature)))=fingerprint)::int
   AS unchanged_paths,
  count(*) FILTER(WHERE has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'))::int
   AS anonymous_executable_paths
 FROM expected
), active_catalog AS (
 SELECT count(*)::int AS identified_candidates_now
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
  AND pg_get_functiondef(p.oid) ILIKE '%current_workspace_id%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%work_board_access%'
  AND pg_get_functiondef(p.oid) ~* '(INSERT INTO|UPDATE public[.]|DELETE FROM|PERFORM public[.])'
), activation AS (
 SELECT to_regclass('private.ws02d_invitation_flags') IS NULL
  AND to_regclass('private.ws02d_invitations') IS NULL
  AND to_regclass('private.ws02d_delivery_receipts') IS NULL
  AND to_regclass('private.ws02d_delivery_events') IS NULL
  AND to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
  AND to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
  AND to_regprocedure('private.ws02d_record_delivery_outcome(uuid,text,uuid)') IS NULL
   AS ws02d_runtime_absent,
  (SELECT creation_enabled IS FALSE AND selection_enabled IS FALSE
    FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
   AS lifecycle_disabled,
  md5(pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure))
   ='6a7c23c439e8c59d7883bc8f59d66d08' AS board_acl_unchanged,
  has_function_privilege('authenticated',
    'public.has_module_access(text,uuid)','EXECUTE')
   AND has_function_privilege('authenticated',
    'public.wm_auth_access_context()','EXECUTE')
    AS signed_read_predicates_granted
)
SELECT CASE WHEN s.expected_paths=30 AND s.existing_paths=30
 AND s.unchanged_paths=30 AND s.anonymous_executable_paths=0
 AND c.identified_candidates_now=30
 AND a.ws02d_runtime_absent AND a.lifecycle_disabled
 AND a.board_acl_unchanged AND a.signed_read_predicates_granted
 THEN 'WS02D_B3_LIVE_30_ORIGINAL_FUNCTIONS_AND_DEFAULT_DENY_VERIFIED'
 ELSE 'WS02D_B3_LIVE_SOURCE_OR_ACTIVATION_DRIFT_BLOCKED'
 END AS status,
 s.*,c.*,a.*,
 (SELECT count(*) FROM public.workspaces) AS workspace_count,
 (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships
FROM source_integrity s CROSS JOIN active_catalog c CROSS JOIN activation a;
