-- Disposable CI-only compatibility fixture. Never deploy.
-- CI03 finance schema predates the legacy read-only detail function.
-- Create an inert placeholder with its historical signature and grant solely
-- to test canonical SEC14's atomic revoked EXECUTE privilege.
CREATE OR REPLACE FUNCTION public.frt_get_request(
 p_workspace_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$ SELECT '{}'::jsonb $$;
REVOKE ALL ON FUNCTION public.frt_get_request(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_get_request(uuid,uuid) TO authenticated;
