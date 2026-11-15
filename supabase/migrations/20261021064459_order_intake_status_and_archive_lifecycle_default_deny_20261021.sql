
CREATE OR REPLACE FUNCTION public.order_intake_update_status(p_id uuid,p_status text,p_expected_revision integer)
RETURNS public.order_intake_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_status IS NULL
 OR p_status NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged',
 'Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived',
 'Receiving Report','Delivered','Collected','Closed','Cancelled')
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_STATUS' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders
 WHERE id=p_id AND workspace_id=w AND archived=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF old_order.status IN ('Closed','Cancelled') AND p_status IS DISTINCT FROM old_order.status
 THEN RAISE EXCEPTION 'ORDER_INTAKE_TERMINAL_STATUS' USING ERRCODE='22023'; END IF;
 IF old_order.status=p_status THEN RETURN old_order; END IF;
 UPDATE public.order_intake_orders o SET status=p_status,revision=o.revision+1,
 status_updated_at=transaction_timestamp(),updated_at=transaction_timestamp()
 WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,actor_user_id,action,details)
 VALUES(w,p_id,u,'STATUS_UPDATED',
 jsonb_build_object('before',old_order.status,'after',p_status,'revision',new_order.revision));
 RETURN new_order;
END $$;
REVOKE ALL ON FUNCTION public.order_intake_update_status(uuid,text,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.order_intake_archive(p_id uuid,p_expected_revision integer)
RETURNS public.order_intake_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders WHERE id=p_id AND workspace_id=w AND archived=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.order_intake_orders o SET archived=true,archived_at=transaction_timestamp(),revision=o.revision+1,
 updated_at=transaction_timestamp() WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,actor_user_id,action,details)
 VALUES(w,p_id,u,'ARCHIVED',jsonb_build_object('revision',new_order.revision,'previousStatus',old_order.status));
 RETURN new_order;
END $$;
REVOKE ALL ON FUNCTION public.order_intake_archive(uuid,integer) FROM PUBLIC,anon,authenticated;
;
