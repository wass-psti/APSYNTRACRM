-- Run inside an outer BEGIN/ROLLBACK after the WF04 migration.
DO $test$
DECLARE
  ws uuid; co uuid; actor uuid; outsider uuid:=gen_random_uuid(); req uuid;
  v_before jsonb; v_after jsonb; kind integer; signed_role text;
BEGIN
 SELECT c.workspace_id,c.id INTO STRICT ws,co FROM public.frt_companies c
 ORDER BY c.workspace_id,c.id LIMIT 1;
 SELECT id INTO STRICT actor FROM auth.users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(ws,actor,'FINANCE_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='FINANCE_MANAGER',enabled=true,status='active';
 signed_role:=private.frt_current_role(ws);
 IF signed_role IS NULL THEN
   RAISE EXCEPTION 'Disposable actor requires existing signed FRT role';
 END IF;
 v_before:=public.frt_liquidation_aging_company(ws,(SELECT code FROM public.frt_companies WHERE id=co));
 FOR kind IN 1..6 LOOP
  INSERT INTO public.frt_requests(
   workspace_id,company_id,requestor_id,voucher_no,title,department,
   fund_source,date_needed,description,total_amount,status,liquidation_status,
   finance_approved_at
  ) VALUES (
   ws,co,actor,'WF04-'||gen_random_uuid(),'Disposable aging '||kind,
   'IT','OPEX',current_date,'Rollback-only',100.00,
   CASE WHEN kind=6 THEN 'REJECTED' ELSE 'IN_PROGRESS' END,
   CASE WHEN kind=5 THEN 'APPROVED' ELSE 'NOT_SUBMITTED' END,
   now()-interval '6 days'
  ) RETURNING id INTO req;
  IF kind<>1 THEN
   INSERT INTO public.frt_bank_executions(
    workspace_id,fund_request_id,executed_at,bank_name,transaction_reference,recorded_by
   ) VALUES(
    ws,req,
    CASE kind
     WHEN 2 THEN now()-interval '12 hours'
     WHEN 3 THEN now()-interval '70 hours'
     WHEN 4 THEN now()-interval '73 hours'
     ELSE now()-interval '24 hours'
    END,
    'Disposable Bank','WF04-'||kind,actor
   );
  END IF;
 END LOOP;
 v_after:=public.frt_liquidation_aging_company(ws,(SELECT code FROM public.frt_companies WHERE id=co));
 IF (v_after->>'pending_total')::int-(v_before->>'pending_total')::int <>4
  OR (v_after->>'awaiting_bank_execution')::int-(v_before->>'awaiting_bank_execution')::int<>1
  OR (v_after->>'on_track')::int-(v_before->>'on_track')::int<>1
  OR (v_after->>'due_soon')::int-(v_before->>'due_soon')::int<>1
  OR (v_after->>'overdue')::int-(v_before->>'overdue')::int<>1
  OR (v_after->>'completed')::int-(v_before->>'completed')::int<>1 THEN
  RAISE EXCEPTION 'WF04 unexpected aging buckets: before %, after %',v_before,v_after;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN
  PERFORM public.frt_liquidation_aging_company(ws,(SELECT code FROM public.frt_companies WHERE id=co));
  RAISE EXCEPTION 'UNSIGNED_AGING_ACCESS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'WF04 PASS: company aggregate, missing bank, due later, imminent, overdue, approved, rejected and unsigned denial';
END $test$;
