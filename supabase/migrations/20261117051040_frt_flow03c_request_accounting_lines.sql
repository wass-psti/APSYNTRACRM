-- CP-FRT-FLOW-03C — request-scoped manual double-entry accounting.
-- Extends the canonical signed request projection; no second voucher document or counter.
BEGIN;

CREATE TABLE public.frt_request_accounting_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 fund_request_id uuid NOT NULL REFERENCES public.frt_requests(id) ON DELETE CASCADE,
 line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 100),
 account_code text NOT NULL CHECK (char_length(btrim(account_code)) BETWEEN 1 AND 80),
 account_name text NOT NULL CHECK (char_length(btrim(account_name)) BETWEEN 1 AND 180),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
 debit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
 credit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
 revision bigint NOT NULL CHECK (revision >= 1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT frt_request_accounting_lines_one_sided_amount
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)),
 CONSTRAINT frt_request_accounting_lines_position_unique
  UNIQUE (workspace_id,fund_request_id,line_number)
);

CREATE INDEX frt_request_accounting_lines_request_idx
 ON public.frt_request_accounting_lines(workspace_id,fund_request_id,revision,line_number);

ALTER TABLE public.frt_request_accounting_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_request_accounting_lines FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.frt_request_accounting_snapshot(
 p_workspace_id uuid,
 p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
 v_request public.frt_requests%ROWTYPE;
 v_revision bigint;
 v_debit numeric(14,2);
 v_credit numeric(14,2);
 v_count integer;
BEGIN
 IF auth.uid() IS NULL OR private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;
 SELECT * INTO v_request FROM public.frt_requests
  WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='42501';
 END IF;
 SELECT coalesce(max(l.revision),0),coalesce(sum(l.debit_amount),0),
        coalesce(sum(l.credit_amount),0),count(*)::integer
 INTO v_revision,v_debit,v_credit,v_count
 FROM public.frt_request_accounting_lines l
 WHERE l.workspace_id=p_workspace_id AND l.fund_request_id=p_request_id;
 RETURN jsonb_build_object(
  'revision',v_revision,
  'lines',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',l.id,'lineNumber',l.line_number,'accountCode',l.account_code,
    'accountName',l.account_name,'description',l.description,
    'debit',l.debit_amount::text,'credit',l.credit_amount::text
   ) ORDER BY l.line_number)
   FROM public.frt_request_accounting_lines l
   WHERE l.workspace_id=p_workspace_id AND l.fund_request_id=p_request_id
  ),'[]'::jsonb),
  'debitTotal',v_debit::text,
  'creditTotal',v_credit::text,
  'debitCents',(v_debit*100)::bigint,
  'creditCents',(v_credit*100)::bigint,
  'requestTotalCents',(v_request.total_amount*100)::bigint,
  'balanced',(v_count>=2 AND v_debit=v_credit AND v_debit=v_request.total_amount)
 );
END
$fn$;

