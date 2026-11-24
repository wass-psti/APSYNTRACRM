-- CP05A candidate. No source payload updates or historical backfill.
BEGIN;
CREATE TABLE public.order_intake_legacy_lifecycle (
 order_id uuid PRIMARY KEY REFERENCES public.order_intake_legacy_orders(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 status text, archived boolean, revision integer NOT NULL CHECK(revision>=2),
 status_updated_at timestamptz, updated_at timestamptz NOT NULL
);
CREATE TABLE public.order_intake_recipient_bindings (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id), order_id uuid NOT NULL,
 record_kind text NOT NULL CHECK(record_kind IN ('native','legacy')),
 manager_label text NOT NULL, recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(workspace_id,order_id,record_kind)
);
CREATE TABLE public.order_intake_lifecycle_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 order_id uuid NOT NULL, record_kind text NOT NULL CHECK(record_kind IN ('native','legacy')),
 po_number text NOT NULL, type text NOT NULL, message text NOT NULL,
 actor_id uuid, revision integer NOT NULL, status text, delivery_state text NOT NULL
 CHECK(delivery_state IN ('NOT_REQUIRED','UNRESOLVED','INBOX_AVAILABLE')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,order_id,record_kind,revision,type)
);
CREATE INDEX oi05a_events_order ON public.order_intake_lifecycle_events(workspace_id,order_id,created_at DESC,id DESC);
CREATE TABLE public.order_intake_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES public.order_intake_lifecycle_events(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id), recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 order_id uuid NOT NULL, record_kind text NOT NULL, po_number text NOT NULL, status text NOT NULL,
 message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE INDEX oi05a_inbox_recipient ON public.order_intake_notifications(workspace_id,recipient_id,created_at DESC,id DESC);

ALTER TABLE public.order_intake_legacy_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_intake_recipient_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_intake_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_intake_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY oi05a_overlay_select ON public.order_intake_legacy_lifecycle FOR SELECT TO authenticated USING (
 workspace_id=(SELECT public.current_workspace_id((SELECT auth.uid()))) AND (SELECT public.has_module_access('order-intake',(SELECT auth.uid()))));
CREATE POLICY oi05a_events_select ON public.order_intake_lifecycle_events FOR SELECT TO authenticated USING (
 workspace_id=(SELECT public.current_workspace_id((SELECT auth.uid()))) AND (SELECT public.has_module_access('order-intake',(SELECT auth.uid()))));
CREATE POLICY oi05a_inbox_select ON public.order_intake_notifications FOR SELECT TO authenticated USING (
 recipient_id=(SELECT auth.uid()) AND workspace_id=(SELECT public.current_workspace_id((SELECT auth.uid())))
 AND (SELECT public.has_module_access('order-intake',(SELECT auth.uid()))));
REVOKE ALL ON public.order_intake_legacy_lifecycle,public.order_intake_recipient_bindings,public.order_intake_lifecycle_events,public.order_intake_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_intake_legacy_lifecycle,public.order_intake_lifecycle_events,public.order_intake_notifications TO authenticated;

-- Separate view leaves the currently deployed registry contract unchanged.
CREATE VIEW public.order_intake_operational_registry WITH(security_invoker=true) AS
SELECT b.id,b.workspace_id,b.record_kind,b.po_number,b.client_name,b.po_date,b.date_received,b.delivery_date,
 b.currency,b.po_amount,b.vat_rate,b.vat_exclusive_amount,b.vat_amount,b.procurement_expenses,b.gross_profit,
 b.company,b.industry,b.account_manager,b.buyer_in_charge,b.end_user_in_charge,b.notes,
 CASE WHEN o.order_id IS NOT NULL THEN o.status ELSE b.status END AS status,b.fiscal_year,
 CASE WHEN o.order_id IS NOT NULL THEN o.archived ELSE b.archived END AS archived,
 CASE WHEN b.record_kind='legacy' THEN coalesce(o.revision,1) ELSE b.revision END AS revision,
 CASE WHEN b.record_kind='legacy' THEN o.status_updated_at ELSE b.status_updated_at END AS status_updated_at,
 CASE WHEN b.record_kind='legacy' THEN o.updated_at ELSE b.updated_at END AS updated_at,
 b.source_key,b.source_item_id,b.source_locator,b.source_group,b.financial_basis,b.historical_client_name,
 b.po_file_reference,b.confirmation_reference,
 CASE WHEN b.record_kind='legacy' THEN b.status END AS source_status,
 CASE WHEN b.record_kind='legacy' THEN b.archived END AS source_archive_state
