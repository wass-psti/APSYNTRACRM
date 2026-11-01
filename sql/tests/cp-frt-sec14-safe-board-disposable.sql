-- CP-FRT-SEC14: source-aligned signed-identity simulation in disposable PostgreSQL ONLY.
-- Run AFTER sec06 disposable setup, role-ceiling, and sec10-ci03 finance schema.
-- No external auth, live finance rows, production DDL or credential changes.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.frt_companies(workspace_id,code,name,display_order)
VALUES
 ('00000000-0000-4000-8000-000000000001','WAO','Fixture A',1),
 ('00000000-0000-4000-8000-000000000001','WASS','Fixture B',2);
INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,recipient_name,recipient_bank,recipient_account,
 date_needed,description,total_amount,status,liquidation_status,
 finance_approved_at)
SELECT '10000000-0000-4000-8000-000000000001',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b',
 'SEC14-SECRET-VOUCHER','Safe board request','SEC14 PRIVATE DEPT','OPS',
 'SEC14 SECRET RECIPIENT','SEC14 SECRET BANK','SEC14 SECRET ACCOUNT',
 DATE '2026-11-15','SEC14 SECRET DESCRIPTION',84215.50,
 'PENDING_APPROVAL','NOT_SUBMITTED',NULL
FROM public.frt_companies c WHERE c.code='WAO'
AND c.workspace_id='00000000-0000-4000-8000-000000000001';
INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,
 fund_source,recipient_name,recipient_bank,recipient_account,
 date_needed,description,total_amount,status,liquidation_status,
 finance_approved_at)
SELECT '10000000-0000-4000-8000-000000000002',c.workspace_id,c.id,
 '00000000-0000-4000-8000-00000000000b',
 'SEC14-DONE','Closed-candidate request','Finance','OPS',
 'SEC14 SECRET RECIPIENT B','SEC14 SECRET BANK B','SEC14 SECRET ACCOUNT B',
 DATE '2026-11-16','SEC14 PRIVATE DESCRIPTION',12345.00,
 'DONE','APPROVED',TIMESTAMPTZ '2026-11-01 00:00:00+00'
FROM public.frt_companies c WHERE c.code='WASS'
AND c.workspace_id='00000000-0000-4000-8000-000000000001';
COMMIT;

DO $privileges$
BEGIN
 IF NOT has_function_privilege('authenticated',
    'public.frt_board_list_safe(uuid,text,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
    'public.frt_board_detail_safe(uuid,uuid,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_board_list_safe(uuid,text,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_board_detail_safe(uuid,uuid,text)','EXECUTE') OR
    has_table_privilege('authenticated','public.frt_requests','SELECT') THEN
   RAISE EXCEPTION 'SEC14 routine or table grants incorrect';
 END IF;
END;
$privileges$;

-- Anonymous calls are prevented by grants; run authenticated actor cases.
SET ROLE authenticated;
DO $acceptance$
DECLARE
 w uuid := '00000000-0000-4000-8000-000000000001';
 r1 uuid := '10000000-0000-4000-8000-000000000001';
 r2 uuid := '10000000-0000-4000-8000-000000000002';
 j jsonb;
 detail jsonb;
 blocked boolean;
BEGIN
 -- Finance Manager: signed workspace member and module grant, no approver privilege.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',true);
 j := public.frt_board_list_safe(w,'WAO','');
 IF jsonb_typeof(j)<>'array' OR jsonb_array_length(j)<>1 OR
    j->0->>'id' IS DISTINCT FROM r1::text OR
    j->0->>'title' IS DISTINCT FROM 'Safe board request' OR
    j::text LIKE '%SECRET ACCOUNT%' OR j::text LIKE '%84215%' OR
    j::text LIKE '%recipient%' OR j::text LIKE '%amount%' OR
    j::text LIKE '%department%' OR
    (SELECT count(*) FROM jsonb_object_keys(j->0))<>8 THEN
    RAISE EXCEPTION 'SEC14 safe request list leaked restricted data';
 END IF;
 detail := public.frt_board_detail_safe(w,r1,'WAO');
 IF detail->>'id' IS DISTINCT FROM r1::text OR
    detail->>'company_code' IS DISTINCT FROM 'WAO' OR
    detail->'workflow'->0->>'code' IS DISTINCT FROM 'approve' OR
    (detail->'workflow'->0->>'candidate')::boolean IS DISTINCT FROM false OR
    (detail->'workflow'->6->>'candidate')::boolean IS DISTINCT FROM false OR
    detail::text LIKE '%SECRET%' OR detail::text LIKE '%84215%' OR
    detail::text LIKE '%amount%' OR detail::text LIKE '%recipient%' OR
    (SELECT count(*) FROM jsonb_object_keys(detail))<>13 THEN
   RAISE EXCEPTION 'SEC14 safe request detail leaked data or widened role';
 END IF;
 detail := public.frt_board_detail_safe(w,r2,'WASS');
 IF (detail->'workflow'->5->>'candidate')::boolean IS DISTINCT FROM true OR
    (detail->'workflow'->0->>'candidate')::boolean IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'SEC14 finance manager state matrix incorrect';
 END IF;
 -- Company mismatch cannot request the same UUID under an alternate company.
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_detail_safe(w,r1,'WASS');
 EXCEPTION WHEN SQLSTATE 'P0002' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'SEC14 company isolation failed'; END IF;
 IF jsonb_array_length(public.frt_board_list_safe(w,'NOT_FOUND',''))<>0 THEN
  RAISE EXCEPTION 'SEC14 company list isolation failed';
 END IF;
 -- Bootstrap/GM role may see candidate approval; still not executable.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',true);
 detail := public.frt_board_detail_safe(w,r1,'WAO');
 IF (detail->'workflow'->0->>'candidate')::boolean IS DISTINCT FROM true OR
    detail->'workflow'->0->>'authority' <> 'NOT_VERIFIED_FOR_EXECUTION' OR
    (detail->'workflow'->6->>'candidate')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'SEC14 GM candidate preview incorrect';
 END IF;
 -- Other-workspace user, missing active FRT module grant, invalid signed subject.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000c',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_list_safe(w,'WAO','');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'SEC14 cross-workspace list denial failed'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_detail_safe(w,r1,'WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'SEC14 cross-workspace detail denial failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_board_list_safe(w,'WAO','');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'SEC14 unsigned request allowed'; END IF;
 RAISE NOTICE 'SEC14 SAFE BOARD SQL ACCEPTANCE: PASS';
END;
$acceptance$;
RESET ROLE;

DO $unchanged$
BEGIN
 IF (SELECT count(*) FROM public.frt_requests)<>2 OR
    (SELECT count(*) FROM public.frt_audit_logs)<>0 OR
    (SELECT count(*) FROM public.frt_liquidations)<>0 THEN
  RAISE EXCEPTION 'SEC14 read-only acceptance modified finance records';
 END IF;
END;
$unchanged$;
