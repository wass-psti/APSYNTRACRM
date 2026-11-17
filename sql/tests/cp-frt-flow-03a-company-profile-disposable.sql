CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA storage;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.frt_memberships(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,status text NOT NULL DEFAULT 'active',
 display_name text,PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.frt_companies(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,
 display_order integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,code)
);
CREATE TABLE public.frt_requests(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,company_id uuid NOT NULL,
 voucher_no text NOT NULL,title text NOT NULL,status text NOT NULL,
 liquidation_status text NOT NULL,date_needed date NOT NULL,
 finance_approved_at timestamptz,transfer_confirmed_at timestamptz,
 closed_at timestamptz,archived_at timestamptz,requestor_id uuid,
 department text,fund_source text,recipient_name text,recipient_bank text,
 description text,order_intake_no text,check_no text,total_amount numeric(14,2),
 created_at timestamptz NOT NULL DEFAULT now(),finance_approved_by uuid,
 transfer_confirmed_by uuid,transfer_reference text
);
CREATE TABLE public.frt_request_items(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,fund_request_id uuid NOT NULL,
 category text,notes text,amount numeric(14,2),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.objects(bucket_id text NOT NULL,name text NOT NULL,owner_id text,metadata jsonb,
 PRIMARY KEY(bucket_id,name));

CREATE FUNCTION private.frt_has_membership(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.frt_memberships m
  WHERE m.workspace_id=p_workspace_id AND m.user_id=auth.uid()
   AND m.enabled=true AND m.status='active'
 )
$$;
CREATE FUNCTION private.frt_current_role(p_workspace_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
 SELECT m.role FROM public.frt_memberships m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=auth.uid()
  AND m.enabled=true AND m.status='active'
 LIMIT 1
$$;

CREATE FUNCTION public.frt_restricted_request_detail(p_workspace_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

INSERT INTO public.frt_companies(id,workspace_id,code,name,display_order) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','WAO','Watchdog Automation OPC',1),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','WASS','Watchdog Automation Sales & Services',2),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','PSTI','Process Solutions Technology Inc.',3);
INSERT INTO public.frt_companies(id,workspace_id,code,name,display_order) VALUES
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','WAO','Foreign Workspace WAO',1);
INSERT INTO public.frt_memberships(workspace_id,user_id,role,display_name) VALUES
 ('00000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','REQUESTOR','Disposable Requestor');

GRANT SELECT ON public.frt_memberships,public.frt_companies,public.frt_requests,public.frt_request_items,storage.objects TO authenticated;

\ir ../../supabase/migrations/20261117031500_frt_company_profile_metadata.sql

INSERT INTO public.frt_requests(
  id,workspace_id,company_id,voucher_no,title,status,liquidation_status,date_needed,
  requestor_id,department,fund_source,recipient_name,recipient_bank,description,
  order_intake_no,check_no,total_amount,created_at
 ) SELECT '11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001',c.id,'DV-WASS-202611-007','Disposable voucher','PENDING_APPROVAL',
  'NOT_SUBMITTED','2026-11-20','22222222-2222-4222-8222-222222222222','Operations','Operating Fund','Supplier','Example Bank',
  'Disposable request','OI-TEST','CHK-TEST',125.00,'2026-11-17T01:00:00Z'
 FROM public.frt_companies c WHERE c.workspace_id='00000000-0000-4000-8000-000000000001' AND c.code='WASS';
INSERT INTO public.frt_request_items(id,workspace_id,fund_request_id,category,notes,amount)
 VALUES('44444444-4444-4444-8444-444444444444','00000000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111','Office','Supplies',125.00);

INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES(
 'frt-attachments',
 '00000000-0000-4000-8000-000000000001/company-profiles/WASS/33333333-3333-4333-8333-333333333333.png',
 '22222222-2222-4222-8222-222222222222','{"mimetype":"image/png","size":8}'
);

SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;

DO $$
DECLARE
 ws uuid := '00000000-0000-4000-8000-000000000001';
 foreign_ws uuid := '00000000-0000-4000-8000-000000000002';
 actor uuid := '22222222-2222-4222-8222-222222222222';
 request_id uuid := '11111111-1111-4111-8111-111111111111';
 logo text := '00000000-0000-4000-8000-000000000001/company-profiles/WASS/33333333-3333-4333-8333-333333333333.png';
 voucher jsonb;
BEGIN
 PERFORM public.frt_update_company_profile(ws,'WAO','Watchdog Automation OPC','WAO registered address','+63 32 100 0001','wao@example.com',NULL);
 PERFORM public.frt_update_company_profile(ws,'WASS','Watchdog Automation Sales & Services','WASS registered address','+63 32 100 0002','wass@example.com',NULL);
 PERFORM public.frt_update_company_profile(ws,'WASS','Watchdog Automation Sales & Services','WASS registered address','+63 32 100 0002','wass@example.com',logo);
 PERFORM public.frt_update_company_profile(ws,'PSTI','Process Solutions Technology Inc.','PSTI registered address','+63 32 100 0003','psti@example.com',NULL);

 IF (SELECT registered_address FROM public.frt_companies WHERE workspace_id=ws AND code='WAO') <> 'WAO registered address' THEN
  RAISE EXCEPTION 'WAO profile did not persist';
 END IF;
 IF (SELECT registered_address FROM public.frt_companies WHERE workspace_id=ws AND code='WASS') <> 'WASS registered address' THEN
  RAISE EXCEPTION 'WASS profile did not persist';
 END IF;
 IF (SELECT registered_address FROM public.frt_companies WHERE workspace_id=ws AND code='PSTI') <> 'PSTI registered address' THEN
  RAISE EXCEPTION 'PSTI profile did not persist';
 END IF;
 IF (SELECT logo_path FROM public.frt_companies WHERE workspace_id=ws AND code='WASS') <> logo THEN
  RAISE EXCEPTION 'WASS logo path did not persist';
 END IF;
 IF (SELECT logo_path FROM public.frt_companies WHERE workspace_id=ws AND code='WAO') IS NOT NULL THEN
  RAISE EXCEPTION 'Company logo crossed into WAO';
 END IF;
 IF (SELECT contact_email FROM public.frt_companies WHERE workspace_id=ws AND code='PSTI') <> 'psti@example.com' THEN
  RAISE EXCEPTION 'PSTI profile did not persist';
 END IF;


 voucher:=public.frt_restricted_request_detail(ws,request_id)->'voucher';
 IF voucher#>>'{company,address}' <> 'WASS registered address' OR
    voucher#>>'{company,phone}' <> '+63 32 100 0002' OR
    voucher#>>'{company,email}' <> 'wass@example.com' OR
    voucher#>>'{company,logoPath}' <> logo THEN
  RAISE EXCEPTION 'Signed voucher projection did not include the saved WASS profile';
 END IF;
 IF voucher->>'voucherNumber' <> 'DV-WASS-202611-007' THEN
  RAISE EXCEPTION 'Voucher number changed during company profile update';
 END IF;
 IF (SELECT voucher_no FROM public.frt_requests WHERE id=request_id) <> 'DV-WASS-202611-007' THEN
  RAISE EXCEPTION 'Existing request voucher number was mutated';
 END IF;

 BEGIN
  PERFORM public.frt_update_company_profile(ws,'WASS','WASS','', '', 'invalid-email',logo);
  RAISE EXCEPTION 'Invalid email was unexpectedly accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  NULL;
 END;
 BEGIN
  PERFORM public.frt_update_company_profile(ws,'WAO','WAO','', '', '',logo);
  RAISE EXCEPTION 'Cross-company logo path was unexpectedly accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  NULL;
 END;
 BEGIN
  PERFORM public.frt_update_company_profile(foreign_ws,'WAO','Foreign WAO','', '', '',NULL);
  RAISE EXCEPTION 'Foreign workspace profile write was unexpectedly accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
 END;

 RAISE NOTICE 'PASS: three company profiles, private logo reference, workspace/company isolation and voucher projection';
END $$;

RESET ROLE;
