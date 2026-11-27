DO $assert$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.profiles)
 OR EXISTS(SELECT 1 FROM public.timetracker_ot_requests) OR EXISTS(SELECT 1 FROM public.timetracker_ot_audit)
 OR EXISTS(SELECT 1 FROM public.workspaces) OR EXISTS(SELECT 1 FROM private.ws01_events)
 OR EXISTS(SELECT 1 FROM private.ws02_personal_workspaces) OR EXISTS(SELECT 1 FROM private.ws01_member_roles)
 OR EXISTS(SELECT 1 FROM private.ws02d_member_access) OR EXISTS(SELECT 1 FROM private.ws02_provision_events)
 THEN RAISE EXCEPTION 'Fresh Preview fixture was modified'; END IF;
END; $assert$;