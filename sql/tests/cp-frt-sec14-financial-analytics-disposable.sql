-- CP-FRT-EXEC-02: disposable PostgreSQL acceptance only.
-- Run after SEC14 safe-board fixtures and the EXEC-02 dashboard projection extension.
-- All test rows and mutations are rolled back.
\set ON_ERROR_STOP on
BEGIN;

-- Deterministic fixture: three WAO requests, category line-items and two
-- submitted liquidations. The existing WASS request is the isolation control.
UPDATE public.frt_requests
SET created_at=date_trunc('month',now())-interval '2 months'+interval '3 days'
WHERE id='10000000-0000-4000-8000-000000000001'
 AND workspace_id='00000000-0000-4000-8000-000000000001';

INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,date_needed,description,total_amount,status,liquidation_status,created_at
)
SELECT '10000000-0000-4000-8000-000000000003',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b','EXEC02-002','Disposable request 2',
 'Fixture','OPS',CURRENT_DATE,'Disposable analytics fixture',15000.00,
 'IN_PROGRESS','SUBMITTED',
 date_trunc('month',now())-interval '1 month'+interval '3 days'
FROM public.frt_companies c
WHERE c.workspace_id='00000000-0000-4000-8000-000000000001' AND c.code='WAO';

INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,date_needed,description,total_amount,status,liquidation_status,created_at
)
SELECT '10000000-0000-4000-8000-000000000004',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b','EXEC02-003','Disposable request 3',
 'Fixture','OPS',CURRENT_DATE,'Disposable analytics fixture',6000.00,
 'PENDING_APPROVAL','NOT_SUBMITTED',
 date_trunc('month',now())+interval '3 days'
FROM public.frt_companies c
WHERE c.workspace_id='00000000-0000-4000-8000-000000000001' AND c.code='WAO';

INSERT INTO public.frt_request_items(workspace_id,fund_request_id,category,amount)
VALUES
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Office Supplies',50000.00),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Equipment',34215.50),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Office Supplies',10000.00),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Travel',5000.00),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Travel',6000.00);

INSERT INTO public.frt_liquidations(
 workspace_id,fund_request_id,submitted_by,submitted_at,total_spent,excess_or_deficit
)
VALUES
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000000b',
  date_trunc('month',now())-interval '1 month'+interval '5 days',20000.00,64215.50),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-00000000000b',
  date_trunc('month',now())+interval '5 days',12000.00,3000.00);

DO $privileges$
BEGIN
 IF NOT has_function_privilege('authenticated',
      'public.frt_board_dashboard_safe(uuid,text)','EXECUTE') OR
    has_function_privilege('anon',
      'public.frt_board_dashboard_safe(uuid,text)','EXECUTE') OR
    has_table_privilege('authenticated','public.frt_requests','SELECT') OR
    has_table_privilege('authenticated','public.frt_request_items','SELECT') OR
    has_table_privilege('authenticated','public.frt_liquidations','SELECT') THEN
  RAISE EXCEPTION 'EXEC-02 function/table privilege boundary incorrect';
 END IF;
 IF (SELECT prosecdef FROM pg_proc
     WHERE oid='public.frt_board_dashboard_safe(uuid,text)'::regprocedure) IS DISTINCT FROM true OR
    (SELECT provolatile FROM pg_proc
     WHERE oid='public.frt_board_dashboard_safe(uuid,text)'::regprocedure) IS DISTINCT FROM 's' THEN
  RAISE EXCEPTION 'EXEC-02 RPC must remain SECURITY DEFINER and STABLE';
 END IF;
END;
$privileges$;

SET ROLE authenticated;
DO $acceptance$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 j jsonb;
 blocked boolean;
BEGIN
 -- Existing non-bootstrap Finance Manager retains the same FRT membership
 -- visibility; no elevated finance role is required for aggregate reads.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',true);
 j:=public.frt_board_dashboard_safe(w,'WAO');
 IF jsonb_object_length(j)<>10 OR j->>'company_code'<>'WAO' OR
    (j->>'requested_total')::numeric<>105215.50 OR
    (j->>'spent_total')::numeric<>32000.00 OR
    jsonb_array_length(j->'top_categories')<>3 OR
    j->'top_categories'->0->>'category'<>'Office Supplies' OR
    (j->'top_categories'->0->>'requested_amount')::numeric<>60000.00 OR
    jsonb_array_length(j->'monthly_trend')<>6 OR
    (j->'monthly_trend'->3->>'requested_amount')::numeric<>84215.50 OR
    (j->'monthly_trend'->4->>'requested_amount')::numeric<>15000.00 OR
    (j->'monthly_trend'->4->>'spent_amount')::numeric<>20000.00 OR
    (j->'monthly_trend'->5->>'requested_amount')::numeric<>6000.00 OR
    (j->'monthly_trend'->5->>'spent_amount')::numeric<>12000.00 OR
    j::text LIKE '%SECRET%' OR j::text LIKE '%Disposable request%' OR
    j::text LIKE '%requestor%' OR j::text LIKE '%recipient%' OR
    j::text LIKE '%bank%' OR j::text LIKE '%invoice%' THEN
  RAISE EXCEPTION 'EXEC-02 company-scoped aggregate projection mismatch or data leak: %',j;
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(j->'monthly_trend'))<>6 OR
    (SELECT count(DISTINCT x->>'month') FROM jsonb_array_elements(j->'monthly_trend') x)<>6 THEN
  RAISE EXCEPTION 'EXEC-02 six-month series is incomplete or duplicated';
 END IF;
 -- Other company in the same workspace returns only its own aggregates.
 j:=public.frt_board_dashboard_safe(w,'WASS');
 IF j->>'company_code'<>'WASS' OR
    (j->>'requested_total')::numeric<>12345.00 OR
    (j->>'spent_total')::numeric<>0 OR
    jsonb_array_length(j->'top_categories')<>0 OR
    j::text LIKE '%WAO%' THEN
  RAISE EXCEPTION 'EXEC-02 same-workspace company isolation failed: %',j;
 END IF;
 -- Existing GM/bootstrap role has the same aggregate read access.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',true);
 j:=public.frt_board_dashboard_safe(w,'WAO');
 IF (j->>'requested_total')::numeric<>105215.50 THEN
  RAISE EXCEPTION 'EXEC-02 existing GM FRT membership parity failed';
 END IF;
 -- Foreign workspace and non-member access remain denied.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_dashboard_safe(
   '00000000-0000-4000-8000-000000000002','WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'EXEC-02 foreign workspace read was allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000c',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_dashboard_safe(w,'WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'EXEC-02 nonmember read was allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_dashboard_safe(w,'WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'EXEC-02 unsigned read was allowed'; END IF;
 RAISE NOTICE 'CP-FRT-EXEC-02 DISPOSABLE ACCEPTANCE: PASS';
END;
$acceptance$;
RESET ROLE;

ROLLBACK;
