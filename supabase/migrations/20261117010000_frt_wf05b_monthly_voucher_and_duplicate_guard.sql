-- CP-FRT-WF-05B: monthly atomic voucher numbering and server-side duplicate guard.
-- Preserves the existing FRT request writer and its current execute privileges.
BEGIN;

DO $preflight$
BEGIN
 IF EXISTS (SELECT 1 FROM public.frt_voucher_counters) THEN
  RAISE EXCEPTION 'FRT annual voucher counters are not empty; reconcile historical voucher allocation before converting to monthly counters.';
 END IF;
END
$preflight$;

ALTER TABLE public.frt_voucher_counters
 ADD COLUMN voucher_month smallint NOT NULL;

ALTER TABLE public.frt_voucher_counters
 DROP CONSTRAINT frt_voucher_counters_pkey;

ALTER TABLE public.frt_voucher_counters
 ADD CONSTRAINT frt_voucher_counters_pkey
 PRIMARY KEY(workspace_id,company_id,voucher_year,voucher_month);

ALTER TABLE public.frt_voucher_counters
 ADD CONSTRAINT frt_voucher_counters_month_check
 CHECK(voucher_month BETWEEN 1 AND 12);

COMMENT ON COLUMN public.frt_voucher_counters.voucher_month IS
 'Calendar month used by the company-specific atomic DV sequence.';

