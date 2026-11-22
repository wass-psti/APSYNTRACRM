DO $$
BEGIN
 IF (SELECT count(*) FROM public.wm_workspace_application_roles
 WHERE module_id='time-tracker' AND role='Supervisor' AND NOT enabled)<>1 OR
 (SELECT count(*) FROM public.wm_application_role_audit
 WHERE module_id='time-tracker' AND action='change')<>1 OR
 (SELECT count(*) FROM public.wm_application_role_audit
 WHERE module_id='time-tracker' AND action='revoke')<>1 THEN
  RAISE EXCEPTION 'Canonical role change readback/audit failed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.wm_workspace_application_roles
 WHERE module_id='arbitrary-new-app') THEN
  RAISE EXCEPTION 'Unregistered module unexpectedly persisted';
 END IF;
END $$;
