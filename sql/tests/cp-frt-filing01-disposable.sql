-- Disposable PG17 signed-role acceptance, using existing SEC14 request fixtures.
\set ON_ERROR_STOP on
BEGIN;
DO $grants$
BEGIN
 IF has_function_privilege('anon',
   'public.frt_set_request_filing_status(uuid,uuid,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
   'public.frt_set_request_filing_status(uuid,uuid,text,text,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.frt_requests','UPDATE') THEN
  RAISE EXCEPTION 'FILING01_UNSAFE_GRANTS'; END IF;
END $grants$;
SET ROLE authenticated;
DO $test$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 req uuid:='10000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-00000000000b';
 outsider uuid:='00000000-0000-4000-8000-00000000000c';
 list jsonb; receipt jsonb; blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 list:=public.frt_board_list_safe(w,'WAO','');
 IF jsonb_array_length(list)<>1 OR list->0->>'filing_status'<>'NOT_FILED' OR
  (SELECT count(*) FROM jsonb_object_keys(list->0))<>9 THEN
  RAISE EXCEPTION 'FILING01_DEFAULT_LIST_PROJECTION_FAILED'; END IF;
 receipt:=public.frt_set_request_filing_status(w,req,'WAO','NOT_FILED','FILED');
 IF receipt->>'filingStatus'<>'FILED' OR receipt->>'ok'<>'true' OR
   public.frt_board_list_safe(w,'WAO','')->0->>'filing_status'<>'FILED' THEN
  RAISE EXCEPTION 'FILING01_PERSISTENCE_READBACK_FAILED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_set_request_filing_status(w,req,'WAO','NOT_FILED','FILED');
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FILING01_STALE_RETRY_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_set_request_filing_status(w,req,'PSTI','FILED','NOT_FILED');
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FILING01_FOREIGN_COMPANY_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;
 BEGIN PERFORM public.frt_set_request_filing_status(w,req,'WAO','FILED','NOT_FILED');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FILING01_FOREIGN_MEMBER_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 receipt:=public.frt_set_request_filing_status(w,req,'WAO','FILED','NOT_FILED');
 IF receipt->>'filingStatus'<>'NOT_FILED' OR
 public.frt_board_list_safe(w,'WAO','')->0->>'filing_status'<>'NOT_FILED' THEN
 RAISE EXCEPTION 'FILING01_REVERSE_PERSISTENCE_FAILED'; END IF;
 RAISE NOTICE 'FRT_FILING01_SIGNED_CAS_ACCEPTANCE_PASS';
END $test$;
RESET ROLE;
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.frt_audit_logs
   WHERE fund_request_id='10000000-0000-4000-8000-000000000001'
     AND action='REQUEST_FILING_STATUS_CHANGED')<>2 THEN
 RAISE EXCEPTION 'FILING01_EXPECTED_AUDIT_MISSING'; END IF;
END $audit$;
ROLLBACK;