FROM public.order_intake_registry b LEFT JOIN public.order_intake_legacy_lifecycle o
 ON b.record_kind='legacy' AND o.order_id=b.id AND o.workspace_id=b.workspace_id;
REVOKE ALL ON public.order_intake_operational_registry FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_intake_operational_registry TO authenticated;

-- Reuse exactly the existing native mutation authorization contract.
CREATE FUNCTION public.oi05a_mutation_workspace() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid(); w uuid;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w AND m.user_id=u AND m.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.oi05a_mutation_workspace() FROM PUBLIC,anon,authenticated;

-- Explicit binding, not name guessing. Only active members in the order workspace.
CREATE FUNCTION public.order_intake_recipient_options(p_id uuid,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE w uuid:=public.oi05a_mutation_workspace(); r public.order_intake_operational_registry%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.order_intake_operational_registry WHERE id=p_id AND workspace_id=w AND record_kind=p_kind;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('manager',r.account_manager,'recipientId',(
 SELECT recipient_id FROM public.order_intake_recipient_bindings WHERE workspace_id=w AND order_id=p_id AND record_kind=p_kind AND manager_label=coalesce(r.account_manager,'')),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'email',p.email) ORDER BY p.display_name,p.id)
 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.workspace_id=w AND m.active AND p.status='active'),'[]'::jsonb));
END $$;
CREATE FUNCTION public.order_intake_bind_recipient(p_id uuid,p_kind text,p_recipient uuid,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE w uuid:=public.oi05a_mutation_workspace(); r public.order_intake_operational_registry%ROWTYPE;
BEGIN
 IF p_kind='legacy' THEN
  PERFORM 1 FROM public.order_intake_legacy_orders WHERE id=p_id AND workspace_id=w FOR UPDATE;
 ELSIF p_kind='native' THEN
  PERFORM 1 FROM public.order_intake_orders WHERE id=p_id AND workspace_id=w FOR UPDATE;
 ELSE RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.order_intake_operational_registry WHERE id=p_id AND workspace_id=w AND record_kind=p_kind;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND'; END IF;
 IF p_expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF p_recipient IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.workspace_id=w AND m.active AND p.status='active' AND p.id=p_recipient)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_RECIPIENT' USING ERRCODE='22023'; END IF;
 INSERT INTO public.order_intake_recipient_bindings VALUES(w,p_id,p_kind,coalesce(r.account_manager,''),p_recipient)
 ON CONFLICT(workspace_id,order_id,record_kind) DO UPDATE SET manager_label=excluded.manager_label,recipient_id=excluded.recipient_id;
 RETURN jsonb_build_object('recipientId',p_recipient,'orderId',p_id);
END $$;

