BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.order_intake_orders') IS NULL
     OR to_regclass('public.order_intake_activity') IS NULL
     OR to_regprocedure('public.is_platform_admin(uuid)') IS NULL
     OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
     OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'M195.11 requires the deployed Order Intake foundation and platform authorization functions';
  END IF;
  IF to_regprocedure('public.order_intake_create(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'M195.11 create RPC already exists; reconcile before applying';
  END IF;
END;
$guard$;
CREATE FUNCTION public.order_intake_create(p_order jsonb)
RETURNS public.order_intake_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_unknown_key text;
  v_po_number text;
  v_client_name text;
  v_status text;
  v_company text;
  v_industry text;
  v_po_date date;
  v_received date;
  v_delivery date;
  v_amount numeric(18,2);
  v_rate numeric(8,4);
  v_expenses numeric(18,2);
  v_exclusive numeric(18,2);
  v_vat numeric(18,2);
  v_profit numeric(18,2);
  v_created public.order_intake_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_admin(v_user)
      OR NOT public.has_module_access('order-intake', v_user) THEN
    RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  v_workspace := public.current_workspace_id(v_user);
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' OR pg_column_size(p_order) > 16384 THEN
    RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  SELECT key INTO v_unknown_key FROM jsonb_object_keys(p_order) AS key
  WHERE key NOT IN ('poNumber','clientName','poDate','dateReceived','deliveryDate',
      'poAmount','vatRate','procurementExpenses','currency','status','company','industry',
      'accountManager','buyerInCharge','endUserInCharge','notes') LIMIT 1;
  IF v_unknown_key IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_INTAKE_UNKNOWN_FIELD' USING ERRCODE='22023';
  END IF;
  v_po_number := btrim(coalesce(p_order->>'poNumber',''));
  v_client_name := btrim(coalesce(p_order->>'clientName',''));
  v_status := btrim(coalesce(p_order->>'status',''));
  v_company := btrim(coalesce(p_order->>'company',''));
  v_industry := btrim(coalesce(p_order->>'industry',''));
  IF length(v_po_number) NOT BETWEEN 1 AND 240 OR length(v_client_name) NOT BETWEEN 1 AND 240
     OR length(v_company) NOT BETWEEN 1 AND 240 OR length(v_industry) NOT BETWEEN 1 AND 240
     OR v_status NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged',
       'Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived',
       'Receiving Report','Delivered','Collected','Closed','Cancelled') THEN
    RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';
  END IF;
  v_po_date := (p_order->>'poDate')::date;
  v_received := (p_order->>'dateReceived')::date;
  v_delivery := (p_order->>'deliveryDate')::date;
  v_amount := (p_order->>'poAmount')::numeric(18,2);
  v_rate := coalesce((p_order->>'vatRate')::numeric(8,4),12);
  v_expenses := coalesce((p_order->>'procurementExpenses')::numeric(18,2),0);
  IF v_po_date IS NULL OR v_received IS NULL OR v_delivery IS NULL
      OR v_delivery < v_po_date OR v_amount IS NULL OR v_amount <= 0
      OR v_rate < 0 OR v_rate IS NULL OR v_expenses < 0 OR v_expenses IS NULL
      OR coalesce(p_order->>'currency','PHP') NOT IN ('PHP','USD','EUR')
      OR length(coalesce(p_order->>'accountManager','')) > 240
      OR length(coalesce(p_order->>'buyerInCharge','')) > 1000
      OR length(coalesce(p_order->>'endUserInCharge','')) > 1000
      OR length(coalesce(p_order->>'notes','')) > 12000 THEN
    RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';
  END IF;
  v_exclusive := round(v_amount / (1 + v_rate / 100), 2);
  v_vat := round(v_amount - v_exclusive, 2);
  v_profit := round(v_exclusive - v_expenses, 2);
  INSERT INTO public.order_intake_orders
      (workspace_id,po_number,client_name,po_date,date_received,delivery_date,currency,
       po_amount,vat_rate,vat_exclusive_amount,vat_amount,procurement_expenses,gross_profit,
       status,company,industry,account_manager,buyer_in_charge,end_user_in_charge,notes,fiscal_year)
  VALUES
      (v_workspace,v_po_number,v_client_name,v_po_date,v_received,v_delivery,
       coalesce(p_order->>'currency','PHP'),v_amount,v_rate,v_exclusive,v_vat,v_expenses,v_profit,
       v_status,v_company,v_industry,coalesce(nullif(btrim(p_order->>'accountManager'),''),'Unassigned'),
       coalesce(btrim(p_order->>'buyerInCharge'),''),coalesce(btrim(p_order->>'endUserInCharge'),''),
       coalesce(btrim(p_order->>'notes'),''),extract(year from v_received)::integer)
  RETURNING * INTO v_created;
  INSERT INTO public.order_intake_activity
      (workspace_id,order_id,po_number,type,message,actor_id)
  VALUES (v_workspace,v_created.id,v_created.po_number,'ORDER_CREATED',
    'Created PO ' || v_created.po_number || '.',v_user);
  RETURN v_created;
END;
$body$;
REVOKE ALL ON FUNCTION public.order_intake_create(jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.order_intake_create(jsonb) IS
  'M195.11 deployed atomic PO creation from qualified M195.10 source; client execute disabled until real-user authorization acceptance.';
COMMIT;;
