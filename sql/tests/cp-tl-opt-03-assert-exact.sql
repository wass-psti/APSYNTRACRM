DO $assert$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')
 OR EXISTS(SELECT 1 FROM public.profiles WHERE id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')
 OR EXISTS(SELECT 1 FROM public.timetracker_ot_requests WHERE id='69f17f9e-80c6-4297-930d-672f8e4986b6')
 OR EXISTS(SELECT 1 FROM public.timetracker_ot_audit WHERE event_id=63)
 OR EXISTS(SELECT 1 FROM private.ws01_events WHERE id=33)
 OR EXISTS(SELECT 1 FROM private.ws01_member_roles WHERE user_id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')
 OR EXISTS(SELECT 1 FROM private.ws02d_member_access WHERE user_id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')
 OR EXISTS(SELECT 1 FROM private.ws02_personal_workspaces WHERE user_id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')
 OR EXISTS(SELECT 1 FROM private.ws02_provision_events WHERE id=5)
 OR EXISTS(SELECT 1 FROM public.workspaces WHERE id='034b97b8-aff8-4348-b994-e816e1d5bc1a')
 OR EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id='034b97b8-aff8-4348-b994-e816e1d5bc1a')
 THEN RAISE EXCEPTION 'Exact QA fixture was not fully retired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='tt_ot_audit_immutable' AND tgenabled='O' AND tgrelid='public.timetracker_ot_audit'::regclass)
 THEN RAISE EXCEPTION 'Immutable audit trigger was not restored'; END IF;
END; $assert$;