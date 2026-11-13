-- Execute after the WF02 migration inside an outer transaction. Caller must ROLLBACK.
DO $test$
DECLARE
 actor uuid; outsider uuid; ws uuid; company uuid; req uuid;
 key uuid:=gen_random_uuid(); other_key uuid:=gen_random_uuid();
 items jsonb; result jsonb; retry jsonb; snapshot jsonb;
 denied boolean;
BEGIN
 SELECT c.workspace_id,c.id INTO STRICT ws,company FROM public.frt_companies c
 ORDER BY c.workspace_id,c.id LIMIT 1;
 SELECT id INTO STRICT actor FROM auth.users ORDER BY id LIMIT 1;
 SELECT id INTO STRICT outsider FROM auth.users WHERE id<>actor ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(ws,actor,'REQUESTOR',true,'active');
 INSERT INTO public.frt_requests(workspace_id,company_id,requestor_id,
 voucher_no,title,department,fund_source,date_needed,description,total_amount,finance_approved_at)
 VALUES(ws,company,actor,'DV-WF02-TEST-'||gen_random_uuid(),
 'Disposable liquidation','IT','OPEX',CURRENT_DATE,'Rollback only',100.00,now())
 RETURNING id INTO req;
 items:=jsonb_build_array(
 jsonb_build_object('description','Travel','receiptDate',CURRENT_DATE::text,'amount','18.25','orInvoiceNo','OR-1'),
 jsonb_build_object('description','Materials','receiptDate',CURRENT_DATE::text,'amount','31.75','orInvoiceNo','INV-2'));
 snapshot:=public.frt_liquidation_snapshot(ws,req);
 IF snapshot->>'revision' IS NOT NULL THEN RAISE EXCEPTION 'unexpected first revision'; END IF;
 result:=public.frt_submit_liquidation_v2(ws,req,
 jsonb_build_object('items',items,'notes','Disposable','submissionKey',key));
 IF result->>'spentAmount'<>'50.00' OR result->>'remainingAmount'<>'50.00' THEN
  RAISE EXCEPTION 'incorrect totals %',result;
 END IF;
 snapshot:=public.frt_liquidation_snapshot(ws,req);
 IF jsonb_array_length(snapshot->'items')<>2 OR snapshot->>'liquidationStatus'<>'SUBMITTED'
 OR snapshot->>'spentAmount'<>'50.00' OR snapshot->>'reconciliationState'<>'UNLIQUIDATED' THEN RAISE EXCEPTION 'bad readback %',snapshot; END IF;
 retry:=public.frt_submit_liquidation_v2(ws,req,
 jsonb_build_object('items',items,'notes','Disposable','submissionKey',key));
 IF retry->>'replayed'<>'true' OR retry->>'revision'<>result->>'revision' THEN
  RAISE EXCEPTION 'exact retry not idempotent'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_submit_liquidation_v2(ws,req,
   jsonb_build_object('items',items,'notes','Modified','submissionKey',key));
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed retry not denied'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_submit_liquidation_v2(ws,req,
   jsonb_build_object('items',items,'notes','Changed','submissionKey',other_key));
 EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'stale revision not denied'; END IF;
 -- A fresh revision is accepted and replaces the prior receipt snapshot.
 result:=public.frt_submit_liquidation_v2(ws,req,
  jsonb_build_object('items',jsonb_build_array(
   jsonb_build_object('description','Finalized','receiptDate',CURRENT_DATE::text,'amount','60.00')),
   'notes','Revised','submissionKey',other_key,
   'expectedRevision',snapshot->>'revision'));
 snapshot:=public.frt_liquidation_snapshot(ws,req);
 IF result->>'spentAmount'<>'60.00' OR snapshot->>'remainingAmount'<>'40.00'
 OR jsonb_array_length(snapshot->'items')<>1 THEN
  RAISE EXCEPTION 'revision overwrite readback mismatch';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;
 BEGIN
  PERFORM public.frt_liquidation_snapshot(ws,req);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonmember read not denied'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.frt_submit_liquidation_v2(ws,req,
   jsonb_build_object('items',items,'submissionKey',gen_random_uuid()));
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonmember write not denied'; END IF;
 RAISE NOTICE 'CP-FRT-WF-02 PASS: two receipts, exact totals, retry/stale denials and nonmember denials';
END $test$;
