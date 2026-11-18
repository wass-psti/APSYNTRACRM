-- CP-WS-02D/B3 — READ-ONLY prerequisite inventory for proposed Edge host.
-- Inspects pg_proc metadata only. No auth sessions, user data, DML or DDL.
-- This confirms existing RPC source/contracts, NOT an approved or deployed host.
WITH expected(schema_name, function_name, identity_args, source_md5,
              authenticated_execute, anon_execute) AS (
 VALUES
 ('public','wm_ws01_list','','9f8c947a4a13083330b4c98fe77b57b1',true,false),
 ('private','wm_board_config_session_active','','a2284885128169732cb646fe03adcd83',false,false),
 ('public','wm_auth_access_context','','4b724270f79a4627fbbf45d0c932bd97',true,false),
 ('public','has_module_access','p_module_id text, p_user_id uuid','3d44e27eed8d67ac223a9c4353d6003a',true,false)
), actual AS (
 SELECT n.nspname AS schema_name,p.proname AS function_name,
 pg_get_function_identity_arguments(p.oid) AS identity_args,
 md5(pg_get_functiondef(p.oid)) AS source_md5,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname,p.proname) IN (
  ('public','wm_ws01_list'),
  ('private','wm_board_config_session_active'),
  ('public','wm_auth_access_context'),
  ('public','has_module_access'))
), comparisons AS (
 SELECT e.schema_name,e.function_name,
  a.source_md5=e.source_md5
  AND a.authenticated_execute=e.authenticated_execute
  AND a.anon_execute=e.anon_execute
  AND CASE e.function_name
   WHEN 'wm_ws01_list' THEN
     a.definition LIKE '%private.wm_board_config_session_active()%'
   WHEN 'wm_board_config_session_active' THEN
     a.definition LIKE '%FROM auth.sessions%'
     AND a.definition LIKE '%session_id%'
   WHEN 'wm_auth_access_context' THEN
     a.definition LIKE '%auth.uid()%'
   WHEN 'has_module_access' THEN
     a.definition LIKE '%p_user_id uuid DEFAULT auth.uid()%'
   ELSE false END AS matches
 FROM expected e LEFT JOIN actual a
  ON a.schema_name=e.schema_name
  AND a.function_name=e.function_name
  AND a.identity_args=e.identity_args
)
SELECT 'CP-WS-02D/B3-EDGE-HOST-SESSION-SOURCE-LOCK' AS checkpoint,
 count(*)::integer AS expected_functions,
 count(*) FILTER(WHERE matches IS TRUE)::integer AS matched_functions,
 count(*) FILTER(WHERE matches IS NOT TRUE)::integer AS drifted_functions,
 CASE WHEN count(*)=4 AND count(*) FILTER(WHERE matches IS TRUE)=4
 THEN 'EXISTING_SIGNED_SESSION_RPC_SOURCE_MATCH__HOST_UNDEPLOYED'
 ELSE 'BLOCKED_SOURCE_DRIFT__HOST_NOT_APPROVED' END AS result
FROM comparisons;
