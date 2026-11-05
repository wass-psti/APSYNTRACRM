-- CP-WS-02D/B2 — READ-ONLY domain authorization integration inventory.
-- Source-text classification is a review aid, not proof of authorization gaps.
-- No user data, emails, tokens, table rows, grants, or DML.
WITH routines AS (
 SELECT p.proname,n.nspname AS schema_name,
  pg_get_functiondef(p.oid) AS routine_body
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
), classification AS (
 SELECT proname,
  routine_body ILIKE '%work_board_access%' AS delegates_board_acl,
  routine_body ILIKE '%current_workspace_id%' AS uses_workspace_scope,
  routine_body ~* '(INSERT INTO|UPDATE public[.]|DELETE FROM|PERFORM public[.])'
   AS possible_mutation
 FROM routines
)
SELECT
 count(*) FILTER (WHERE delegates_board_acl) AS public_definer_board_acl_references,
 count(*) FILTER (WHERE uses_workspace_scope) AS public_definer_scope_references,
 count(*) FILTER (WHERE NOT delegates_board_acl AND uses_workspace_scope
  AND possible_mutation) AS independent_domain_review_candidates,
 (SELECT jsonb_agg(name ORDER BY name) FROM (
  SELECT proname AS name FROM classification
  WHERE NOT delegates_board_acl AND uses_workspace_scope AND possible_mutation
  ORDER BY proname LIMIT 30
 ) sample) AS review_candidate_names
FROM classification;
