-- CP-FRT Executive Dashboard aggregate-only RPC acceptance.
-- Run after the existing SEC14 disposable setup and safe board acceptance.
-- Disposable PostgreSQL only; never run this fixture against production.
\set ON_ERROR_STOP on

DO $grants$
BEGIN
 IF NOT has_function_privilege('authenticated',
    'public.frt_executive_dashboard_safe(uuid,text)','EXECUTE') OR
    has_function_privilege('anon',
    'public.frt_executive_dashboard_safe(uuid,text)','EXECUTE') OR
    has_table_privilege('authenticated','public.frt_requests','SELECT') OR
    has_table_privilege('authenticated','public.frt_request_items','SELECT') OR
    has_table_privilege('authenticated','public.frt_liquidations','SELECT')
 THEN
  RAISE EXCEPTION 'FRT executive analytics grants are not narrowly scoped';
 END IF;
END;
$grants$;

INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,recipient_name,recipient_bank,recipient_account,date_needed,
 description,total_amount,status,liquidation_status,finance_approved_at,
 created_at,updated_at
)
SELECT '10000000-0000-4000-8000-000000000003',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b',
 'EXEC-DASH-DONE','Executive dashboard completed fixture','Finance','OPS',
 'PRIVATE RECIPIENT','PRIVATE BANK','PRIVATE ACCOUNT',current_date,
 'PRIVATE DESCRIPTION',12000,'DONE','APPROVED',
 date_trunc('month',current_date)-interval '1 month',
 date_trunc('month',current_date)-interval '1 month'+interval '15 days',
 now()
FROM public.frt_companies c
WHERE c.workspace_id='00000000-0000-4000-8000-000000000001' AND c.code='WAO';

INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,recipient_name,recipient_bank,recipient_account,date_needed,
 description,total_amount,status,liquidation_status,finance_approved_at,
 created_at,updated_at
)
SELECT '10000000-0000-4000-8000-000000000004',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b',
 'EXEC-DASH-PENDING','Executive dashboard pending fixture','Finance','OPS',
 'PRIVATE RECIPIENT','PRIVATE BANK','PRIVATE ACCOUNT',current_date,
 'PRIVATE DESCRIPTION',4000,'IN_PROGRESS','NOT_SUBMITTED',
 date_trunc('month',current_date)-interval '6 months',
 date_trunc('month',current_date)-interval '6 months'+interval '15 days',
 now()
FROM public.frt_companies c
WHERE c.workspace_id='00000000-0000-4000-8000-000000000001' AND c.code='WAO';

INSERT INTO public.frt_request_items(workspace_id,fund_request_id,category,amount,notes)
VALUES
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Salaries & Wages',9000,'PRIVATE'),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Purchases',3000,'PRIVATE'),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Salaries & Wages',1000,'PRIVATE'),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Travel',3000,'PRIVATE');

INSERT INTO public.frt_liquidations(
 workspace_id,fund_request_id,submitted_by,submitted_at,notes,total_spent,excess_or_deficit
)
VALUES(
 '00000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000003',
 '00000000-0000-4000-8000-00000000000b',
 date_trunc('month',current_date)-interval '1 month'+interval '20 days',
 'PRIVATE',11500,500
);

SET ROLE authenticated;
DO $acceptance$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 j jsonb;
 blocked boolean;
 v_first text:=to_char(date_trunc('month',current_date)-interval '6 months','YYYY-MM');
 v_last text:=to_char(date_trunc('month',current_date)-interval '1 month','YYYY-MM');
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
 j:=public.frt_executive_dashboard_safe(w,'WAO');
 IF jsonb_typeof(j)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(j))<>6 OR
    (j->>'total_amount')::numeric<>100215.50 OR
    (j->>'total_liquidated')::numeric<>12000 OR
    (j->>'budget_utilization')::numeric<>11.97 OR
    (j->>'pending_liquidation')::numeric<>4000 OR
    jsonb_array_length(j->'top_categories')<>3 OR
    j->'top_categories'->0->>'category'<>'Salaries & Wages' OR
    (j->'top_categories'->0->>'amount')::numeric<>10000 OR
    jsonb_array_length(j->'monthly_trend')<>6 OR
    j->'monthly_trend'->0->>'period'<>v_first OR
    j->'monthly_trend'->5->>'period'<>v_last OR
    (SELECT (x->>'requested')::numeric FROM jsonb_array_elements(j->'monthly_trend') x
      WHERE x->>'period'=v_first)<>4000 OR
    (SELECT (x->>'requested')::numeric FROM jsonb_array_elements(j->'monthly_trend') x
      WHERE x->>'period'=v_last)<>12000 OR
    (SELECT (x->>'spent')::numeric FROM jsonb_array_elements(j->'monthly_trend') x
      WHERE x->>'period'=v_last)<>11500
 THEN
  RAISE EXCEPTION 'FRT executive aggregate calculations or time series mismatch: %',j;
 END IF;
 IF j::text LIKE '%PRIVATE%' OR j::text LIKE '%recipient%' OR
    j::text LIKE '%requestor%' OR j::text LIKE '%bank%' OR
    j::text LIKE '%notes%' OR j::text LIKE '%department%' THEN
  RAISE EXCEPTION 'FRT executive aggregate response exposed a restricted field';
 END IF;
 blocked:=false;
 BEGIN
  PERFORM public.frt_executive_dashboard_safe(
   '00000000-0000-4000-8000-000000000002','WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FRT executive analytics allowed a foreign workspace';
 END IF;
 blocked:=false;
 BEGIN
  PERFORM public.frt_executive_dashboard_safe(w,'NOT A COMPANY');
 EXCEPTION WHEN SQLSTATE '22023' THEN blocked:=true;
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FRT executive analytics accepted an invalid company';
 END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_executive_dashboard_safe(w,'WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'FRT executive analytics accepted an unsigned caller';
 END IF;
 RAISE NOTICE 'FRT EXECUTIVE DASHBOARD AGGREGATE ACCEPTANCE: PASS';
END;
$acceptance$;
RESET ROLE;

DO $no_direct_access$
BEGIN
 IF has_table_privilege('authenticated','public.frt_requests','SELECT') OR
    has_table_privilege('authenticated','public.frt_request_items','SELECT') OR
    has_table_privilege('authenticated','public.frt_liquidations','SELECT') OR
    has_function_privilege('anon','public.frt_executive_dashboard_safe(uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'FRT executive analytics expanded direct table or anonymous access';
 END IF;
END;
$no_direct_access$;

-- Remove only this test's exact synthetic rows so downstream disposable
-- acceptance fixtures observe their original baseline.
DELETE FROM public.frt_liquidations
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND fund_request_id IN (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004');
DELETE FROM public.frt_request_items
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND fund_request_id IN (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004');
DELETE FROM public.frt_requests
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND id IN (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004');
