CREATE OR REPLACE FUNCTION public.order_intake_update_details(p_id uuid,p_patch jsonb,p_expected_revision integer)
RETURNS public.order_intake_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=auth.uid();v_workspace uuid;v_old public.order_intake_orders%ROWTYPE;v_updated public.order_intake_orders%ROWTYPE;v_payload jsonb;v_unknown text;v_amount numeric;v_rate numeric;v_expenses numeric;v_exclusive numeric;v_vat numeric;v_profit numeric;
BEGIN
IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) OR NOT public.has_module_access('order-intake',v_actor) THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501';END IF;
v_workspace:=public.current_workspace_id(v_actor);
IF v_workspace IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=v_workspace AND user_id=v_actor AND active) THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501';END IF;
IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR pg_column_size(p_patch)>16384 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023';END IF;
SELECT key INTO v_unknown FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN ('poNumber','clientName','poDate','dateReceived','deliveryDate','currency','poAmount','vatRate','procurementExpenses','status','company','industry','accountManager','buyerInCharge','endUserInCharge','notes') LIMIT 1;
IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'ORDER_INTAKE_UNKNOWN_FIELD' USING ERRCODE='22023';END IF;
SELECT * INTO v_old FROM public.order_intake_orders WHERE workspace_id=v_workspace AND id=p_id AND archived=false FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002';END IF;
IF v_old.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
v_payload:=jsonb_build_object('poNumber',v_old.po_number,'clientName',v_old.client_name,'poDate',v_old.po_date,'dateReceived',v_old.date_received,'deliveryDate',v_old.delivery_date,'currency',v_old.currency,'poAmount',v_old.po_amount,'vatRate',v_old.vat_rate,'procurementExpenses',v_old.procurement_expenses,'status',v_old.status,'company',v_old.company,'industry',v_old.industry,'accountManager',v_old.account_manager,'buyerInCharge',v_old.buyer_in_charge,'endUserInCharge',v_old.end_user_in_charge,'notes',v_old.notes)||p_patch;
IF length(btrim(coalesce(v_payload->>'poNumber',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'clientName',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'company',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'industry',''))) NOT BETWEEN 1 AND 240
OR v_payload->>'status' NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged','Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived','Receiving Report','Delivered','Collected','Closed','Cancelled')
OR v_payload->>'currency' NOT IN ('PHP','USD','EUR')
OR length(coalesce(v_payload->>'accountManager',''))>240
OR length(coalesce(v_payload->>'buyerInCharge',''))>1000
OR length(coalesce(v_payload->>'endUserInCharge',''))>1000
OR length(coalesce(v_payload->>'notes',''))>12000
OR (v_payload->>'deliveryDate')::date < (v_payload->>'poDate')::date
OR (v_payload->>'poDate') IS NULL OR (v_payload->>'dateReceived') IS NULL OR (v_payload->>'deliveryDate') IS NULL
THEN RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';END IF;
v_amount:=(v_payload->>'poAmount')::numeric;v_rate:=(v_payload->>'vatRate')::numeric;v_expenses:=(v_payload->>'procurementExpenses')::numeric;
IF v_amount IS NULL OR v_amount<=0 OR v_amount>9999999999999999 OR v_rate IS NULL OR v_rate<0 OR v_rate>9999 OR v_expenses IS NULL OR v_expenses<0 OR v_expenses>9999999999999999 THEN RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';END IF;
v_exclusive:=round(v_amount/(1+v_rate/100),2);v_vat:=round(v_amount-v_exclusive,2);v_profit:=round(v_exclusive-v_expenses,2);
UPDATE public.order_intake_orders SET po_number=btrim(v_payload->>'poNumber'),
client_name=btrim(v_payload->>'clientName'),
po_date=(v_payload->>'poDate')::date,
date_received=(v_payload->>'dateReceived')::date,
delivery_date=(v_payload->>'deliveryDate')::date,
currency=v_payload->>'currency',
po_amount=(v_payload->>'poAmount')::numeric,
vat_rate=(v_payload->>'vatRate')::numeric,
procurement_expenses=(v_payload->>'procurementExpenses')::numeric,
status=v_payload->>'status',
company=btrim(v_payload->>'company'),
industry=btrim(v_payload->>'industry'),
account_manager=coalesce(nullif(btrim(v_payload->>'accountManager'),''),'Unassigned'),
buyer_in_charge=btrim(v_payload->>'buyerInCharge'),
end_user_in_charge=btrim(v_payload->>'endUserInCharge'),
notes=btrim(v_payload->>'notes'),
fiscal_year=extract(year from (v_payload->>'dateReceived')::date)::integer,
vat_exclusive_amount=v_exclusive,
vat_amount=v_vat,
gross_profit=v_profit,
status_updated_at=CASE WHEN v_old.status IS DISTINCT FROM v_payload->>'status' THEN transaction_timestamp() ELSE v_old.status_updated_at END,
revision=revision+1,
updated_at=transaction_timestamp()
WHERE workspace_id=v_workspace AND id=p_id AND revision=p_expected_revision AND archived=false RETURNING * INTO v_updated;
IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
VALUES(v_workspace,p_id,v_updated.po_number,'ORDER_UPDATED','Updated PO '||v_updated.po_number||' (revision '||v_updated.revision||')',v_actor);
RETURN v_updated;
END $function$;
REVOKE ALL ON FUNCTION public.order_intake_update_details(uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.order_intake_update_details(uuid,jsonb,integer) TO authenticated;;
