-- CP-FRT-SEC01B: eliminate redundant externally callable FRT role administration.
-- The centralized apsyntra_role_manage_user_access RPC remains the sole authorized
-- signed-user mutation entry point. Its SECURITY DEFINER call chain retains owner access.
BEGIN;
REVOKE ALL ON FUNCTION public.frt_admin_set_role(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_admin_users(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_admin_set_application_role(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
