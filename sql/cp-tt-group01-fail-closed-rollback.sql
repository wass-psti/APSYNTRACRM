-- CP-TT-GROUP01 fail-closed rollback. Never restores the legacy delete grant.
-- Execute only with independently approved production change authorization.
BEGIN;
REVOKE ALL ON FUNCTION public.wm_managed_board_delete_empty_group(
 uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_delete_board_group(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
