-- CP-FRT-WF-03 disposable acceptance; run in outer BEGIN/ROLLBACK.
DO $check$
DECLARE ws uuid; co uuid; actor uuid; outsider uuid; req uuid; v jsonb; once jsonb;
 denied boolean; ts timestamptz;
BEGIN
 SELECT workspace_id,id INTO STRICT ws,co FROM public.frt_companies ORDER BY workspace_id,id LIMIT 1;
 SELECT id INTO STRICT actor FROM auth.users ORDER BY id LIMIT 1;
 outsider:=gen_random_uuid(); -- guaranteed nonmember in this disposable transaction
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(ws,actor,'FINANCE_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='FINANCE_MANAGER',enabled=true,status='active';
 INSERT INTO public.frt_requests(workspace_id,company_id,requestor_id,
 voucher_no,title,department,fund_source,date_needed,description,total_amount)
 VALUES(ws,co,actor,'DV-WF03-'||gen_random_uuid(),'Rollback bank release','IT','OPEX',
 CURRENT_DATE,'Test only',100.00) RETURNING id INTO req;
 v:=public.frt_bank_execution_snapshot(ws,req);
 IF v->>'recorded'<>'false' OR v->>'deadlineAt' IS NOT NULL THEN
  RAISE EXCEPTION 'deadline inferred without bank event %',v;
 END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_record_bank_execution(ws,req,jsonb_build_object(
   'bankName','Example Bank','transactionReference','RB-1','executedAt',now()));
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unapproved bank write was allowed'; END IF;
 UPDATE public.frt_requests SET finance_approved_at=now()-interval '1 hour',
  transfer_confirmed_at=now()-interval '45 minutes' WHERE id=req;
 ts:=clock_timestamp();
 once:=public.frt_record_bank_execution(ws,req,jsonb_build_object(
  'bankName','Example Bank','transactionReference','RB-1','executedAt',ts));
 v:=public.frt_bank_execution_snapshot(ws,req);
 IF v->>'recorded'<>'true' OR (v->>'deadlineAt')::timestamptz<>ts+interval '3 days'
 OR v->>'source'<>'STAFF_RECORDED_BANK_EVIDENCE' THEN
  RAISE EXCEPTION 'invalid due time/readback %',v;
 END IF;
 IF (public.frt_record_bank_execution(ws,req,jsonb_build_object(
  'bankName','Example Bank','transactionReference','RB-1','executedAt',ts)))->>'replayed'<>'true'
 THEN RAISE EXCEPTION 'same evidence not idempotent'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_record_bank_execution(ws,req,jsonb_build_object(
   'bankName','Example Bank','transactionReference','CHANGED','executedAt',ts));
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'different evidence overwrote bank record'; END IF;
 IF (SELECT count(*) FROM public.frt_audit_logs WHERE fund_request_id=req
     AND action='BANK_EXECUTION_RECORDED')<>1 THEN
  RAISE EXCEPTION 'bank audit missing/duplicated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 RAISE NOTICE 'nonmember identity=%, role=%',auth.uid(),private.frt_current_role(ws);
 denied:=false;
 BEGIN PERFORM public.frt_bank_execution_snapshot(ws,req);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonmember read allowed'; END IF;
 denied:=false;
 BEGIN PERFORM public.frt_record_bank_execution(ws,req,'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonmember write allowed'; END IF;
 RAISE NOTICE 'WF03 PASS: no inferred deadline; signed event; exact 72h; idempotency; audit; nonmember denials';
END $check$;
