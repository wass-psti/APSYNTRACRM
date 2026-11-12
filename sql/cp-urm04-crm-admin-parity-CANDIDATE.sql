-- CP-URM-04: DISPOSABLE/REVIEW CANDIDATE. NOT A PRODUCTION MIGRATION.
-- Bootstrap continues to identify only the two immutable designated accounts.
-- CRM Administrator is the same role-management tier, scoped to active workspace.
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
REVOKE ALL ON FUNCTION public.apsyntra_role_is_admin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $scope$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR NOT public.apsyntra_role_is_admin()
  OR NOT EXISTS (SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active IS TRUE)
 THEN RAISE EXCEPTION 'CRM administrator access denied for current workspace'
  USING ERRCODE='42501'; END IF;
END $scope$;
-- Do not change apsyntra_role_is_bootstrap() or is_platform_admin(uuid):
-- they identify protected identities / unrelated legacy application roles.
COMMIT;
