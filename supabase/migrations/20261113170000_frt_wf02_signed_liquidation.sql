-- CP-FRT-WF-02: additive signed, revision-bound liquidation interface.
-- Does not retire legacy RPCs or modify production rows.
BEGIN;
ALTER TABLE public.frt_liquidations
 ADD COLUMN IF NOT EXISTS submission_key uuid,
 ADD COLUMN IF NOT EXISTS submission_hash text,
 ADD COLUMN IF NOT EXISTS submission_revision timestamptz;
ALTER TABLE public.frt_liquidation_items
 ADD COLUMN IF NOT EXISTS receipt_date date;

CREATE OR REPLACE FUNCTION public.frt_liquidation_snapshot(
 p_workspace_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE v_role text; v_request public.frt_requests; v_liquidation public.frt_liquidations; v_items jsonb;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF auth.uid() IS NULL OR v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;
 SELECT * INTO v_request FROM public.frt_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
 IF v_role='REQUESTOR' AND v_request.requestor_id<>auth.uid() THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='42501';
 END IF;
 SELECT * INTO v_liquidation FROM public.frt_liquidations
 WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'description',i.description,'vendor',i.vendor,'orInvoiceNo',i.or_invoice_no,
  'receiptDate',i.receipt_date,'amount',i.amount::text
 ) ORDER BY i.created_at,i.id),'[]'::jsonb) INTO v_items
 FROM public.frt_liquidation_items i
 WHERE i.workspace_id=p_workspace_id AND i.liquidation_id=v_liquidation.id;
 RETURN jsonb_build_object(
  'requestId',v_request.id,'workspaceId',p_workspace_id,
  'status',v_request.status,'liquidationStatus',v_request.liquidation_status,
  'eligible',v_request.finance_approved_at IS NOT NULL AND
   v_request.status NOT IN ('CLOSED','REJECTED') AND
   v_request.liquidation_status<>'APPROVED',
  'requestedAmount',v_request.total_amount::text,
  'spentAmount',COALESCE(v_liquidation.total_spent,0)::text,
  'remainingAmount',(v_request.total_amount-COALESCE(v_liquidation.total_spent,0))::text,
  'reconciliationState',CASE
   WHEN v_liquidation.id IS NULL THEN 'NOT_SUBMITTED'
   WHEN v_request.total_amount=v_liquidation.total_spent THEN 'BALANCED'
   WHEN v_request.total_amount>v_liquidation.total_spent THEN 'UNLIQUIDATED'
   ELSE 'OVERAGE_RECORDED' END,
  'revision',CASE WHEN v_liquidation.id IS NULL THEN NULL ELSE v_liquidation.updated_at::text END,
  'submittedAt',v_liquidation.submitted_at,
  'notes',v_liquidation.notes,'items',v_items
 );
END $fn$;