ALTER TABLE public.frt_requests
 ADD COLUMN request_date date NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS frt_requests_duplicate_guard_idx
 ON public.frt_requests(
  workspace_id,company_id,(lower(regexp_replace(btrim(recipient_name),'\s+',' ','g'))),total_amount,created_at DESC
 )
 WHERE archived_at IS NULL AND recipient_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.frt_create_request(
 p_workspace_id uuid,p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
 v_company public.frt_companies;
 v_request public.frt_requests;
 v_item jsonb;
 v_item_category text;
 v_item_amount numeric;
 v_total numeric(14,2):=0;
 v_request_date date;
 v_date_needed date;
 v_year integer;
 v_month integer;
 v_sequence integer;
 v_payee text;
 v_account text;
 v_duplicate_key text;
 v_allow_duplicate boolean:=false;
BEGIN
 IF NOT private.frt_has_membership(p_workspace_id) THEN
  RAISE EXCEPTION 'Active Fund Released Tracker membership is required'
   USING ERRCODE='42501';
 END IF;

 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid fund request payload' USING ERRCODE='22023';
 END IF;

 IF length(trim(coalesce(p_payload->>'title',''))) NOT BETWEEN 3 AND 250
    OR length(trim(coalesce(p_payload->>'department',''))) NOT BETWEEN 2 AND 180
    OR length(trim(coalesce(p_payload->>'fundSource',''))) NOT BETWEEN 2 AND 180
    OR length(trim(coalesce(p_payload->>'description',''))) NOT BETWEEN 3 AND 2500
    OR coalesce(p_payload->>'dateNeeded','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
  RAISE EXCEPTION 'Invalid request data' USING ERRCODE='22023';
 END IF;

 v_request_date:=(p_payload->>'requestDate')::date;
 v_date_needed:=(p_payload->>'dateNeeded')::date;
 v_year:=extract(year FROM v_request_date)::integer;
 v_month:=extract(month FROM v_request_date)::integer;

 v_payee:=trim(coalesce(p_payload->>'recipientName',''));
 v_account:=trim(coalesce(p_payload->>'recipientAccount',''));
 IF length(v_payee) NOT BETWEEN 2 AND 180
    OR length(v_account) NOT BETWEEN 3 AND 180
    OR length(coalesce(p_payload->>'recipientBank',''))>180
    OR length(coalesce(p_payload->>'orderIntakeNo',''))>180
    OR length(coalesce(p_payload->>'checkNo',''))>180 THEN
  RAISE EXCEPTION 'Valid beneficiary name and destination account are required'
   USING ERRCODE='22023';
 END IF;

 SELECT * INTO v_company
 FROM public.frt_companies
 WHERE workspace_id=p_workspace_id AND code=p_payload->>'company';
 IF v_company.id IS NULL THEN
  RAISE EXCEPTION 'Invalid company' USING ERRCODE='22023';
 END IF;

 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'At least one expense category is required'
   USING ERRCODE='22023';
 END IF;

 FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
     OR length(trim(coalesce(v_item->>'category',''))) NOT BETWEEN 1 AND 180
     OR coalesce(v_item->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN
   RAISE EXCEPTION 'Invalid expense category or amount' USING ERRCODE='22023';
  END IF;
  v_item_category:=trim(v_item->>'category');
  v_item_amount:=(v_item->>'amount')::numeric;
  IF v_item_amount<=0 THEN
   RAISE EXCEPTION 'Expense amounts must be positive' USING ERRCODE='22023';
  END IF;
  v_total:=v_total+v_item_amount;
 END LOOP;

 IF v_total<=0 OR v_total>999999999999.99 THEN
  RAISE EXCEPTION 'Total expense amount is outside the supported range'
   USING ERRCODE='22023';
 END IF;

 v_allow_duplicate:=coalesce(p_payload->'allowPotentialDuplicate'='true'::jsonb,false);
 v_duplicate_key:=p_workspace_id::text||'|'||v_company.id::text||'|'||
  lower(regexp_replace(v_payee,'\s+',' ','g'))||'|'||v_total::text;

 -- Serialize the same company/payee/amount key so simultaneous submissions
 -- cannot both pass the ten-minute duplicate check.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_duplicate_key,0));

 IF NOT v_allow_duplicate AND EXISTS(
  SELECT 1 FROM public.frt_requests r
  WHERE r.workspace_id=p_workspace_id
   AND r.company_id=v_company.id
   AND lower(regexp_replace(btrim(r.recipient_name),'\s+',' ','g'))=
       lower(regexp_replace(v_payee,'\s+',' ','g'))
   AND r.total_amount=v_total
   AND r.archived_at IS NULL
   AND r.created_at>=clock_timestamp()-interval '10 minutes'
 ) THEN
  RAISE EXCEPTION 'Potential duplicate fund request: same company, payee and amount were submitted within the last 10 minutes'
   USING ERRCODE='23505';
 END IF;

 INSERT INTO public.frt_voucher_counters(
  workspace_id,company_id,voucher_year,voucher_month,last_number
 ) VALUES(p_workspace_id,v_company.id,v_year,v_month,1)
 ON CONFLICT(workspace_id,company_id,voucher_year,voucher_month)
 DO UPDATE SET last_number=public.frt_voucher_counters.last_number+1
 RETURNING last_number INTO v_sequence;

 INSERT INTO public.frt_requests(
  workspace_id,company_id,requestor_id,voucher_no,title,department,fund_source,
  recipient_name,recipient_bank,recipient_account,request_date,date_needed,description,
  order_intake_no,check_no,total_amount
 ) VALUES(
  p_workspace_id,v_company.id,auth.uid(),
  format('DV-%s-%s-%s',v_company.code,to_char(v_request_date,'YYYYMM'),
   lpad(v_sequence::text,3,'0')),
  trim(p_payload->>'title'),trim(p_payload->>'department'),
  trim(p_payload->>'fundSource'),v_payee,
  nullif(trim(p_payload->>'recipientBank'),''),
  v_account,v_request_date,v_date_needed,trim(p_payload->>'description'),
  nullif(trim(p_payload->>'orderIntakeNo'),''),
  nullif(trim(p_payload->>'checkNo'),''),v_total
 ) RETURNING * INTO v_request;

 FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  INSERT INTO public.frt_request_items(
   workspace_id,fund_request_id,category,amount,notes
  ) VALUES(
   p_workspace_id,v_request.id,trim(v_item->>'category'),
   (v_item->>'amount')::numeric,nullif(trim(v_item->>'notes'),'')
  );
 END LOOP;

 INSERT INTO public.frt_audit_logs(
  workspace_id,fund_request_id,user_id,action,details
 ) VALUES(
  p_workspace_id,v_request.id,auth.uid(),'REQUEST_CREATED',
  jsonb_build_object('voucher',v_request.voucher_no,'total',v_total,
   'company',v_company.code,'voucherMonth',to_char(v_request_date,'YYYYMM'))
 );

 RETURN to_jsonb(v_request);
END
$function$;

COMMIT;
