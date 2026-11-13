-- CP-MAIN-WS-OWNER-ADMIN-01 disposable PostgreSQL acceptance.
\set ON_ERROR_STOP on
DO $verify$
DECLARE
 v_owner uuid:='10000000-0000-4000-8000-000000000001';
 v_invitee uuid:='10000000-0000-4000-8000-000000000002';
 v_wm_only uuid:='10000000-0000-4000-8000-000000000003';
 v_unmapped_owner uuid:='10000000-0000-4000-8000-000000000004';
 v_mapped_nonowner uuid:='10000000-0000-4000-8000-000000000005';
 v_bootstrap uuid:='10000000-0000-4000-8000-000000000006';
 v_main uuid:='20000000-0000-4000-8000-000000000001';
 v_wm uuid:='20000000-0000-4000-8000-000000000002';
 v_custom uuid:='20000000-0000-4000-8000-000000000003';
 v_mapped_nonowner_ws uuid:='20000000-0000-4000-8000-000000000004';
 v_main_emails text[];
 v_wm_emails text[];
BEGIN
 IF public.apsyntra_crm_effective_role(v_owner,v_main)<>'admin' THEN
  RAISE EXCEPTION 'Personal Main Workspace owner did not receive CRM Admin'; END IF;
 IF public.apsyntra_crm_effective_role(v_owner,v_wm)<>'employee' THEN
  RAISE EXCEPTION 'Main Workspace owner authority leaked into Work Management'; END IF;
 IF public.apsyntra_crm_effective_role(v_invitee,v_main)<>'employee' THEN
  RAISE EXCEPTION 'Invited Main Workspace member received owner authority'; END IF;
 IF public.apsyntra_crm_effective_role(v_wm_only,v_main) IS NOT NULL THEN
  RAISE EXCEPTION 'Work Management-only member leaked into Main Workspace'; END IF;
 IF public.apsyntra_crm_effective_role(v_unmapped_owner,v_custom)<>'employee' THEN
  RAISE EXCEPTION 'Ordinary workspace owner was incorrectly promoted'; END IF;
 IF public.apsyntra_crm_effective_role(v_mapped_nonowner,v_mapped_nonowner_ws)<>'employee' THEN
  RAISE EXCEPTION 'Personal-workspace mapping without owner relation granted Admin'; END IF;
 IF public.apsyntra_crm_effective_role(v_bootstrap,v_wm)<>'admin' THEN
  RAISE EXCEPTION 'Existing designated bootstrap fallback changed'; END IF;

 SELECT array_agg(p.email ORDER BY p.email) INTO v_main_emails
 FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.workspace_id=v_main AND m.active IS TRUE AND p.status='active';
 IF v_main_emails IS DISTINCT FROM ARRAY[
  'invited-main@example.invalid','owner-main@example.invalid'
 ]::text[] THEN
  RAISE EXCEPTION 'Main Workspace email directory mixed or omitted workspace members: %',v_main_emails;
 END IF;

 SELECT array_agg(p.email ORDER BY p.email) INTO v_wm_emails
 FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.workspace_id=v_wm AND m.active IS TRUE AND p.status='active';
 IF v_wm_emails IS DISTINCT FROM ARRAY[
  'bootstrap@example.invalid','owner-main@example.invalid','work-management-only@example.invalid'
 ]::text[] THEN
  RAISE EXCEPTION 'Work Management email directory changed or mixed: %',v_wm_emails;
 END IF;

 UPDATE public.workspace_members SET active=false
 WHERE workspace_id=v_main AND user_id=v_owner;
 IF public.apsyntra_crm_effective_role(v_owner,v_main) IS NOT NULL THEN
  RAISE EXCEPTION 'Inactive Main Workspace membership retained CRM Admin'; END IF;

 IF has_function_privilege('anon','public.apsyntra_crm_effective_role(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.apsyntra_crm_effective_role(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Internal effective-role helper became directly executable'; END IF;
 IF NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.apsyntra_crm_effective_role(uuid,uuid)'::regprocedure) THEN
  RAISE EXCEPTION 'Effective-role helper lost SECURITY DEFINER'; END IF;
 RAISE NOTICE 'CP-MAIN-WS-OWNER-ADMIN-01 PASS: owner Admin is Main Workspace-only; member email directories remain isolated; existing bootstrap behavior and internal helper ACL preserved';
END
$verify$;
