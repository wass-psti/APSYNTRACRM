DO $$
BEGIN
 IF (SELECT count(*) FROM public.wm_workspace_application_roles
 WHERE workspace_id='b1500000-0000-4000-8000-000000000001'
 AND user_id='a1500000-0000-4000-8000-000000000003'
 AND module_id='time-tracker' AND role='Employee' AND enabled)<>1 THEN
  RAISE EXCEPTION 'Canonical stored role not persisted';
 END IF;
 IF (SELECT count(*) FROM public.wm_application_role_audit
 WHERE module_id='time-tracker' AND action='grant')<>1 THEN
  RAISE EXCEPTION 'Canonical grant audit not persisted';
 END IF;
END $$;
