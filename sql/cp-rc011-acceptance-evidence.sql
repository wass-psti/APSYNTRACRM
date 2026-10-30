-- CP-RC01.1 independent READ-ONLY signed acceptance reconciliation.
-- Run only after each existing bootstrap account performs the genuine browser test.
-- This SQL NEVER impersonates auth.uid(), changes a profile, or inserts an audit entry.

SELECT lower(split_part(b.canonical_email,'@',1)) AS bootstrap_account,
 count(DISTINCT r.id) FILTER (
  WHERE r.operation='role.create'
    AND r.payload->>'kind'='proposal_only'
    AND r.payload->>'roleKey' LIKE 'cp_rc01_qa_%'
 ) AS signed_acceptance_proposals,
 count(DISTINCT a.id) FILTER (
  WHERE r.operation='role.create'
    AND r.payload->>'kind'='proposal_only'
    AND r.payload->>'roleKey' LIKE 'cp_rc01_qa_%'
    AND a.event='proposed'
    AND a.actor_id=b.user_id
    AND a.workspace_id=r.workspace_id
 ) AS actor_correlated_audit_events
FROM public.apsyntra_role_bootstrap_identities b
LEFT JOIN public.apsyntra_role_change_requests r ON r.proposed_by=b.user_id
LEFT JOIN public.apsyntra_role_change_audit a ON a.change_id=r.id
GROUP BY b.canonical_email
ORDER BY bootstrap_account;

SELECT
 (SELECT count(*) FROM public.module_role_assignments) AS existing_live_assignments,
 (SELECT count(*) FROM public.apsyntra_role_templates WHERE kind='system_reference') AS system_role_references,
 (SELECT count(*) FROM public.apsyntra_role_templates WHERE kind='custom_draft') AS draft_roles,
 (SELECT count(*) FROM public.apsyntra_role_change_requests
  WHERE status<>'proposed') AS unexpected_applied_proposals,
 (SELECT count(*) FROM public.apsyntra_role_change_audit a
  LEFT JOIN public.apsyntra_role_change_requests r ON r.id=a.change_id
  WHERE r.id IS NULL OR a.workspace_id<>r.workspace_id OR a.actor_id<>r.proposed_by
    OR a.event<>'proposed') AS inconsistent_audit_rows,
 (SELECT count(*) FROM public.work_boards b WHERE b.status='active'
   AND b.description LIKE '[APSYNTRA:MODULE:%:v1]%') AS dedicated_boards,
 (SELECT count(*) FROM public.work_board_items i JOIN public.work_boards b ON b.id=i.board_id
  WHERE b.status='active' AND b.description LIKE '[APSYNTRA:MODULE:%:v1]%') AS active_dedicated_items;

SELECT n.nspname||'.'||p.proname AS function_name,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'apsyntra_role_is_bootstrap',
 'apsyntra_role_configuration_snapshot',
 'apsyntra_role_configuration_propose',
 'apsyntra_role_require_scope',
 'apsyntra_role_audit_insert',
 'apsyntra_role_block_audit_mutation'
)
ORDER BY function_name;
