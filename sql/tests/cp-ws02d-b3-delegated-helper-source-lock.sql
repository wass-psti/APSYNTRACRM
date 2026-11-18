-- CP-WS-02D/B3 — production READ-ONLY internal helper call-chain review.
-- No auth session, workspace data, DML, DDL or privilege changes.
-- This verifies source binding and grants, NOT runtime authorization.
WITH expected(proname,source_md5,authenticated_execute,anon_execute) AS (
 VALUES
 ('module_state_write_allowed','7d04960ae75b3cbf4d2326111eed2b30',false,false),
 ('module_state_delete_allowed','0da3bb17c44ddf8158abaadd1460a5d5',false,false),
 ('put_module_state','cb66214a6f7970f0c272d59ab2c2f741',true,false),
 ('delete_module_state','74c5b010c94ad82abdddffb7236c4e03',true,false)
), actual AS (
 SELECT p.proname,md5(pg_get_functiondef(p.oid)) AS source_md5,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 pg_get_functiondef(p.oid) AS body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('module_state_write_allowed','module_state_delete_allowed',
  'put_module_state','delete_module_state')
), compared AS (
 SELECT e.proname,
  e.source_md5=a.source_md5 AND
  e.authenticated_execute=a.authenticated_execute AND
  e.anon_execute=a.anon_execute AND
  CASE e.proname
   WHEN 'put_module_state' THEN
    a.body ~* 'caller\s+uuid\s*:?=\s*auth\.uid\(\)' AND
    a.body LIKE '%module_state_write_allowed(p_module_id,p_state_key,caller)%'
   WHEN 'delete_module_state' THEN
    a.body ~* 'caller\s+uuid\s*:?=\s*auth\.uid\(\)' AND
    a.body LIKE '%module_state_delete_allowed(p_module_id,p_scope,caller)%'
   WHEN 'module_state_write_allowed' THEN
    a.body LIKE '%has_module_access(p_module_id,p_user_id)%'
   WHEN 'module_state_delete_allowed' THEN
    a.body LIKE '%has_module_access(p_module_id,p_user_id)%'
   ELSE false END AS matches
 FROM expected e LEFT JOIN actual a ON a.proname=e.proname
)
SELECT 'CP-WS-02D/B3-DELEGATED-HELPERS-SOURCE-LOCK' AS checkpoint,
 count(*)::integer AS expected_functions,
 count(*) FILTER (WHERE matches IS TRUE)::integer AS matched_functions,
 count(*) FILTER (WHERE matches IS NOT TRUE)::integer AS drifted_functions,
 CASE WHEN count(*)=4 AND count(*) FILTER (WHERE matches IS TRUE)=4
 THEN 'SIGNED_ENTRY_SOURCE_MATCH__RUNTIME_DENIAL_NOT_TESTED'
 ELSE 'SOURCE_DRIFT_REVIEW_REQUIRED' END AS result
FROM compared;
