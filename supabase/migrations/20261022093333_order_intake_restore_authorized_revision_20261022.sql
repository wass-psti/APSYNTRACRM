CREATE OR REPLACE FUNCTION public.order_intake_restore(p_id uuid,p_expected_revision integer)
RETURNS public.order_intake_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders WHERE id=p_id AND workspace_id=w AND archived=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.order_intake_orders o SET archived=false,archived_at=NULL,revision=o.revision+1,
 updated_at=transaction_timestamp() WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,'RESTORED','Order restored (revision '||new_order.revision||')',u);
 RETURN new_order;
END $function$;
REVOKE ALL ON FUNCTION public.order_intake_restore(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.order_intake_restore(uuid,integer) TO authenticated;;
