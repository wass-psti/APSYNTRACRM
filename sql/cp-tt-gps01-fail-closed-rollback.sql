-- CP-TT-GPS01 — staged emergency fail-closed rollback; preserves all records.
-- Any deployment rollback is a separate production decision; DO NOT run automatically.
BEGIN;
DO $expect$
BEGIN
 IF to_regclass('private.tt_attendance_board_projection') IS NULL OR
    to_regprocedure('public.timetracker_board_private_snapshot(uuid,integer)') IS NULL
 THEN RAISE EXCEPTION 'Projection not installed; abort fail-closed rollback'; END IF;
END $expect$;
-- Deny future attendance writes until a repair restores atomic projection.
-- Existing authoritative attendance, board items, GPS and audit history persist.
REVOKE ALL ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_board_private_snapshot(uuid,integer)
 FROM PUBLIC,anon,authenticated;
DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
  'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)','EXECUTE') OR
  has_function_privilege('authenticated',
  'public.timetracker_board_private_snapshot(uuid,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Fail-closed rollback did not disable sensitive RPCs'; END IF;
END $verify$;
COMMIT;
