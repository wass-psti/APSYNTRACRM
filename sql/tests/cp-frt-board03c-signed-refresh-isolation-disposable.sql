-- CP-FRT-BOARD-03C disposable end-to-end integration. NOT signed browser evidence.
-- Preconditions: existing SEC14 synthetic finance request + FRT03B functions.
-- All writes, audit changes and reference fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
DO $roundtrip$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 other_w uuid:='00000000-0000-4000-8000-000000000002';
 req uuid:='10000000-0000-4000-8000-000000000001';
 editor uuid:='00000000-0000-4000-8000-00000000000b';
 outsider uuid:='00000000-0000-4000-8000-00000000000c';
 receipt jsonb; current_detail jsonb; assigned jsonb; listed jsonb; blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',editor::text,true);
 listed:=public.frt_board_list_safe(w,'WAO','');
 IF jsonb_array_length(listed)<>1 OR listed->0->>'id'<>req::text
 THEN RAISE EXCEPTION 'FRT03C_SIGNED_REQUEST_NOT_VISIBLE'; END IF;
 current_detail:=public.frt_restricted_request_detail(w,req);
 IF current_detail->>'date_needed'<>'2026-11-15' OR
    public.frt_request_assignment(w,req)->>'assigneeId' IS NOT NULL
 THEN RAISE EXCEPTION 'FRT03C_INITIAL_SNAPSHOT_INVALID'; END IF;
 receipt:=public.frt_update_request_date_cas(w,req,DATE '2026-11-15',DATE '2026-11-20');
 IF receipt->>'ok'<>'true' THEN RAISE EXCEPTION 'FRT03C_DATE_NOT_ACKNOWLEDGED'; END IF;
 receipt:=public.frt_assign_request_person(w,req,NULL,editor);
 IF receipt->>'assigneeId'<>editor::text THEN
  RAISE EXCEPTION 'FRT03C_ASSIGN_NOT_ACKNOWLEDGED'; END IF;
 -- Independent fresh signed read: simulate browser reload/reopen (new request context).
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claim.sub',editor::text,true);
 current_detail:=public.frt_restricted_request_detail(w,req);
 assigned:=public.frt_request_assignment(w,req);
 listed:=public.frt_board_list_safe(w,'WAO','');
 IF current_detail->>'date_needed'<>'2026-11-20' OR
    assigned->>'assigneeId'<>editor::text OR
    listed->0->>'date_needed'<>'2026-11-20' THEN
  RAISE EXCEPTION 'FRT03C_REFRESH_AND_REOPEN_PERSISTENCE_FAILED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_update_request_date_cas(w,req,
  DATE '2026-11-15',DATE '2026-11-21');
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_STALE_DATE_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_assign_request_person(w,req,NULL,editor);
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_STALE_PERSON_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_request_assignment(other_w,req);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_CROSS_WORKSPACE_READ_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_assign_request_person(other_w,req,editor,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_CROSS_WORKSPACE_WRITE_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;
 BEGIN PERFORM public.frt_request_assignment(w,req);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_FOREIGN_SESSION_READ_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_update_request_date_cas(w,req,
  DATE '2026-11-20',DATE '2026-11-22');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03C_FOREIGN_SESSION_WRITE_ACCEPTED'; END IF;
 -- Refresh again under original actor, then clear assignment and restore date.
 PERFORM set_config('request.jwt.claim.sub',editor::text,true);
 receipt:=public.frt_assign_request_person(w,req,editor,NULL);
 IF receipt->>'assigneeId' IS NOT NULL THEN
  RAISE EXCEPTION 'FRT03C_UNASSIGN_FAILED'; END IF;
 receipt:=public.frt_update_request_date_cas(w,req,
  DATE '2026-11-20',DATE '2026-11-15');
 IF receipt->>'dateNeeded'<>'2026-11-15' THEN
  RAISE EXCEPTION 'FRT03C_DATE_RESTORE_FAILED'; END IF;
 IF public.frt_request_assignment(w,req)->>'assigneeId' IS NOT NULL OR
    public.frt_restricted_request_detail(w,req)->>'date_needed'<>'2026-11-15' THEN
  RAISE EXCEPTION 'FRT03C_FINAL_REREAD_FAILED'; END IF;
 RAISE NOTICE 'FRT03C_DISPOSABLE_REFRESH_ISOLATION_AND_REOPEN_PASS';
END $roundtrip$;
RESET ROLE;
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.frt_audit_logs
  WHERE fund_request_id='10000000-0000-4000-8000-000000000001'
    AND action='REQUEST_DATE_CORRECTED')<>2 OR
 (SELECT count(*) FROM public.frt_audit_logs
  WHERE fund_request_id='10000000-0000-4000-8000-000000000001'
    AND action='REQUEST_PERSON_ASSIGNED')<>2 THEN
  RAISE EXCEPTION 'FRT03C_AUDIT_PARITY_FAILED'; END IF;
END $audit$;
ROLLBACK;
