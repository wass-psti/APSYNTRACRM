-- SEC14: verify additive production candidate using disposable PostgreSQL.
-- Before the separately gated legacy cutover, all historical EXECUTE grants
-- MUST remain intact. No customer records or role changes are performed.
DO $check$
DECLARE
 count_new integer;
 count_old integer;
BEGIN
 SELECT count(*) INTO count_new
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('frt_restricted_request_detail','frt_board_list_safe','frt_board_dashboard_safe');
 IF count_new<>3 THEN
   RAISE EXCEPTION 'SEC14 additive activation missing restricted RPC';
 END IF;
 IF NOT has_function_privilege('authenticated','public.frt_restricted_request_detail(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.frt_board_list_safe(uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.frt_board_dashboard_safe(uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.frt_restricted_request_detail(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.frt_board_list_safe(uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon','public.frt_board_dashboard_safe(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'SEC14 restricted RPC grants incorrect'; END IF;
 SELECT count(*) INTO count_old
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('frt_get_request','frt_list_requests','frt_dashboard');
 IF count_old<>3 OR
 NOT has_function_privilege('authenticated','public.frt_get_request(uuid,uuid)','EXECUTE') OR
 NOT has_function_privilege('authenticated','public.frt_list_requests(uuid,text,text)','EXECUTE') OR
 NOT has_function_privilege('authenticated','public.frt_dashboard(uuid,text)','EXECUTE')
 THEN
  RAISE EXCEPTION 'SEC14 additive migration changed historical read contracts';
 END IF;
 IF has_table_privilege('authenticated','public.frt_requests','SELECT') OR
 (SELECT count(*) FROM public.frt_requests)<>0 OR
 (SELECT count(*) FROM public.frt_audit_logs)<>0
 THEN RAISE EXCEPTION 'SEC14 isolated table/financial side-effect failure'; END IF;
 RAISE NOTICE 'SEC14 ADDITIVE RPC GRANTS AND LEGACY COMPATIBILITY: PASS';
END
$check$;
