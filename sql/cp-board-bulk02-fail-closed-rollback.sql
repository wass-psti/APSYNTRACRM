-- CP-BOARD-BULK02 fail-closed emergency rollback; does not restore unsafe group-delete access.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.wm_board_bulk_mutate(uuid,text,jsonb)') IS NULL
  OR to_regprocedure('public.wm_board_group_cas(uuid,uuid,timestamp with time zone,text,text)') IS NULL THEN
  RAISE EXCEPTION 'CP-BOARD-BULK02 candidate is not active; rollback refused' USING ERRCODE='55000';
 END IF;
END $preflight$;
REVOKE ALL ON FUNCTION public.wm_board_bulk_mutate(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_board_group_cas(uuid,uuid,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
-- Preserve all record, group, membership, audit and operational data.
-- Legacy cascading group delete remains unavailable to authenticated/anon.
DO $verify$
BEGIN
 IF has_function_privilege('authenticated','public.wm_board_bulk_mutate(uuid,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_board_group_cas(uuid,uuid,timestamptz,text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_delete_board_group(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'CP-BOARD-BULK02 rollback grant still open' USING ERRCODE='42501';
 END IF;
END $verify$;
COMMIT;
