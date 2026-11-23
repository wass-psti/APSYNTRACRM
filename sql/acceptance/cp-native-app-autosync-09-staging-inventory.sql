-- CP-NATIVE-APP-AUTOSYNC-09. Read-only; safe in existing nonproduction staging.
-- Never collect passwords, tokens, email addresses or individual user identities.
SELECT
 (SELECT count(*) FROM auth.users) AS auth_user_count,
 (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema IN ('public','private') AND table_type='BASE TABLE') AS app_table_count,
 to_regclass('public.work_boards') IS NOT NULL AS has_canonical_boards,
 to_regclass('public.module_role_assignments') IS NOT NULL AS has_module_assignments,
 to_regclass('public.apsyntra_role_change_audit') IS NOT NULL AS has_role_audit,
 to_regprocedure('public.apsyntra_role_require_scope(uuid)') IS NOT NULL AS has_scope_guard,
 to_regprocedure('public.apsyntra_role_user_management_snapshot(uuid)') IS NOT NULL AS has_snapshot,
 to_regprocedure('public.apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz)') IS NOT NULL AS has_assignment_writer,
 to_regprocedure('public.apsyntra_native_application_registry(uuid)') IS NOT NULL AS has_registered_catalog;
