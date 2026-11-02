-- CP-BOARD-COL01 production preflight — SELECT ONLY, never modifies data.
-- Execute as production administrator in SQL Editor prior to separately approved activation.
WITH expected AS (
 SELECT '0dde086a58def1dd5437b32264c0697a'::text AS baseline_hash
), state AS (
 SELECT
  md5(pg_get_functiondef('public.wm_add_board_member(uuid,text,text)'::regprocedure)) AS writer_hash,
  to_regprocedure('public.wm_board_invitable_users(uuid,text)') IS NULL AS directory_not_activated,
  to_regprocedure('public.wm_col01_session_active()') IS NULL AS session_guard_not_activated,
  to_regprocedure('public.wm_list_board_item_updates(uuid,integer)') IS NULL AS updates_not_activated,
  to_regprocedure('public.wm_list_board_item_files(uuid,integer)') IS NULL AS files_not_activated,
  to_regprocedure('public.wm_list_board_events_page(uuid,bigint,integer)') IS NULL AS pagination_not_activated,
  has_function_privilege('authenticated','public.wm_add_board_member(uuid,text,text)','EXECUTE') AS signed_member_writer,
  NOT has_function_privilege('anon','public.wm_add_board_member(uuid,text,text)','EXECUTE') AS anon_member_writer_denied,
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN
     ('work_board_members','work_board_item_updates','work_board_item_files','work_board_events')) AS all_target_tables_have_rls,
  (SELECT NOT bool_or(has_table_privilege('authenticated',c.oid,'SELECT'))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN
     ('work_board_members','work_board_item_updates','work_board_item_files','work_board_events')) AS no_direct_signed_table_reads,
  (SELECT count(*) FROM public.work_board_members m
   JOIN public.work_boards b ON b.id=m.board_id
   WHERE NOT EXISTS(SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id=b.workspace_id AND wm.user_id=m.user_id AND wm.active)) AS foreign_or_inactive_members,
  (SELECT count(*) FROM public.work_board_members m
   JOIN public.work_boards b ON b.id=m.board_id
   JOIN public.apsyntra_crm_platform_roles r
     ON r.workspace_id=b.workspace_id AND r.user_id=m.user_id
   WHERE m.role='editor' AND r.role='viewer') AS viewer_ceiling_conflicts
)
SELECT
 CASE WHEN writer_hash=baseline_hash AND directory_not_activated AND session_guard_not_activated
 AND updates_not_activated AND files_not_activated
 AND pagination_not_activated AND signed_member_writer AND anon_member_writer_denied
 AND all_target_tables_have_rls AND no_direct_signed_table_reads
 AND foreign_or_inactive_members=0 AND viewer_ceiling_conflicts=0
 THEN 'PREFLIGHT_SCHEMA_PASS_WITH_SIGNED_SESSION_GATE_PENDING'
 ELSE 'BLOCKED_SCHEMA_DRIFT_OR_AUTHORIZATION_ISSUE' END AS decision,
 writer_hash=baseline_hash AS original_writer_unchanged,
 directory_not_activated,session_guard_not_activated,updates_not_activated,files_not_activated,pagination_not_activated,
 signed_member_writer,anon_member_writer_denied,all_target_tables_have_rls,
 no_direct_signed_table_reads,foreign_or_inactive_members,viewer_ceiling_conflicts
FROM state CROSS JOIN expected;
