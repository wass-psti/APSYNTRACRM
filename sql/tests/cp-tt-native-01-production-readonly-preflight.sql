-- CP-TT-NATIVE-01: live TimeTracker backend inventory. READ ONLY.
-- Never inspects attendance records, employee names, GPS fixes, credentials,
-- request payloads or the raw per-workspace serialized state.
WITH rpc AS (
 SELECT p.oid,p.prosecdef,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_timetracker_attendance_action'
)
SELECT jsonb_build_object(
 'checkpoint','CP-TT-NATIVE-01-SERVER-PREFLIGHT',
 'existingBoardCount',(SELECT count(*) FROM public.work_boards
   WHERE id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid),
 'moduleRoleAssignmentCount',(SELECT count(*) FROM public.module_role_assignments
   WHERE module_id='time-tracker' AND enabled),
 'attendanceStateEntryCount',(SELECT count(*) FROM public.module_state_entries
   WHERE module_id='time-tracker' AND state_key='timetracker.attendance.v1'),
 'rpcInstalled',EXISTS(SELECT 1 FROM rpc),
 'securityDefiner',COALESCE((SELECT prosecdef FROM rpc),false),
 'authenticatedExecute',to_regprocedure(
   'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)'
  ) IS NOT NULL AND has_function_privilege('authenticated',
   'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE'),
 'anonymousExecute',CASE WHEN EXISTS(SELECT 1 FROM rpc) THEN
  has_function_privilege('anon',
   'public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)','EXECUTE') ELSE NULL END,
 'signedIdentityGuard',COALESCE((SELECT position('auth.uid()' in definition)>0 FROM rpc),false),
 'moduleRoleGuard',COALESCE((SELECT position('has_module_access' in definition)>0 FROM rpc),false),
 'dedicatedBoardGrantGuard',COALESCE((SELECT position('work_board_access' in definition)>0 FROM rpc),false),
 'workspaceGuard',COALESCE((SELECT position('current_workspace_id' in definition)>0 FROM rpc),false),
 'concurrencyGuard',COALESCE((SELECT position('pg_advisory_xact_lock' in definition)>0 FROM rpc),false),
 'integrityGuard',COALESCE((SELECT position('module_state_invariants_valid' in definition)>0 FROM rpc),false),
 'offsiteNoteServerCheck',COALESCE((SELECT position('Offsite (Home)' in definition)>0 FROM rpc),false),
 'auditAppendInCommit',COALESCE((SELECT position('timetracker.audit.v1' in definition)>0 OR
   position('append_module_activity' in definition)>0 FROM rpc),false),
 'privilegeChangeAttempted',false,
 'financialOrAttendanceWritesAttempted',false
) AS server_preflight;
