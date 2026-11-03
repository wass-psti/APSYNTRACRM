\set ON_ERROR_STOP on
DO $accept$
BEGIN
 IF to_regclass('private.tt_attendance_board_projection') IS NULL
 OR (SELECT count(*) FROM private.tt_attendance_board_projection)<>1 OR
 (SELECT count(*) FROM public.timetracker_attendance_mutation_audit)<>2
 THEN RAISE EXCEPTION 'Emergency recovery deleted attendance records'; END IF;
 IF has_function_privilege('authenticated',
  'public.timetracker_attendance_commit_v2(uuid,text,text,text,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.timetracker_board_private_snapshot(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'GPS or attendance write still enabled after fail-closed rollback'; END IF;
 RAISE NOTICE 'CP-TT-GPS01 fail-closed data-preserving rollback PASS';
END $accept$;
