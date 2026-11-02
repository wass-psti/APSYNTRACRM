-- Disposable CI fixture only; do not deploy.
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
  WHERE b.user_id=(SELECT auth.uid())
 );
$$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_bootstrap() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_bootstrap() TO authenticated;