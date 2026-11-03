-- CP-BOARD-MENU01: FAIL-CLOSED emergency rollback; no record deletion.
BEGIN;
DO $check$
BEGIN
 IF to_regprocedure('public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)') IS NULL OR
  to_regclass('private.wm_board_protected_ids') IS NULL THEN
  RAISE EXCEPTION 'Board lifecycle candidate absent; abort rollback'; END IF;
END $check$;
REVOKE ALL ON FUNCTION public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
-- Keep protected-ID records, stronger legacy permission guards, audit history,
-- archived/trashed data and permanent-delete denial intact.
DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
  'public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.wm_delete_board_permanently(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Fail-closed board lifecycle rollback incomplete'; END IF;
END $verify$;
COMMIT;
