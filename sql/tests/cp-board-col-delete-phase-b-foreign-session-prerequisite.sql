-- CP-BOARD-COL-DELETE / Phase B — foreign-workspace and controlled-session readiness.
-- READ ONLY: no identity simulation, JWT injection, revocation, or mutations.
-- Aggregate only; no private user identifiers, tokens, session IDs or payload values.
-- RPC fingerprints are exact-source drift detectors, NOT real-session acceptance.
WITH qa AS (
 SELECT id,workspace_id
 FROM public.work_boards
 WHERE id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
   AND name='CP-BOARD-COL-DELETE QA Signed Fixture' AND status='active'
), membership AS (
 SELECT
   (SELECT count(*) FROM public.workspaces w
    WHERE NOT EXISTS (SELECT 1 FROM qa b WHERE b.workspace_id=w.id))
      AS additional_workspace_records,
   (SELECT count(*) FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
    WHERE wm.active IS TRUE
      AND NOT EXISTS (SELECT 1 FROM qa b WHERE b.workspace_id=wm.workspace_id))
      AS active_foreign_profiles,
   (SELECT count(*) FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
    JOIN qa b ON b.workspace_id=wm.workspace_id
    WHERE wm.active IS TRUE AND p.platform_role IN ('employee','hr'))
      AS available_same_workspace_low_privilege_profiles
), contracts AS (
 SELECT
  md5(pg_get_functiondef('private.wm_board_config_session_active()'::regprocedure))
    ='a2284885128169732cb646fe03adcd83' AS session_check_unchanged,
  md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))
    ='51a6f2574597107396e298277111e1c6' AS signed_recovery_check_unchanged,
  md5(pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure))
    ='6a7c23c439e8c59d7883bc8f59d66d08' AS board_boundary_unchanged,
  md5(pg_get_functiondef('public.wm_get_board(uuid)'::regprocedure))
    ='e019870106d498ed33612527cfc79315' AS signed_board_reader_unchanged
), control AS (
 SELECT
  (SELECT count(*)=1 FROM qa) AS qa_board_exists,
  (SELECT count(*)=1 FROM private.wm_recoverable_column_activation a
    WHERE a.id IS TRUE AND a.delete_enabled IS FALSE
      AND a.restore_enabled IS FALSE) AS flags_disabled,
  (SELECT count(*)=0 FROM private.wm_recoverable_column_qa_scope)
    AS no_temporary_scope,
  (SELECT count(*)=4 FROM public.work_board_item_values v
    JOIN public.work_board_columns c ON c.id=v.column_id
    JOIN qa b ON b.id=c.board_id WHERE c.name='Recovery Status')
    AS restored_qa_cells_present,
  (SELECT count(*)=4 FROM public.work_board_item_values v
    JOIN public.work_board_columns c ON c.id=v.column_id
    WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
      AND c.name='Status I') AS contacts_status_i_preserved
)
SELECT jsonb_build_object(
  'checkpoint','CP-BOARD-COL-DELETE-PHASE-B-FOREIGN-SESSION-PREREQUISITES',
  'status',CASE WHEN c.qa_board_exists AND c.flags_disabled AND
    c.no_temporary_scope AND c.restored_qa_cells_present AND
    c.contacts_status_i_preserved AND
    k.session_check_unchanged AND k.signed_recovery_check_unchanged AND
    k.board_boundary_unchanged AND k.signed_board_reader_unchanged
    THEN 'NONDESTRUCTIVE_BASELINE_VERIFIED'
    ELSE 'STOP_BASELINE_OR_AUTHORIZATION_DRIFT' END,
  'recovery_default_deny',c.flags_disabled,
  'temporary_scope_empty',c.no_temporary_scope,
  'qa_restored_cells_preserved',c.restored_qa_cells_present,
  'contacts_preserved',c.contacts_status_i_preserved,
  'session_validator_contract_unchanged',k.session_check_unchanged,
  'recovery_rpc_contract_unchanged',k.signed_recovery_check_unchanged,
  'board_workspace_boundary_contract_unchanged',k.board_boundary_unchanged,
  'board_reader_contract_unchanged',k.signed_board_reader_unchanged,
  'additional_workspace_records',m.additional_workspace_records,
  'active_foreign_workspace_profiles',m.active_foreign_profiles,
  'same_workspace_low_privilege_profiles',m.available_same_workspace_low_privilege_profiles,
  'signed_foreign_workspace_acceptance',CASE
    WHEN m.active_foreign_profiles=0 THEN 'BLOCKED_NO_GENUINE_ACTIVE_FOREIGN_WORKSPACE_IDENTITY'
    ELSE 'PENDING_GENUINE_SIGNED_FOREIGN_WORKSPACE_SESSION' END,
  'revoked_session_acceptance','PENDING_CONTROLLED_GENUINE_REVOKED_SESSION',
  'expired_session_acceptance','PENDING_CONTROLLED_GENUINE_EXPIRED_SESSION',
  'live_signed_session_verified',false,
  'sessions_altered',false,
  'roles_or_memberships_altered',false,
  'recovery_writes_attempted',0,
  'identifiers_disclosed',false
) AS foreign_session_prerequisite_report
FROM membership m CROSS JOIN contracts k CROSS JOIN control c;
