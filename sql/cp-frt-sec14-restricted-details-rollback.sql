-- CP-FRT-SEC14 controlled compatibility rollback only.
-- Restores the former authenticated legacy detail entry point.
-- Must be run only under separately authorized recovery conditions;
-- this re-exposes broad detail fields to authorized FRT members.
BEGIN;
GRANT EXECUTE ON FUNCTION public.frt_get_request(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.frt_restricted_request_detail(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
