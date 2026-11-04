-- CP-TL-03C — read-only production dependency and drift gate.
-- DOES NOT ACTIVATE, CREATE, ALTER, REVOKE, GRANT, OR WRITE ANY OBJECTS.
-- SQL results are evidence for a separate, explicit approval; not permission to activate.
WITH expected_functions(signature,expected_definer,expected_md5,expected_result) AS (
  VALUES
   ('private.wm_board_config_session_active()',true,'a2284885128169732cb646fe03adcd83','boolean'),
   ('public.current_workspace_id(uuid)',true,'ceb6a14da8c7c8ed46187bae4833d575','uuid'),
   ('public.module_role_for(text,uuid)',true,'b141fe135313e49c246a51191ea7cb0c','text'),
   ('public.wm_add_board_item(uuid,uuid,text)',true,'eebceea5096a97ca070d89680441e9d4','uuid'),
   ('public.wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)',true,'68998f0e6767f42ebc8678168b2b5125','void'),
   ('public.wm_set_board_item_archived(uuid,boolean)',true,'2779713172639427dc2ef1e1d1ec33ce','void'),
   ('public.work_board_access(uuid,text)',true,'6a7c23c439e8c59d7883bc8f59d66d08','boolean'),
   ('public.work_board_log(uuid,text,text,text,text,jsonb)',true,'dec59ab06a615de59f36b8c3f8f9f9e5','void')
),
resolved AS (
 SELECT f.signature, f.expected_md5, f.expected_result,
  p.oid IS NOT NULL AS present,
  coalesce(p.prosecdef=f.expected_definer,false) AS definer_matches,
  coalesce(md5(pg_get_functiondef(p.oid))=f.expected_md5,false) AS definition_matches,
  coalesce(pg_get_function_result(p.oid)=f.expected_result,false) AS result_matches
 FROM expected_functions f
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature)::oid
),
assertions AS (
 SELECT
  EXISTS (
    SELECT 1 FROM public.work_boards b
    WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
      AND b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
      AND b.name='TradeLink' AND b.status='active'
      AND b.archived_at IS NULL AND b.trashed_at IS NULL
      AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
  ) AS board_identity_valid,
  (SELECT count(*) FROM public.work_board_groups
   WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) AS group_count,
  (SELECT count(*) FROM public.work_board_items
   WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) AS board_item_count,
  (SELECT count(*) FROM public.work_board_columns
   WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) AS column_count,
  to_regclass('public.tradelink_documents') IS NULL
   AND to_regclass('public.tradelink_document_events') IS NULL AS domain_tables_absent,
  to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
   AND to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
   AND to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
   AS domain_rpcs_absent,
  has_schema_privilege('authenticated','private','USAGE') AS signed_private_schema_usage,
  to_regclass('auth.sessions') IS NOT NULL AS auth_sessions_exists,
  (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('auth.sessions')
    AND attname IN ('id','user_id','not_after') AND NOT attisdropped)=3
    AS session_columns_present,
  (SELECT count(*) FROM resolved WHERE present AND definer_matches
    AND definition_matches AND result_matches)=8 AS dependency_signatures_pinned,
  (SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb)
   FROM resolved WHERE NOT (present AND definer_matches AND definition_matches
    AND result_matches)) AS changed_dependencies
)
SELECT *,
 CASE
  WHEN board_identity_valid AND group_count=1 AND board_item_count=0
   AND column_count=8 AND domain_tables_absent AND domain_rpcs_absent
   AND signed_private_schema_usage AND auth_sessions_exists AND session_columns_present
   AND dependency_signatures_pinned
  THEN 'PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED'
  ELSE 'BLOCKED__REVIEW_DRIFT_AND_RETEST'
 END AS readiness
FROM assertions;