CREATE OR REPLACE FUNCTION public.frt_submit_liquidation_v2(
 p_workspace_id uuid,p_request_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE v_role text; r public.frt_requests; l public.frt_liquidations;
 v_item jsonb; v_total numeric(14,2):=0; v_amount numeric;
 v_items jsonb; v_key uuid; v_hash text; v_revision text;
 v_new_revision timestamptz; v_date date;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF auth.uid() IS NULL OR v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;
 SELECT * INTO r FROM public.frt_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
 IF v_role='REQUESTOR' AND r.requestor_id<>auth.uid() THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='42501';
 END IF;
 IF r.finance_approved_at IS NULL OR r.status IN ('CLOSED','REJECTED')
 OR r.liquidation_status='APPROVED' THEN
  RAISE EXCEPTION 'Request not eligible for liquidation' USING errcode='23514';
 END IF;
 IF jsonb_typeof(p_payload)<>'object' OR
 jsonb_typeof(p_payload->'items')<>'array' OR
 jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 OR
 length(COALESCE(p_payload->>'notes',''))>2000 OR
 p_payload->>'submissionKey' IS NULL OR
 p_payload->>'submissionKey' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'Invalid liquidation payload' USING errcode='22023'; END IF;
 v_key:=(p_payload->>'submissionKey')::uuid;
 v_revision:=p_payload->>'expectedRevision';
 v_items:=p_payload->'items';
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  IF jsonb_typeof(v_item)<>'object' OR
   length(trim(COALESCE(v_item->>'description',''))) NOT BETWEEN 1 AND 500 OR
   length(COALESCE(v_item->>'vendor',''))>250 OR
   length(COALESCE(v_item->>'orInvoiceNo',''))>150 OR
   COALESCE(v_item->>'receiptDate','') !~ '^\d{4}-\d{2}-\d{2}$' OR
   COALESCE(v_item->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$'
  THEN RAISE EXCEPTION 'Invalid receipt item' USING errcode='22023'; END IF;
  v_date:=(v_item->>'receiptDate')::date;
  v_amount:=(v_item->>'amount')::numeric;
  IF v_amount<=0 THEN RAISE EXCEPTION 'Receipt amount must be positive' USING errcode='22023'; END IF;
  v_total:=v_total+v_amount;
 END LOOP;
 v_hash:=md5(jsonb_build_object('items',v_items,'notes',COALESCE(p_payload->>'notes',''))::text);
 SELECT * INTO l FROM public.frt_liquidations
 WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id FOR UPDATE;
 IF FOUND AND l.submission_key=v_key THEN
  IF l.submission_revision IS DISTINCT FROM l.updated_at THEN
   RAISE EXCEPTION 'Stale liquidation revision' USING errcode='40001';
  END IF;
  IF l.submission_hash<>v_hash THEN
   RAISE EXCEPTION 'Submission key reused with different content' USING errcode='23505';
  END IF;
  RETURN jsonb_build_object('ok',true,'replayed',true,'revision',l.updated_at::text,
   'spentAmount',l.total_spent::text,'remainingAmount',l.excess_or_deficit::text);
 END IF;
 IF (l.id IS NULL AND v_revision IS NOT NULL) OR
  (l.id IS NOT NULL AND (v_revision IS NULL OR v_revision<>l.updated_at::text)) THEN
  RAISE EXCEPTION 'Stale liquidation revision' USING errcode='40001';
 END IF;
 IF l.id IS NULL THEN
  INSERT INTO public.frt_liquidations(
   workspace_id,fund_request_id,submitted_by,submitted_at,notes,total_spent,
   excess_or_deficit,submission_key,submission_hash,submission_revision
  ) VALUES (p_workspace_id,p_request_id,auth.uid(),now(),
   NULLIF(p_payload->>'notes',''),v_total,r.total_amount-v_total,v_key,v_hash,now())
  RETURNING * INTO l;
 ELSE
  v_new_revision:=GREATEST(now(),l.updated_at+interval '1 microsecond');
  UPDATE public.frt_liquidations SET submitted_by=auth.uid(),submitted_at=now(),
   notes=NULLIF(p_payload->>'notes',''),total_spent=v_total,
   excess_or_deficit=r.total_amount-v_total,reviewed_by=NULL,reviewed_at=NULL,
   updated_at=v_new_revision,submission_revision=v_new_revision,
   submission_key=v_key,submission_hash=v_hash
  WHERE id=l.id RETURNING * INTO l;
  DELETE FROM public.frt_liquidation_items
  WHERE workspace_id=p_workspace_id AND liquidation_id=l.id;
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  INSERT INTO public.frt_liquidation_items(
   workspace_id,liquidation_id,description,vendor,or_invoice_no,receipt_date,amount
  ) VALUES (p_workspace_id,l.id,trim(v_item->>'description'),
   NULLIF(v_item->>'vendor',''),NULLIF(v_item->>'orInvoiceNo',''),
   (v_item->>'receiptDate')::date,(v_item->>'amount')::numeric);
 END LOOP;
 UPDATE public.frt_requests SET liquidation_status='SUBMITTED',updated_at=now()
 WHERE workspace_id=p_workspace_id AND id=p_request_id;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'LIQUIDATION_SUBMITTED',
 jsonb_build_object('total',v_total,'receiptCount',jsonb_array_length(v_items)));
 RETURN jsonb_build_object('ok',true,'replayed',false,'revision',l.updated_at::text,
  'spentAmount',v_total::text,'remainingAmount',(r.total_amount-v_total)::text);
END $fn$;
REVOKE ALL ON FUNCTION public.frt_liquidation_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_liquidation_snapshot(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.frt_submit_liquidation_v2(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_submit_liquidation_v2(uuid,uuid,jsonb) TO authenticated;
COMMIT;
