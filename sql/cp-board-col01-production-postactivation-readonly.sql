-- CP-BOARD-COL01 — SELECT-ONLY post-activation database contract evidence.
-- Safe to run before activation: reports NOT_ACTIVATED rather than inventing PASS.
-- Not a real GoTrue/HTTPS test and not a production deployment authorization.
WITH expected(signature) AS (
  VALUES
  ('public.wm_add_board_member(uuid,text,text)'::text),
  ('public.wm_col01_session_active()'::text),
  ('public.wm_board_invitable_users(uuid,text)'::text),
  ('public.wm_list_board_item_updates(uuid,integer)'::text),
  ('public.wm_list_board_item_files(uuid,integer)'::text),
  ('public.wm_list_board_events_page(uuid,bigint,integer)'::text)
), inspected AS (
  SELECT e.signature, p.oid,
         coalesce(p.prosecdef,false) AS security_definer,
         coalesce('search_path=""' = ANY(p.proconfig),false)
           AS pinned_empty_search_path,
         coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
           AS signed_execute,
         coalesce(NOT has_function_privilege('anon',p.oid,'EXECUTE'),false)
           AS anon_denied,
         coalesce(pg_get_functiondef(p.oid),'') AS definition
  FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
), score AS (
  SELECT count(*) FILTER (WHERE oid IS NULL)::integer AS missing_functions,
         string_agg(signature,', ' ORDER BY signature) FILTER (WHERE oid IS NULL)
           AS missing_signatures,
         bool_and(security_definer AND pinned_empty_search_path
                  AND signed_execute AND anon_denied) AS hardened_grants_and_path,
         bool_and(
           CASE WHEN signature='public.wm_add_board_member(uuid,text,text)'
             THEN position('wm_col01_session_active' IN definition)>0
                  AND position('Active member of this workspace required' IN definition)>0
                  AND position('Board owner role cannot be reassigned' IN definition)>0
             WHEN signature='public.wm_col01_session_active()'
             THEN position('auth.sessions' IN definition)>0
                  AND position('session_id' IN definition)>0
             ELSE position('wm_col01_session_active' IN definition)>0
           END
         ) AS candidate_guard_markers_present
  FROM inspected
), table_scope AS (
  SELECT count(*)=4 AS restricted_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('work_board_members','work_board_item_updates',
                      'work_board_item_files','work_board_events')
    AND c.relrowsecurity
    AND NOT has_table_privilege('anon',c.oid,'SELECT')
    AND NOT has_table_privilege('authenticated',c.oid,'SELECT')
)
SELECT
 'CP-BOARD-COL01' AS checkpoint,
 pg_catalog.now() AS captured_at,
 missing_functions,missing_signatures,
 hardened_grants_and_path,
 candidate_guard_markers_present,
 restricted_tables,
 CASE
   WHEN missing_functions>0 THEN 'NOT_ACTIVATED'
   WHEN NOT hardened_grants_and_path OR NOT candidate_guard_markers_present
        OR NOT restricted_tables THEN 'STOP_POSTACTIVATION_CONTRACT_DRIFT'
   ELSE 'SCHEMA_PRESENT_SIGNED_HTTPS_ACCEPTANCE_STILL_REQUIRED'
 END AS sql_contract_decision,
 'NO_GO_WITHOUT_REAL_SIGNED_RUNTIME_AND_INDEPENDENT_APPROVAL'
   AS release_decision
FROM score CROSS JOIN table_scope;