CREATE OR REPLACE FUNCTION public.frt_save_request_accounting_lines(
 p_workspace_id uuid,
 p_request_id uuid,
 p_expected_revision bigint,
 p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE
 v_request public.frt_requests%ROWTYPE;
 v_revision bigint;
 v_next_revision bigint;
 v_line record;
 v_code text;
 v_name text;
 v_description text;
 v_debit_cents bigint;
 v_credit_cents bigint;
 v_total_debit bigint:=0;
 v_total_credit bigint:=0;
 v_expected_total bigint;
 v_line_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_lines IS NULL OR
    jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'Provide 2 to 100 accounting lines and a valid revision' USING errcode='22023';
 END IF;
 SELECT * INTO v_request FROM public.frt_requests
  WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL
  FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='P0002';
 END IF;
 SELECT coalesce(max(revision),0) INTO v_revision
  FROM public.frt_request_accounting_lines
  WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id;
 IF p_expected_revision<>v_revision THEN
  RAISE EXCEPTION 'Accounting entries changed. Reload the voucher before saving.'
   USING errcode='40001';
 END IF;
 v_expected_total:=(v_request.total_amount*100)::bigint;
 FOR v_line IN
  SELECT value,ordinality FROM jsonb_array_elements(p_lines) WITH ORDINALITY
 LOOP
  IF jsonb_typeof(v_line.value)<>'object' THEN
   RAISE EXCEPTION 'Accounting line % is invalid',v_line.ordinality USING errcode='22023';
  END IF;
  v_code:=nullif(btrim(v_line.value->>'accountCode'),'');
  v_name:=nullif(btrim(v_line.value->>'accountName'),'');
  v_description:=coalesce(v_line.value->>'description','');
  IF v_code IS NULL OR char_length(v_code)>80 OR v_name IS NULL OR char_length(v_name)>180 OR
     char_length(v_description)>500 THEN
   RAISE EXCEPTION 'Accounting line % requires an account code and name; descriptions are limited to 500 characters',v_line.ordinality
    USING errcode='22023';
  END IF;
  IF coalesce(v_line.value->>'debitCents','') !~ '^[0-9]{1,14}$' OR
     coalesce(v_line.value->>'creditCents','') !~ '^[0-9]{1,14}$' THEN
   RAISE EXCEPTION 'Accounting line % must use non-negative integer cents',v_line.ordinality
    USING errcode='22023';
  END IF;
  v_debit_cents:=(v_line.value->>'debitCents')::bigint;
  v_credit_cents:=(v_line.value->>'creditCents')::bigint;
  IF (v_debit_cents>0)=(v_credit_cents>0) THEN
   RAISE EXCEPTION 'Accounting line % must contain a positive debit OR a positive credit, not both',v_line.ordinality
    USING errcode='22023';
  END IF;
  v_total_debit:=v_total_debit+v_debit_cents;
  v_total_credit:=v_total_credit+v_credit_cents;
  v_line_count:=v_line_count+1;
 END LOOP;
 IF v_total_debit<>v_total_credit OR v_total_debit<>v_expected_total THEN
  RAISE EXCEPTION 'Accounting is not balanced: debit %, credit %, request % cents',
   v_total_debit,v_total_credit,v_expected_total USING errcode='22023';
 END IF;
 v_next_revision:=v_revision+1;
 DELETE FROM public.frt_request_accounting_lines
  WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id;
 FOR v_line IN
  SELECT value,ordinality FROM jsonb_array_elements(p_lines) WITH ORDINALITY
 LOOP
  INSERT INTO public.frt_request_accounting_lines(
   workspace_id,fund_request_id,line_number,account_code,account_name,description,
   debit_amount,credit_amount,revision
  ) VALUES (
   p_workspace_id,p_request_id,v_line.ordinality,
   btrim(v_line.value->>'accountCode'),btrim(v_line.value->>'accountName'),
   coalesce(v_line.value->>'description',''),
   (v_line.value->>'debitCents')::bigint::numeric/100,
   (v_line.value->>'creditCents')::bigint::numeric/100,
   v_next_revision
  );
 END LOOP;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'ACCOUNTING_LINES_SAVED',
  jsonb_build_object('revision',v_next_revision,'lineCount',v_line_count,
   'debitCents',v_total_debit,'creditCents',v_total_credit));
 RETURN public.frt_request_accounting_snapshot(p_workspace_id,p_request_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.frt_request_accounting_snapshot(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.frt_request_accounting_snapshot(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.frt_save_request_accounting_lines(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.frt_save_request_accounting_lines(uuid,uuid,bigint,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.frt_restricted_request_detail(
 p_workspace_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE r record; v_role text; v_actions jsonb;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF v_role IS NULL OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;

 SELECT fr.id,fr.workspace_id,fc.code company_code,fc.name company_name,
 fc.registered_address company_address,fc.contact_phone company_phone,
 fc.contact_email company_email,fc.logo_path company_logo_path,
 fr.voucher_no,fr.title,fr.status,fr.liquidation_status,
 to_char(fr.date_needed,'YYYY-MM-DD') date_needed,
 fr.finance_approved_at,fr.transfer_confirmed_at,fr.closed_at,fr.archived_at,
 fr.requestor_id,fr.department,fr.fund_source,fr.recipient_name,fr.recipient_bank,
 fr.description,fr.order_intake_no,fr.check_no,fr.total_amount,fr.created_at,
 fr.finance_approved_by,fr.transfer_confirmed_by,fr.transfer_reference,
 prepared.display_name prepared_by,
 finance_approver.display_name finance_approver_name,
 general_manager.display_name general_manager_name
 INTO r
 FROM public.frt_requests fr
 JOIN public.frt_companies fc ON fc.id=fr.company_id
  AND fc.workspace_id=fr.workspace_id
 LEFT JOIN public.frt_memberships prepared
  ON prepared.workspace_id=fr.workspace_id AND prepared.user_id=fr.requestor_id
 LEFT JOIN public.frt_memberships finance_approver
  ON finance_approver.workspace_id=fr.workspace_id
  AND finance_approver.user_id=fr.finance_approved_by
 LEFT JOIN public.frt_memberships general_manager
  ON general_manager.workspace_id=fr.workspace_id
  AND general_manager.user_id=fr.transfer_confirmed_by
 WHERE fr.workspace_id=p_workspace_id AND fr.id=p_request_id
  AND fr.archived_at IS NULL;

 IF NOT FOUND THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='42501';
 END IF;

 v_actions:=(
  SELECT jsonb_agg(jsonb_build_object(
   'code',a.code,'eligible',a.eligible,
   'authority','SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY'
  ) ORDER BY a.ord)
  FROM (VALUES
   (1,'approve',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.status='PENDING_APPROVAL')),
   (2,'approve/revoke',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='NOT_SUBMITTED')),
   (3,'reject',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.status='PENDING_APPROVAL')),
   (4,'transfer',(v_role='GENERAL_MANAGER' AND r.finance_approved_at IS NOT NULL AND r.transfer_confirmed_at IS NULL AND r.status NOT IN ('CLOSED','REJECTED'))),
   (5,'transfer/revoke',(v_role='GENERAL_MANAGER' AND r.transfer_confirmed_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED'))),
   (6,'close',(v_role IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='APPROVED')),
   (7,'archive',(v_role='GENERAL_MANAGER' AND r.archived_at IS NULL)),
   (8,'liquidation/approve',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='SUBMITTED'))
  ) AS a(ord,code,eligible)
 );

 RETURN jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'company_code',r.company_code,
  'voucher_no',r.voucher_no,'title',r.title,'status',r.status,
  'liquidation_status',r.liquidation_status,'date_needed',r.date_needed,
  'finance_approved_at',r.finance_approved_at,
  'transfer_confirmed_at',r.transfer_confirmed_at,
  'closed_at',r.closed_at,'archived_at',r.archived_at,
  'workflow',v_actions,
  'voucher',jsonb_build_object(
   'workspaceId',r.workspace_id,
   'requestId',r.id,
   'company',jsonb_build_object(
    'code',r.company_code,
    'name',r.company_name,
    'address',r.company_address,
    'phone',r.company_phone,
    'email',r.company_email,
    'logoPath',r.company_logo_path
   ),
   'voucherNumber',r.voucher_no,
   'voucherDate',r.created_at,
   'requestReference',jsonb_build_object(
    'orderIntakeNo',r.order_intake_no,
    'checkNo',r.check_no
   ),
   'title',r.title,
   'department',r.department,
   'fundSource',r.fund_source,
   'payee',r.recipient_name,
   'payeeBank',r.recipient_bank,
   'dateNeeded',r.date_needed,
   'description',r.description,
   'totalAmount',r.total_amount::text,
   'requestStatus',r.status,
   'liquidationStatus',r.liquidation_status,
   'preparedBy',r.prepared_by,
   'preparedAt',r.created_at,
   'financeApproval',jsonb_build_object(
    'approvedBy',r.finance_approver_name,
    'approvedAt',r.finance_approved_at
   ),
   'gmVerification',jsonb_build_object(
    'verifiedBy',r.general_manager_name,
    'verifiedAt',r.transfer_confirmed_at,
    'reference',r.transfer_reference
   ),
   'items',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
     'category',i.category,
     'description',i.notes,
     'amount',i.amount::text,
     'createdAt',i.created_at
    ) ORDER BY i.created_at,i.id)
    FROM public.frt_request_items AS i
    WHERE i.workspace_id=r.workspace_id
     AND i.fund_request_id=r.id
   ),'[]'::jsonb),
   'itemsTotal',coalesce((
    SELECT sum(i.amount)
    FROM public.frt_request_items AS i
    WHERE i.workspace_id=r.workspace_id
     AND i.fund_request_id=r.id
   ),0)::text,
   'reconciled',coalesce((
    SELECT sum(i.amount)
    FROM public.frt_request_items AS i
    WHERE i.workspace_id=r.workspace_id
     AND i.fund_request_id=r.id
   ),0)=r.total_amount
   , 'accounting', public.frt_request_accounting_snapshot(p_workspace_id,r.id)
  )
 );
END $fn$;

COMMIT;
