-- New database connection: independent persisted role and audit evidence.
DO $readback$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'CP17 readback requires the isolated clone';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_workspace_application_roles
   WHERE workspace_id='b1500000-0000-4000-8000-000000000001'
     AND user_id='a1500000-0000-4000-8000-000000000002'
     AND module_id='order-intake' AND role='User' AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.wm_workspace_application_roles
   WHERE workspace_id='b1500000-0000-4000-8000-000000000001'
     AND user_id='a1500000-0000-4000-8000-000000000003'
     AND module_id='time-tracker' AND role='Employee' AND enabled)
 OR (SELECT count(*) FROM public.wm_application_role_audit
   WHERE module_id='order-intake' AND action='grant')<>1 THEN
   RAISE EXCEPTION 'CP17 individual/batch persisted readback failed';
 END IF;
END $readback$;
