-- CP-TL-03C / Phase 1 — live read-only Stage A + Stage B prerequisites.
-- This query NEVER activates Stage B or changes roles, grants, RLS, data, or sessions.
-- Compare the exact installed fingerprints against the prior reviewed Stage A baseline.
-- Use only on the existing WatchdogWorkspace production project.
WITH expected_dependencies(signature,fingerprint,definer) AS (
 VALUES
 ('private.wm_board_config_session_active()','a2284885128169732cb646fe03adcd83',true),
 ('public.current_workspace_id(uuid)','ceb6a14da8c7c8ed46187bae4833d575',true),
 ('public.module_role_for(text,uuid)','b141fe135313e49c246a51191ea7cb0c',true),
 ('public.wm_add_board_item(uuid,uuid,text)','eebceea5096a97ca070d89680441e9d4',true),
 ('public.wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)','68998f0e6767f42ebc8678168b2b5125',true),
 ('public.wm_set_board_item_archived(uuid,boolean)','2779713172639427dc2ef1e1d1ec33ce',true),
 ('public.work_board_access(uuid,text)','6a7c23c439e8c59d7883bc8f59d66d08',true),
 ('public.work_board_log(uuid,text,text,text,text,jsonb)','dec59ab06a615de59f36b8c3f8f9f9e5',true)
), expected_domain(signature,fingerprint,definer) AS (
 VALUES
 ('private.tl03_can_manage(uuid)','f6e296482687622037436bedf5ae58a2',true),
 ('private.tl03_commit(uuid,uuid,bigint,text,jsonb)','661e491750fbc9eeb0f619d701496306',true),
 ('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','5b892128e76aa496e99053bcda7f2b03',false),
 ('public.tl03_document_read(uuid,uuid)','906afa8dcf67da8370a0bc50b918ab4b',false),
 ('public.tl03_documents_list(uuid,integer)','93b96d5e0638118b04ffbe20d128f331',false)
), all_expected AS (
 SELECT 'dependency' AS category,* FROM expected_dependencies
 UNION ALL
 SELECT 'domain' AS category,* FROM expected_domain
), source_checks AS (
 SELECT category,signature,
  p.oid IS NOT NULL AND p.prosecdef=expected.definer
   AND md5(pg_get_functiondef(p.oid))=expected.fingerprint AS matches
 FROM all_expected expected
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)::oid
), b AS (
 SELECT *
 FROM public.work_boards
 WHERE id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid
  AND name='TradeLink' AND status='active'
  AND archived_at IS NULL AND trashed_at IS NULL
  AND description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
), checks AS (
 SELECT jsonb_build_object(
 'installed_stage_a_migration',EXISTS(
  SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version='20261105011611' AND name='cp_tl03c_stage_a_readonly_domain_activation'),
 'board_identity', (SELECT count(*)=1 FROM b),
 'board_shape',(SELECT count(*)=1 FROM public.work_board_groups g JOIN b ON b.id=g.board_id)
    AND (SELECT count(*)=8 FROM public.work_board_columns c JOIN b ON b.id=c.board_id)
    AND (SELECT count(*)=0 FROM public.work_board_items i JOIN b ON b.id=i.board_id),
 'domain_tables_present_and_empty',
  to_regclass('public.tradelink_documents') IS NOT NULL
  AND to_regclass('public.tradelink_document_events') IS NOT NULL
  AND (SELECT count(*)=0 FROM public.tradelink_documents)
  AND (SELECT count(*)=0 FROM public.tradelink_document_events),
 'domain_rls_enabled', (SELECT count(*)=2 FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
   AND c.relname IN ('tradelink_documents','tradelink_document_events')
   AND c.relrowsecurity),
 'only_scoped_read_policies',(SELECT count(*)=2 FROM pg_policies
  WHERE schemaname='public'
  AND tablename IN ('tradelink_documents','tradelink_document_events')
  AND cmd='SELECT' AND policyname IN ('tl03_docs_read','tl03_events_read')
  AND qual='private.tl03_can_manage(board_id)')
  AND (SELECT count(*)=2 FROM pg_policies
  WHERE schemaname='public'
  AND tablename IN ('tradelink_documents','tradelink_document_events')),
 'authenticated_read_only_grants',
  has_function_privilege('authenticated','public.tl03_document_read(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.tl03_documents_list(uuid,integer)','EXECUTE')
  AND has_table_privilege('authenticated','public.tradelink_documents','SELECT')
  AND has_table_privilege('authenticated','public.tradelink_document_events','SELECT'),
 'anonymous_domain_denied',
  NOT has_function_privilege('anon','public.tl03_document_read(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.tl03_documents_list(uuid,integer)','EXECUTE')
  AND NOT has_function_privilege('anon','public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  AND NOT has_table_privilege('anon','public.tradelink_documents','SELECT')
  AND NOT has_table_privilege('anon','public.tradelink_document_events','SELECT'),
 'stage_b_public_and_private_writes_disabled',
  NOT has_function_privilege('authenticated','public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE'),
 'direct_document_and_audit_writes_denied',
  NOT has_table_privilege('authenticated','public.tradelink_documents','INSERT')
  AND NOT has_table_privilege('authenticated','public.tradelink_documents','UPDATE')
  AND NOT has_table_privilege('authenticated','public.tradelink_documents','DELETE')
  AND NOT has_table_privilege('authenticated','public.tradelink_document_events','INSERT')
  AND NOT has_table_privilege('authenticated','public.tradelink_document_events','UPDATE')
  AND NOT has_table_privilege('authenticated','public.tradelink_document_events','DELETE'),
 'immutable_audit_trigger',EXISTS(
  SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.tradelink_document_events'::regclass
    AND tgname='tl03_events_append_only' AND NOT tgisinternal AND tgenabled<>'D'),
 'signed_session_catalog',to_regclass('auth.sessions') IS NOT NULL
  AND (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='auth.sessions'::regclass
   AND attname IN ('id','user_id','not_after') AND NOT attisdropped),
 'central_dependency_fingerprints',(SELECT count(*)=8 FROM source_checks
  WHERE category='dependency' AND matches IS TRUE),
 'installed_tl03_function_fingerprints',(SELECT count(*)=5 FROM source_checks
  WHERE category='domain' AND matches IS TRUE),
 'authenticated_private_schema_usage',has_schema_privilege('authenticated','private','USAGE')
 ) AS verified_checks
), tally AS (
 SELECT verified_checks,
  (SELECT count(*) FROM jsonb_each(verified_checks)) AS total,
  (SELECT count(*) FROM jsonb_each(verified_checks) AS c(key,value)
   WHERE c.value='true'::jsonb) AS passed,
  (SELECT coalesce(jsonb_agg(key ORDER BY key),'[]'::jsonb)
   FROM jsonb_each(verified_checks) AS c(key,value)
   WHERE c.value IS DISTINCT FROM 'true'::jsonb) AS failed
 FROM checks
)
SELECT jsonb_build_object(
 'checkpoint','CP-TL-03C-PHASE-1',
 'status',CASE WHEN passed=total
  THEN 'STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED'
  ELSE 'BLOCKED_CONTRACT_OR_PERMISSION_DRIFT' END,
 'checks_passed',passed,'checks_total',total,
 'failed_checks',failed,'checks',verified_checks,
 'stage_b_write_grant_applied',false,
 'production_data_mutations_attempted',0,
 'live_signed_role_acceptance_verified',false,
 'current_backup_restore_verified',false,
 'separate_stage_b_permission_approval_received',false
) AS cp_tl03c_phase1_readonly
FROM tally;
