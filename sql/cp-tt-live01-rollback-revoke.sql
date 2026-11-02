-- CP-TT-LIVE-01 emergency disablement only. Explicit production approval required.
-- Removes execution of the new Clock endpoints, preserves existing attendance
-- and immutable audit records, and NEVER restores the older unguarded writer.
BEGIN;
REVOKE ALL ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timetracker_attendance_capabilities(uuid)
 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_timetracker_attendance_action(
 text,text,text,text,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
