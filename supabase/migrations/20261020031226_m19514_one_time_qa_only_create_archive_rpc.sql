BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('public.order_intake_create(jsonb)') IS NULL
 OR to_regclass('public.order_intake_orders') IS NULL
 OR to_regclass('public.order_intake_activity') IS NULL
 THEN RAISE EXCEPTION 'M195.14 prerequisites missing'; END IF;
 IF to_regprocedure('public.order_intake_qa_create_once()') IS NOT NULL
 OR to_regprocedure('public.order_intake_qa_archive_once()') IS NOT NULL
 THEN RAISE EXCEPTION 'M195.14 QA RPC already exists'; END IF;
 IF has_function_privilege('authenticated','public.order_intake_create(jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.order_intake_create(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'M195.14 blocked: ordinary Create PO enabled'; END IF;
END; $guard$;
CREATE FUNCTION public.order_intake_qa_create_once()
RETURNS public.order_intake_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $body$
DECLARE v_actor uuid := auth.uid(); v_created public.order_intake_orders%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor)
 OR NOT public.has_module_access('order-intake',v_actor)
 OR public.current_workspace_id(v_actor) IS NULL
 THEN RAISE EXCEPTION 'M19514_QA_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF clock_timestamp() >= TIMESTAMPTZ '2026-10-24 00:00:00+00'
 THEN RAISE EXCEPTION 'M19514_QA_WINDOW_CLOSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(19514,20261020);
 IF EXISTS (SELECT 1 FROM public.order_intake_orders
 WHERE po_number='M19514-QA-ONLY-20261020')
 THEN RAISE EXCEPTION 'M19514_QA_ALREADY_USED' USING ERRCODE='22023'; END IF;
 v_created := public.order_intake_create(jsonb_build_object(
 'poNumber','M19514-QA-ONLY-20261020',
 'clientName','M19514 QA ONLY - NOT A CUSTOMER',
 'company','M19514 QA ONLY',
 'industry','Internal QA',
 'status','Working on it',
 'poDate','2026-10-20',
 'dateReceived','2026-10-20',
 'deliveryDate','2026-10-20',
 'currency','PHP',
 'poAmount',112.00,
 'vatRate',12.0,
 'procurementExpenses',40.00,
 'accountManager','QA ONLY',
 'buyerInCharge','QA ONLY',
 'endUserInCharge','QA ONLY',
 'notes','M195.14 explicitly approved production QA; never treat as a business order.'
 ));
 RETURN v_created;
END; $body$;
CREATE FUNCTION public.order_intake_qa_archive_once()
RETURNS public.order_intake_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $body$
DECLARE v_actor uuid := auth.uid(); v_workspace uuid; v_order public.order_intake_orders%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor)
 OR NOT public.has_module_access('order-intake',v_actor)
 THEN RAISE EXCEPTION 'M19514_QA_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_workspace := public.current_workspace_id(v_actor);
 IF v_workspace IS NULL
 THEN RAISE EXCEPTION 'M19514_QA_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(19514,20261020);
 UPDATE public.order_intake_orders
 SET archived=true,archived_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1
 WHERE workspace_id=v_workspace AND po_number='M19514-QA-ONLY-20261020' AND archived=false
 RETURNING * INTO v_order;
 IF NOT FOUND
 THEN RAISE EXCEPTION 'M19514_QA_ARCHIVE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.order_intake_activity
 (workspace_id,order_id,po_number,type,message,actor_id)
 VALUES (v_workspace,v_order.id,v_order.po_number,'ORDER_ARCHIVED',
 'Archived approved M195.14 QA-only purchase order.',v_actor);
 RETURN v_order;
END; $body$;
REVOKE ALL ON FUNCTION public.order_intake_qa_create_once() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_intake_qa_archive_once() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_intake_qa_create_once() TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_intake_qa_archive_once() TO authenticated;
REVOKE ALL ON FUNCTION public.order_intake_create(jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.order_intake_qa_create_once() IS
'M195.14 one fixed QA PO globally, signed admin JWT, ends 2026-10-24 UTC; disable after acceptance';
COMMENT ON FUNCTION public.order_intake_qa_archive_once() IS
'M195.14 archive only reserved QA PO and preserve both audit records; disable after acceptance';
COMMIT;;
