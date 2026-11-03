-- CP-BOARD-COL01 — SELECT-ONLY production test-prerequisite snapshot.
-- No writes, credentials, user identities, or bearer tokens. This is not signoff.
-- A structural fixture does NOT establish an approved disposable test identity.
WITH workspace_inventory AS (
  SELECT w.id,
         count(DISTINCT b.id) AS board_count,
         count(DISTINCT wm.user_id) FILTER (WHERE wm.active) AS active_members
  FROM public.workspaces w
  LEFT JOIN public.work_boards b ON b.workspace_id = w.id
  LEFT JOIN public.workspace_members wm ON wm.workspace_id = w.id
  GROUP BY w.id
), snapshot AS (
  SELECT
    md5(pg_get_functiondef(
      'public.wm_add_board_member(uuid,text,text)'::regprocedure
    )) AS original_writer_md5,
    (to_regprocedure('public.wm_col01_session_active()') IS NOT NULL
      OR to_regprocedure('public.wm_board_invitable_users(uuid,text)') IS NOT NULL
      OR to_regprocedure('public.wm_list_board_item_updates(uuid,integer)') IS NOT NULL
      OR to_regprocedure('public.wm_list_board_item_files(uuid,integer)') IS NOT NULL
      OR to_regprocedure('public.wm_list_board_events_page(uuid,bigint,integer)') IS NOT NULL
    ) AS any_candidate_function_deployed,
    has_function_privilege(
      'authenticated','public.wm_add_board_member(uuid,text,text)','EXECUTE'
    ) AND NOT has_function_privilege(
      'anon','public.wm_add_board_member(uuid,text,text)','EXECUTE'
    ) AS member_writer_grants_expected,
    (SELECT count(*) = 4
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public'
         AND c.relname IN ('work_board_members','work_board_item_updates',
                           'work_board_item_files','work_board_events')
         AND c.relrowsecurity
         AND NOT has_table_privilege('authenticated',c.oid,'SELECT')
         AND NOT has_table_privilege('anon',c.oid,'SELECT')
    ) AS four_target_tables_restricted,
    (SELECT count(*)
       FROM information_schema.columns
       WHERE table_schema='auth' AND table_name='sessions'
         AND column_name IN ('id','user_id','not_after')
    ) AS gotrue_required_session_columns,
    (SELECT count(*) FROM workspace_inventory) AS workspaces,
    (SELECT coalesce(sum(board_count),0) FROM workspace_inventory) AS boards,
    (SELECT count(*) FROM workspace_inventory WHERE board_count > 0)
      AS workspaces_with_boards,
    (SELECT count(*) FROM workspace_inventory
      WHERE board_count > 0 AND active_members > 0)
      AS workspaces_with_board_and_active_members,
    (SELECT count(*) FROM workspace_inventory
      WHERE board_count = 0 AND active_members = 0)
      AS empty_workspaces
)
SELECT
  'CP-BOARD-COL01' AS checkpoint,
  pg_catalog.now() AS captured_at,
  'jtlusodorfnyzgyuewkz' AS expected_project_ref,
  original_writer_md5,
  any_candidate_function_deployed,
  member_writer_grants_expected,
  four_target_tables_restricted,
  gotrue_required_session_columns,
  workspaces,boards,workspaces_with_boards,
  workspaces_with_board_and_active_members,empty_workspaces,
  CASE
    WHEN original_writer_md5 <> '0dde086a58def1dd5437b32264c0697a'
      THEN 'STOP_BASELINE_DRIFT'
    WHEN any_candidate_function_deployed
      THEN 'STOP_CANDIDATE_STATE_CHANGED'
    WHEN NOT member_writer_grants_expected
      OR NOT four_target_tables_restricted
      OR gotrue_required_session_columns <> 3
      THEN 'STOP_ACCESS_CONTRACT_DRIFT'
    WHEN workspaces_with_board_and_active_members < 2
      THEN 'BLOCKED_GENUINE_FOREIGN_WORKSPACE_FIXTURE'
    ELSE 'STRUCTURAL_FIXTURES_PRESENT_SIGNED_EVIDENCE_PENDING'
  END AS prereq_decision,
  'NO_GO_UNTIL_INDEPENDENT_REVIEW_SIGNED_HTTPS_AND_SEPARATE_APPROVAL'
    AS production_activation_decision
FROM snapshot;
