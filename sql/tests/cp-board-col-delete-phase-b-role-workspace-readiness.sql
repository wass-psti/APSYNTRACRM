-- CP-BOARD-COL-DELETE / Phase B: genuine signed role and workspace
-- denial acceptance readiness. READ ONLY; aggregate output, no user IDs/JWTs.
-- A member count does NOT certify an actual signed session or role denial.
WITH qa AS (
 SELECT id,workspace_id,created_by
 FROM public.work_boards
 WHERE id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
  AND name='CP-BOARD-COL-DELETE QA Signed Fixture' AND status='active'
), active_qa_members AS (
 SELECT wm.user_id,p.platform_role
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
 JOIN qa b ON b.workspace_id=wm.workspace_id
 WHERE wm.active IS TRUE
), candidates AS (
 SELECT count(*) FILTER (WHERE m.user_id<>b.created_by
   AND m.platform_role IN ('employee','hr')) AS existing_nonadmin_candidates,
   count(*) FILTER (WHERE m.user_id<>b.created_by) AS existing_noncreator_members
 FROM active_qa_members m CROSS JOIN qa b
), foreign_members AS (
 SELECT count(*) AS active_foreign_memberships
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
 WHERE wm.active IS TRUE
  AND NOT EXISTS (SELECT 1 FROM qa b WHERE b.workspace_id=wm.workspace_id)
), conditions AS (
 SELECT
  (SELECT count(*)=1 FROM qa) AS single_qa_fixture,
  (SELECT count(*)=1 FROM private.wm_recoverable_column_activation a
    WHERE a.id IS TRUE AND a.delete_enabled IS FALSE
     AND a.restore_enabled IS FALSE) AS both_recovery_flags_disabled,
  (SELECT count(*)=0 FROM private.wm_recoverable_column_qa_scope) AS qa_scope_empty,
  (SELECT count(*) FROM public.work_board_members bm JOIN qa b ON b.id=bm.board_id)
    AS explicit_qa_board_members,
  (SELECT count(*) FROM public.workspaces w
    WHERE NOT EXISTS(SELECT 1 FROM qa b WHERE b.workspace_id=w.id))
    AS other_workspace_records,
  (SELECT active_foreign_memberships FROM foreign_members) AS foreign_active_members,
  (SELECT existing_nonadmin_candidates FROM candidates) AS nonadmin_candidates,
  (SELECT existing_noncreator_members FROM candidates) AS noncreator_members,
  (SELECT count(*) FROM public.work_board_item_values v
   JOIN public.work_board_columns c ON c.id=v.column_id JOIN qa b ON b.id=c.board_id
   WHERE c.name='Recovery Status') AS qa_cell_count,
  (SELECT count(*) FROM public.work_board_item_values v
   JOIN public.work_board_columns c ON c.id=v.column_id
   WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
     AND c.name='Status I') AS protected_contacts_values
)
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-PHASE-B-ROLE-WORKSPACE-READINESS',
 'status',CASE WHEN c.single_qa_fixture AND c.both_recovery_flags_disabled
  AND c.qa_scope_empty AND c.qa_cell_count=4 AND c.protected_contacts_values=4
  THEN 'READONLY_DENIAL_PREFLIGHT_PASS' ELSE 'DENIAL_PREFLIGHT_REVIEW_REQUIRED' END,
 'recovery_flags_disabled',c.both_recovery_flags_disabled,
 'temporary_qa_scope_empty',c.qa_scope_empty,
 'qa_items_cells_preserved',c.qa_cell_count=4,
 'contacts_status_i_preserved',c.protected_contacts_values=4,
 'explicit_qa_board_members',c.explicit_qa_board_members,
 'same_workspace_nonadmin_candidates',c.nonadmin_candidates,
 'same_workspace_noncreator_members',c.noncreator_members,
 'other_workspace_records',c.other_workspace_records,
 'active_foreign_workspace_memberships',c.foreign_active_members,
 'signed_nonmanager_acceptance','PENDING_GENUINE_SIGNED_SESSION',
 'signed_foreign_workspace_acceptance',
  CASE WHEN c.foreign_active_members=0
   THEN 'BLOCKED_NO_ACTIVE_FOREIGN_WORKSPACE_MEMBERSHIP'
   ELSE 'PENDING_GENUINE_SIGNED_SESSION' END,
 'role_changes_attempted',false,'sessions_created_or_revoked',false,
 'identifiers_disclosed',false,'signed_user_denial_certified_by_sql',false
) AS phase_b_denial_readiness
FROM conditions c;
