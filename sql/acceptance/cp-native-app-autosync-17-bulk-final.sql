DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.wm_workspace_application_roles
 WHERE workspace_id='b1500000-0000-4000-8000-000000000001'
 AND enabled)<>2 THEN
  RAISE EXCEPTION 'CP17 denied changes mutated accepted assignments';
 END IF;
 IF (SELECT count(*) FROM public.wm_application_role_audit
 WHERE module_id='order-intake')<>1 THEN
  RAISE EXCEPTION 'CP17 denied changes unexpectedly modified audit';
 END IF;
 IF to_regprocedure('public.apsyntra_role_user_management_snapshot(uuid)') IS NOT NULL
 OR to_regprocedure('public.apsyntra_native_application_registry(uuid)') IS NOT NULL
 OR to_regclass('public.work_boards') IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected complete CRM baseline in isolated staging clone';
 END IF;
END $verify$;
