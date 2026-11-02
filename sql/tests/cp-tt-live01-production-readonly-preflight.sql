-- CP-TT-LIVE-01 read-only production metadata preflight.
-- Never queries employee rows, raw attendance, or location coordinates.
SELECT pg_catalog.jsonb_build_object(
 'checkpoint','CP-TT-LIVE-01-PRODUCTION-CATALOG',
 'gps03RawInstalled',pg_catalog.to_regprocedure(
  'public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)') IS NOT NULL,
 'gps03RedactionInstalled',pg_catalog.to_regprocedure(
  'public.timetracker_redact_commit_receipt(jsonb)') IS NOT NULL,
 'capabilityInstalled',pg_catalog.to_regprocedure(
  'public.timetracker_attendance_capabilities(uuid)') IS NOT NULL,
 'v2WriteInstalled',pg_catalog.to_regprocedure(
  'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)') IS NOT NULL,
 'signedScopeGuardInstalled',pg_catalog.to_regprocedure(
  'public.timetracker_ot_require_scope(uuid)') IS NOT NULL,
 'legacyAuthenticatedExecute',CASE WHEN pg_catalog.to_regprocedure(
  'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)') IS NOT NULL
  THEN pg_catalog.has_function_privilege('authenticated',
  'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE')
  ELSE NULL END,
 'auditTableInstalled',pg_catalog.to_regclass(
  'public.timetracker_attendance_mutation_audit') IS NOT NULL
) AS activation_inventory;
