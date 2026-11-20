-- CP-SYSADMIN-01 controlled EMERGENCY PAUSE / rollback candidate, NOT APPLIED.
-- Preserve private assignments and append-only audit evidence.
-- Before execution confirm the original guard fingerprint and that no
-- separately activated domain guard depends on System Admin.
BEGIN;
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $admin$
 SELECT EXISTS(
  SELECT 1 FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id
  WHERE p.id=auth.uid() AND p.status='active' AND wm.active IS TRUE
   AND wm.workspace_id=public.current_workspace_id(p.id)
   AND public.apsyntra_crm_effective_role(p.id,wm.workspace_id)='admin'
 );
$admin$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_admin()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_admin()
 TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apsyntra_system_admin_change(
 uuid,uuid,text,text,text,bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apsyntra_system_admin_snapshot(uuid)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apsyntra_system_admin_current()
 FROM authenticated;
-- The private append-only audit records and historical assignments remain.
-- Do not DROP their tables on a failed rollout.
NOTIFY pgrst,'reload schema';
COMMIT;