-- Same transaction as the lifecycle mutation. Missing or stale bindings never guess.
CREATE FUNCTION public.oi05a_record_event(w uuid,oid uuid,kind text,po text,manager text,rev integer,event_type text,detail text,new_status text,notify boolean)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE recipient uuid; event_id uuid; delivery text:='NOT_REQUIRED';
BEGIN
 IF notify THEN
  SELECT b.recipient_id INTO recipient FROM public.order_intake_recipient_bindings b
  JOIN public.workspace_members m ON m.workspace_id=b.workspace_id AND m.user_id=b.recipient_id AND m.active
  JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
  WHERE b.workspace_id=w AND b.order_id=oid AND b.record_kind=kind AND b.manager_label=coalesce(manager,'');
  delivery:=CASE WHEN recipient IS NULL THEN 'UNRESOLVED' ELSE 'INBOX_AVAILABLE' END;
 END IF;
 INSERT INTO public.order_intake_lifecycle_events(workspace_id,order_id,record_kind,po_number,type,message,actor_id,revision,status,delivery_state)
 VALUES(w,oid,kind,po,event_type,detail,auth.uid(),rev,new_status,delivery)
 RETURNING id INTO event_id;
 IF recipient IS NOT NULL THEN
  INSERT INTO public.order_intake_notifications(event_id,workspace_id,recipient_id,order_id,record_kind,po_number,status,message)
  VALUES(event_id,w,recipient,oid,kind,po,new_status,'Purchase order '||po||' is now '||new_status||'. Review the order in Order Intake.');
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.oi05a_record_event(uuid,uuid,text,text,text,integer,text,text,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.order_intake_legacy_change(p_id uuid,p_expected_revision integer,p_action text,p_status text DEFAULT NULL)
RETURNS public.order_intake_operational_registry LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE w uuid:=public.oi05a_mutation_workspace(); r public.order_intake_operational_registry%ROWTYPE;
 next_status text; next_archived boolean; changed_at timestamptz; event_type text; detail text;
BEGIN
 -- Lock the source identity, not its contents, to serialize the first overlay write.
 PERFORM 1 FROM public.order_intake_legacy_orders WHERE id=p_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO r FROM public.order_intake_operational_registry WHERE id=p_id AND workspace_id=w AND record_kind='legacy';
 IF p_expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 next_status:=r.status; next_archived:=r.archived; changed_at:=r.status_updated_at;
 IF p_action='status' AND r.archived IS DISTINCT FROM true THEN
  IF p_status IS NULL OR p_status NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged','Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived','Receiving Report','Delivered','Collected','Closed','Cancelled')
  THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_STATUS' USING ERRCODE='22023'; END IF;
  IF r.status IN ('Closed','Cancelled') AND p_status IS DISTINCT FROM r.status THEN RAISE EXCEPTION 'ORDER_INTAKE_TERMINAL_STATUS' USING ERRCODE='22023'; END IF;
  IF p_status IS NOT DISTINCT FROM r.status THEN RETURN r; END IF;
  next_status:=p_status; changed_at:=transaction_timestamp(); event_type:='STATUS_UPDATED';
  detail:='Status changed from '||coalesce(r.status,'Unknown')||' to '||p_status;
 ELSIF p_action='archive' AND r.archived IS DISTINCT FROM true THEN
  next_archived:=true; event_type:='ARCHIVED'; detail:='Historical order archived';
 ELSIF p_action='restore' AND r.archived IS TRUE THEN
  next_archived:=false; event_type:='RESTORED'; detail:='Historical order restored';
 ELSE RAISE EXCEPTION 'ORDER_INTAKE_INVALID_LIFECYCLE_ACTION' USING ERRCODE='22023'; END IF;
 INSERT INTO public.order_intake_legacy_lifecycle(order_id,workspace_id,status,archived,revision,status_updated_at,updated_at)
 VALUES(p_id,w,next_status,next_archived,r.revision+1,changed_at,transaction_timestamp())
 ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,archived=excluded.archived,revision=excluded.revision,status_updated_at=excluded.status_updated_at,updated_at=excluded.updated_at;
 PERFORM public.oi05a_record_event(w,p_id,'legacy',r.po_number,r.account_manager,r.revision+1,event_type,detail,next_status,
 event_type='STATUS_UPDATED' AND next_status IN ('Delayed','Delivered','Collected'));
 SELECT * INTO r FROM public.order_intake_operational_registry WHERE id=p_id AND workspace_id=w AND record_kind='legacy';
 RETURN r;
END $$;

-- Native status changes from either the workflow or the existing details editor.
CREATE FUNCTION public.oi05a_native_status_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Delayed','Delivered','Collected') THEN
  PERFORM public.oi05a_record_event(NEW.workspace_id,NEW.id,'native',NEW.po_number,NEW.account_manager,NEW.revision,'STATUS_NOTIFICATION',
    'Status changed from '||OLD.status||' to '||NEW.status,NEW.status,true);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.oi05a_native_status_notification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER oi05a_native_status_notification AFTER UPDATE OF status ON public.order_intake_orders FOR EACH ROW EXECUTE FUNCTION public.oi05a_native_status_notification();

CREATE FUNCTION public.order_intake_notification_read(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid(); w uuid:=public.current_workspace_id(u); r public.order_intake_notifications%ROWTYPE;
BEGIN
 IF u IS NULL OR NOT public.has_module_access('order-intake',u) THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.order_intake_notifications SET read_at=coalesce(read_at,transaction_timestamp())
 WHERE id=p_id AND workspace_id=w AND recipient_id=u RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOTIFICATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',r.id,'readAt',r.read_at);
END $$;

REVOKE ALL ON FUNCTION public.order_intake_recipient_options(uuid,text),public.order_intake_bind_recipient(uuid,text,uuid,integer),public.order_intake_legacy_change(uuid,integer,text,text),public.order_intake_notification_read(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_intake_recipient_options(uuid,text),public.order_intake_bind_recipient(uuid,text,uuid,integer),public.order_intake_legacy_change(uuid,integer,text,text),public.order_intake_notification_read(uuid) TO authenticated;
COMMIT;
