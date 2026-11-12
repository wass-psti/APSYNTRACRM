-- Execute only in isolated PostgreSQL 17 after signed FRT SEC14 fixture.
\set ON_ERROR_STOP on
-- Keep all acceptance writes and their audit records isolated from later SEC14 fixtures.
BEGIN;
DO $grants$
BEGIN
 IF has_function_privilege('anon',
  'public.frt_update_request_date_cas(uuid,uuid,date,date)','EXECUTE') OR
 NOT has_function_privilege('authenticated',
  'public.frt_update_request_date_cas(uuid,uuid,date,date)','EXECUTE') OR
 has_table_privilege('authenticated','public.frt_requests','UPDATE') THEN
  RAISE EXCEPTION 'FRT03_UNEXPECTED_GRANTS';
 END IF;
END $grants$;
SET ROLE authenticated;
DO $acceptance$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 req uuid:='10000000-0000-4000-8000-000000000001';
 receipt jsonb; denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
 receipt:=public.frt_update_request_date_cas(w,req,
  DATE '2026-11-15',DATE '2026-11-18');
 IF receipt->>'dateNeeded'<>'2026-11-18' OR receipt->>'ok'<>'true' THEN
  RAISE EXCEPTION 'FRT03_CAS_WRITE_NOT_CONFIRMED'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_update_request_date_cas(w,req,
   DATE '2026-11-15',DATE '2026-11-20');
 EXCEPTION WHEN SQLSTATE '40001' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FRT03_STALE_WRITE_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
 denied:=false;
 BEGIN
  PERFORM public.frt_update_request_date_cas(w,req,
   DATE '2026-11-18',DATE '2026-11-19');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FRT03_FOREIGN_WORKSPACE_ACCEPTED'; END IF;
END $acceptance$;
RESET ROLE;
DO $post$
BEGIN
 IF (SELECT date_needed FROM public.frt_requests
  WHERE id='10000000-0000-4000-8000-000000000001')<>DATE '2026-11-18' OR
 (SELECT count(*) FROM public.frt_audit_logs
  WHERE fund_request_id='10000000-0000-4000-8000-000000000001'
  AND action='REQUEST_DATE_CORRECTED')<>1 THEN
  RAISE EXCEPTION 'FRT03_CAS_DATA_OR_AUDIT_FAILED';
 END IF;
 RAISE NOTICE 'FRT03_DISPOSABLE_DATE_CAS_PASS';
END $post$;
ROLLBACK;
