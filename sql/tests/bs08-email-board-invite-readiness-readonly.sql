-- BS08: Safe metadata-only readiness inventory for exact-email external board invites.
-- READ ONLY. This does not return emails, profile names, user IDs,
-- credentials, table contents, RLS policy text, or function bodies.
-- Intended for an authorized administrator in Supabase SQL Editor.
-- Do not interpret this report as approval to create, send or accept invites.

WITH targets(schema_name,object_name) AS (
 VALUES
  ('public','profiles'),
  ('public','workspaces'),
  ('public','workspace_members'),
  ('public','work_boards'),
  ('public','work_board_members'),
  ('public','work_board_items'),
  ('public','work_board_columns'),
  ('public','work_board_item_values'),
  ('public','module_role_assignments')
), table_info AS (
 SELECT v.schema_name,v.object_name,
        c.oid IS NOT NULL AS exists_in_database,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        coalesce(p.policy_count,0) AS policy_count,
        CASE WHEN c.oid IS NOT NULL
             THEN has_table_privilege('anon',c.oid,'SELECT') ELSE false END
             AS anon_select_granted,
        CASE WHEN c.oid IS NOT NULL
             THEN has_table_privilege('authenticated',c.oid,'SELECT') ELSE false END
             AS signed_select_granted
 FROM targets v
 LEFT JOIN pg_namespace n ON n.nspname=v.schema_name
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.object_name
   AND c.relkind IN('r','p','v','m')
 LEFT JOIN LATERAL (
   SELECT count(*) AS policy_count
   FROM pg_policies pol
   WHERE pol.schemaname=v.schema_name AND pol.tablename=v.object_name
 ) p ON true
), functions(name) AS (
 VALUES
  ('work_board_access'),
  ('wm_auth_access_context'),
  ('wm_get_board'),
  ('wm_list_boards'),
  ('wm_add_board_member'),
  ('wm_board_member_active'),
  ('current_workspace_id'),
  ('handle_new_user'),
  ('sync_profile_email_verification'),
  ('ensure_default_workspace_membership')
), function_info AS (
 SELECT f.name,EXISTS(
   SELECT 1 FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=f.name
 ) AS deployed
 FROM functions f
), expected_triggers(schema_name,table_name,trigger_name) AS (
 VALUES
  ('auth','users','on_auth_user_created'),
  ('auth','users','zz_on_auth_user_verification_sync'),
  ('public','profiles','profiles_default_workspace_membership')
), trigger_info AS (
 SELECT t.trigger_name,coalesce(bool_or(pg_t.tgenabled IN ('O','A')),false) AS enabled
 FROM expected_triggers t
 LEFT JOIN pg_namespace n ON n.nspname=t.schema_name
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.table_name
 LEFT JOIN pg_trigger pg_t ON pg_t.tgrelid=c.oid AND
  pg_t.tgname=t.trigger_name AND NOT pg_t.tgisinternal
 GROUP BY t.trigger_name
)
SELECT jsonb_pretty(jsonb_build_object(
 'report','BS08_METADATA_ONLY',
 'tables',coalesce((SELECT jsonb_agg(
  jsonb_build_object('name',schema_name||'.'||object_name,
    'exists',exists_in_database,
    'rls',rls_enabled,
    'rls_forced',rls_forced,
    'policy_count',policy_count,
    'anon_select_granted',anon_select_granted,
    'signed_select_granted',signed_select_granted)
    ORDER BY schema_name,object_name) FROM table_info),'[]'::jsonb),
 'functions',coalesce((SELECT jsonb_object_agg(name,deployed) FROM function_info),'{}'::jsonb),
 'registration_triggers',coalesce((SELECT jsonb_object_agg(trigger_name,enabled) FROM trigger_info),'{}'::jsonb),
 'note','Metadata only: all RLS policy expressions, function bodies, SMTP, Auth settings and Storage authorization still require independent review'
)) AS readiness_report;
