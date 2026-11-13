-- CP-FRT-IC-01: additive bilateral intercompany obligations and settlement ledger.
-- Reuses existing signed FRT membership and finance-role resolvers. No role, permission,
-- existing FRT record, or existing financial workflow is changed.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regprocedure('private.frt_has_role(uuid,text[])') IS NULL OR
    to_regclass('public.frt_companies') IS NULL OR
    to_regclass('public.frt_audit_logs') IS NULL OR
    to_regclass('public.workspaces') IS NULL THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 authoritative FRT dependencies absent'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE TABLE public.frt_ic_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 creditor_company_id uuid NOT NULL REFERENCES public.frt_companies(id) ON DELETE RESTRICT,
 debtor_company_id uuid NOT NULL REFERENCES public.frt_companies(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('RECEIVABLE','LOAN')),
 reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 2 AND 80),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
 principal_amount numeric(18,2) NOT NULL CHECK (principal_amount > 0),
 issued_on date NOT NULL,
 due_on date,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT frt_ic_obligations_distinct_companies
  CHECK (creditor_company_id <> debtor_company_id),
 CONSTRAINT frt_ic_obligations_due_after_issue
  CHECK (due_on IS NULL OR due_on >= issued_on),
 CONSTRAINT frt_ic_loans_require_maturity
  CHECK (kind <> 'LOAN' OR due_on IS NOT NULL),
 CONSTRAINT frt_ic_obligations_workspace_id_id_key UNIQUE (workspace_id,id),
 CONSTRAINT frt_ic_obligations_workspace_reference_key UNIQUE (workspace_id,reference)
);

CREATE TABLE public.frt_ic_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 obligation_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK (amount > 0),
 settled_on date NOT NULL,
 reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 2 AND 80),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT frt_ic_settlements_obligation_workspace_fkey
  FOREIGN KEY (workspace_id,obligation_id)
  REFERENCES public.frt_ic_obligations(workspace_id,id) ON DELETE RESTRICT,
 CONSTRAINT frt_ic_settlements_workspace_reference_key UNIQUE (workspace_id,reference)
);

CREATE INDEX frt_ic_obligations_creditor_debtor_idx
 ON public.frt_ic_obligations(workspace_id,creditor_company_id,debtor_company_id,issued_on DESC);
CREATE INDEX frt_ic_obligations_maturity_idx
 ON public.frt_ic_obligations(workspace_id,due_on) WHERE due_on IS NOT NULL;
CREATE INDEX frt_ic_settlements_obligation_date_idx
 ON public.frt_ic_settlements(workspace_id,obligation_id,settled_on DESC);

-- RPC-only access, following the existing FRT private-table pattern.
ALTER TABLE public.frt_ic_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frt_ic_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_ic_obligations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.frt_ic_settlements FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.frt_ic_snapshot_impl(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_role text;
 v_companies jsonb;
 v_entities jsonb;
 v_receivables jsonb;
 v_payables jsonb;
 v_summary jsonb;
 v_total_receivables numeric;
 v_total_payables numeric;
 v_obligations jsonb;
 v_loans jsonb;
 v_as_of date := CURRENT_DATE;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'code',c.code,'name',c.name
  ) ORDER BY c.display_order),'[]'::jsonb)
 INTO v_companies
 FROM public.frt_companies c
 WHERE c.workspace_id=p_workspace_id;

 WITH balances AS (
  SELECT o.*,
   st.settled_amount,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'company_code',c.code,
   'company_name',c.name,
   'receivables',coalesce(r.amount,0)::text,
   'payables',coalesce(p.amount,0)::text,
   'net_position',(coalesce(r.amount,0)-coalesce(p.amount,0))::text
  ) ORDER BY c.display_order),'[]'::jsonb)
 INTO v_entities
 FROM public.frt_companies c
 LEFT JOIN LATERAL (
  SELECT sum(b.outstanding_amount) AS amount FROM balances b
  WHERE b.creditor_company_id=c.id AND b.outstanding_amount>0
 ) r ON true
 LEFT JOIN LATERAL (
  SELECT sum(b.outstanding_amount) AS amount FROM balances b
  WHERE b.debtor_company_id=c.id AND b.outstanding_amount>0
 ) p ON true
 WHERE c.workspace_id=p_workspace_id;

 WITH balances AS (
  SELECT o.creditor_company_id,o.debtor_company_id,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id
 ), pairs AS (
  SELECT creditor_company_id,debtor_company_id,sum(outstanding_amount) AS amount
  FROM balances WHERE outstanding_amount>0
  GROUP BY creditor_company_id,debtor_company_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'row_company_code',creditor.code,
   'column_company_code',debtor.code,
   'amount',coalesce(p.amount,0)::text
  ) ORDER BY creditor.display_order,debtor.display_order),'[]'::jsonb)
 INTO v_receivables
 FROM public.frt_companies creditor
 CROSS JOIN public.frt_companies debtor
 LEFT JOIN pairs p ON p.creditor_company_id=creditor.id AND p.debtor_company_id=debtor.id
 WHERE creditor.workspace_id=p_workspace_id AND debtor.workspace_id=p_workspace_id;

 WITH balances AS (
  SELECT o.creditor_company_id,o.debtor_company_id,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id
 ), pairs AS (
  SELECT creditor_company_id,debtor_company_id,sum(outstanding_amount) AS amount
  FROM balances WHERE outstanding_amount>0
  GROUP BY creditor_company_id,debtor_company_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'row_company_code',debtor.code,
   'column_company_code',creditor.code,
   'amount',coalesce(p.amount,0)::text
  ) ORDER BY debtor.display_order,creditor.display_order),'[]'::jsonb)
 INTO v_payables
 FROM public.frt_companies debtor
 CROSS JOIN public.frt_companies creditor
 LEFT JOIN pairs p ON p.debtor_company_id=debtor.id AND p.creditor_company_id=creditor.id
 WHERE debtor.workspace_id=p_workspace_id AND creditor.workspace_id=p_workspace_id;

 SELECT coalesce(sum(greatest(o.principal_amount-st.settled_amount,0)),0)::numeric
 INTO v_total_receivables
 FROM public.frt_ic_obligations o
 LEFT JOIN LATERAL (
  SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
  FROM public.frt_ic_settlements s
  WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
 ) st ON true
 WHERE o.workspace_id=p_workspace_id;
 -- Every obligation posts both sides from one immutable source record.
 v_total_payables := v_total_receivables;

 WITH balances AS (
  SELECT o.*,
   st.settled_amount,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id
 ), pairs AS (
  SELECT creditor_company_id,debtor_company_id,sum(outstanding_amount) AS amount
  FROM balances WHERE outstanding_amount>0
  GROUP BY creditor_company_id,debtor_company_id
 )
 SELECT jsonb_build_object(
  'total_receivables',v_total_receivables::text,
  'total_payables',v_total_payables::text,
  'net_intercompany_position',(v_total_receivables-v_total_payables)::text,
  'active_obligation_count',(SELECT count(*)::integer FROM balances WHERE outstanding_amount>0),
  'active_loan_count',(SELECT count(*)::integer FROM balances WHERE kind='LOAN' AND outstanding_amount>0),
  'active_loan_balance',(SELECT coalesce(sum(outstanding_amount),0)::text FROM balances WHERE kind='LOAN'),
  'overdue_count',(SELECT count(*)::integer FROM balances WHERE outstanding_amount>0 AND due_on<v_as_of),
  'due_soon_count',(SELECT count(*)::integer FROM balances WHERE outstanding_amount>0 AND due_on BETWEEN v_as_of AND v_as_of+30),
  'high_exposure_pair_count',(SELECT count(*)::integer FROM pairs WHERE amount>=500000.00),
  'exposure_threshold','500000.00',
  'ledger_balanced',(v_total_receivables=v_total_payables),
  'ledger_balance_basis','BILATERAL_SINGLE_SOURCE'
 ) INTO v_summary;

 WITH balances AS (
  SELECT o.*,
   st.settled_amount,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.issued_on DESC,x.created_at DESC),'[]'::jsonb)
 INTO v_obligations
 FROM (
  SELECT o.id,o.reference,o.kind,creditor.code AS creditor_code,debtor.code AS debtor_code,
   o.description,o.principal_amount::text AS principal_amount,
   o.settled_amount::text AS settled_amount,o.outstanding_amount::text AS outstanding_amount,
   o.issued_on::text AS issued_on,o.due_on::text AS due_on,o.created_at::text AS created_at,
   CASE WHEN o.outstanding_amount=0 THEN 'SETTLED'
        WHEN o.due_on<v_as_of THEN 'OVERDUE'
        WHEN o.due_on BETWEEN v_as_of AND v_as_of+30 THEN 'DUE_SOON'
        WHEN o.due_on IS NULL THEN 'NO_MATURITY'
        ELSE 'CURRENT' END AS risk_status
  FROM balances o
  JOIN public.frt_companies creditor ON creditor.id=o.creditor_company_id
   AND creditor.workspace_id=p_workspace_id
  JOIN public.frt_companies debtor ON debtor.id=o.debtor_company_id
   AND debtor.workspace_id=p_workspace_id
  ORDER BY o.issued_on DESC,o.created_at DESC
  LIMIT 100
 ) x;

 WITH balances AS (
  SELECT o.*,
   st.settled_amount,
   greatest(o.principal_amount-st.settled_amount,0)::numeric(18,2) AS outstanding_amount
  FROM public.frt_ic_obligations o
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(s.amount),0)::numeric(18,2) AS settled_amount
   FROM public.frt_ic_settlements s
   WHERE s.workspace_id=o.workspace_id AND s.obligation_id=o.id
  ) st ON true
  WHERE o.workspace_id=p_workspace_id AND o.kind='LOAN'
   AND o.principal_amount>st.settled_amount
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.maturity_date ASC,x.issue_date DESC),'[]'::jsonb)
 INTO v_loans
 FROM (
  SELECT o.id,o.reference,creditor.code AS lender_code,debtor.code AS borrower_code,
   o.principal_amount::text AS original_amount,o.settled_amount::text AS settled_amount,
   o.outstanding_amount::text AS outstanding_balance,o.issued_on::text AS issue_date,
   o.due_on::text AS maturity_date,(v_as_of-o.issued_on)::integer AS days_outstanding,
   (o.due_on-v_as_of)::integer AS days_to_maturity,
   CASE WHEN o.outstanding_amount=0 THEN 'SETTLED'
        WHEN o.due_on<v_as_of THEN 'OVERDUE'
        WHEN o.due_on<=v_as_of+30 THEN 'DUE_SOON'
        ELSE 'CURRENT' END AS risk_status
  FROM balances o
  JOIN public.frt_companies creditor ON creditor.id=o.creditor_company_id
   AND creditor.workspace_id=p_workspace_id
  JOIN public.frt_companies debtor ON debtor.id=o.debtor_company_id
   AND debtor.workspace_id=p_workspace_id
  ORDER BY o.due_on ASC,o.issued_on DESC
  LIMIT 100
 ) x;

 RETURN jsonb_build_object(
  'workspace_id',p_workspace_id,
  'as_of_date',v_as_of::text,
  'companies',v_companies,
  'entities',v_entities,
  'receivables_matrix',v_receivables,
  'payables_matrix',v_payables,
  'summary',v_summary,
  'obligations',v_obligations,
  'loans',v_loans,
  'disclosure','Receivables and payables are opposite sides of the same recorded obligation. Internal balance is not external counterparty confirmation.'
 );
END;
$fn$;

CREATE FUNCTION private.frt_ic_create_obligation_impl(p_workspace_id uuid,p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_creditor uuid;
 v_debtor uuid;
 v_kind text;
 v_reference text;
 v_description text;
 v_amount numeric(18,2);
 v_issued_on date;
 v_due_on date;
 v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(
  p_workspace_id,'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'
 ) THEN
  RAISE EXCEPTION 'FRT finance access required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid intercompany obligation payload' USING ERRCODE='22023';
 END IF;

 v_kind := upper(coalesce(p_payload->>'kind',''));
 v_reference := btrim(coalesce(p_payload->>'reference',''));
 v_description := btrim(coalesce(p_payload->>'description',''));
 IF v_kind NOT IN ('RECEIVABLE','LOAN') OR char_length(v_reference) NOT BETWEEN 2 AND 80
    OR char_length(v_description)>500 THEN
  RAISE EXCEPTION 'Invalid intercompany obligation details' USING ERRCODE='22023';
 END IF;
 IF coalesce(p_payload->>'amount','') !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' THEN
  RAISE EXCEPTION 'Amount must be a positive value with up to two decimal places' USING ERRCODE='22023';
 END IF;
 v_amount := (p_payload->>'amount')::numeric(18,2);
 IF v_amount<=0 THEN
  RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE='22023';
 END IF;
 IF coalesce(p_payload->>'issuedOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'A valid issue date is required' USING ERRCODE='22023';
 END IF;
 v_issued_on := (p_payload->>'issuedOn')::date;
 IF v_issued_on>CURRENT_DATE THEN
  RAISE EXCEPTION 'Issue date cannot be in the future' USING ERRCODE='22023';
 END IF;
 IF nullif(p_payload->>'dueOn','') IS NOT NULL THEN
  IF (p_payload->>'dueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION 'A valid maturity date is required' USING ERRCODE='22023';
  END IF;
  v_due_on := (p_payload->>'dueOn')::date;
 END IF;
 IF v_kind='LOAN' AND v_due_on IS NULL THEN
  RAISE EXCEPTION 'Loan maturity date is required' USING ERRCODE='22023';
 END IF;
 IF v_due_on IS NOT NULL AND v_due_on<v_issued_on THEN
  RAISE EXCEPTION 'Maturity date cannot precede the issue date' USING ERRCODE='22023';
 END IF;

 SELECT c.id INTO v_creditor
 FROM public.frt_companies c
 WHERE c.workspace_id=p_workspace_id AND c.code=p_payload->>'creditorCode';
 SELECT c.id INTO v_debtor
 FROM public.frt_companies c
 WHERE c.workspace_id=p_workspace_id AND c.code=p_payload->>'debtorCode';
 IF v_creditor IS NULL OR v_debtor IS NULL OR v_creditor=v_debtor THEN
  RAISE EXCEPTION 'Choose two different companies in this FRT workspace' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.frt_ic_obligations(
  workspace_id,creditor_company_id,debtor_company_id,kind,reference,
  description,principal_amount,issued_on,due_on,created_by
 ) VALUES (
  p_workspace_id,v_creditor,v_debtor,v_kind,v_reference,
  v_description,v_amount,v_issued_on,v_due_on,auth.uid()
 ) RETURNING id INTO v_id;

 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,NULL,auth.uid(),'FRT_IC_OBLIGATION_CREATED',
  jsonb_build_object('obligation_id',v_id,'reference',v_reference,'kind',v_kind,
   'creditor_company_id',v_creditor,'debtor_company_id',v_debtor,
   'principal_amount',v_amount::text,'issued_on',v_issued_on::text,'due_on',v_due_on::text));

 RETURN jsonb_build_object('ok',true,'id',v_id,'reference',v_reference);
END;
$fn$;

CREATE FUNCTION private.frt_ic_record_settlement_impl(
 p_workspace_id uuid,p_obligation_id uuid,p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_obligation public.frt_ic_obligations;
 v_amount numeric(18,2);
 v_settled numeric(18,2);
 v_remaining numeric(18,2);
 v_settled_on date;
 v_reference text;
 v_notes text;
 v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(
  p_workspace_id,'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'
 ) THEN
  RAISE EXCEPTION 'FRT finance access required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_obligation_id IS NULL THEN
  RAISE EXCEPTION 'Invalid settlement payload' USING ERRCODE='22023';
 END IF;

 SELECT o.* INTO v_obligation
 FROM public.frt_ic_obligations o
 WHERE o.workspace_id=p_workspace_id AND o.id=p_obligation_id
 FOR UPDATE;
 IF v_obligation.id IS NULL THEN
  RAISE EXCEPTION 'Intercompany obligation not found' USING ERRCODE='P0002';
 END IF;

 IF coalesce(p_payload->>'amount','') !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' THEN
  RAISE EXCEPTION 'Settlement amount must be positive with up to two decimal places' USING ERRCODE='22023';
 END IF;
 v_amount := (p_payload->>'amount')::numeric(18,2);
 IF v_amount<=0 THEN
  RAISE EXCEPTION 'Settlement amount must be greater than zero' USING ERRCODE='22023';
 END IF;
 v_reference := btrim(coalesce(p_payload->>'reference',''));
 v_notes := btrim(coalesce(p_payload->>'notes',''));
 IF char_length(v_reference) NOT BETWEEN 2 AND 80 OR char_length(v_notes)>500 THEN
  RAISE EXCEPTION 'Invalid settlement reference or notes' USING ERRCODE='22023';
 END IF;
 IF coalesce(p_payload->>'settledOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'A valid settlement date is required' USING ERRCODE='22023';
 END IF;
 v_settled_on := (p_payload->>'settledOn')::date;
 IF v_settled_on> CURRENT_DATE OR v_settled_on<v_obligation.issued_on THEN
  RAISE EXCEPTION 'Settlement date must be between issue date and today' USING ERRCODE='22023';
 END IF;

 SELECT coalesce(sum(s.amount),0)::numeric(18,2) INTO v_settled
 FROM public.frt_ic_settlements s
 WHERE s.workspace_id=p_workspace_id AND s.obligation_id=p_obligation_id;
 v_remaining := v_obligation.principal_amount-v_settled;
 IF v_remaining<=0 OR v_amount>v_remaining THEN
  RAISE EXCEPTION 'Settlement exceeds the outstanding balance' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.frt_ic_settlements(
  workspace_id,obligation_id,amount,settled_on,reference,notes,created_by
 ) VALUES (
  p_workspace_id,p_obligation_id,v_amount,v_settled_on,v_reference,v_notes,auth.uid()
 ) RETURNING id INTO v_id;

 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,NULL,auth.uid(),'FRT_IC_SETTLEMENT_RECORDED',
  jsonb_build_object('obligation_id',p_obligation_id,'settlement_id',v_id,
   'reference',v_reference,'amount',v_amount::text,'settled_on',v_settled_on::text));

 RETURN jsonb_build_object('ok',true,'id',v_id,'obligation_id',p_obligation_id,
  'remaining_amount',(v_remaining-v_amount)::text);
END;
$fn$;

-- Public PostgREST entry points are SECURITY INVOKER. The non-exposed private
-- implementations perform the narrowly scoped privileged reads/writes after
-- validating auth.uid() and the existing FRT membership/role resolver.
CREATE FUNCTION public.frt_ic_snapshot(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
 SELECT private.frt_ic_snapshot_impl(p_workspace_id);
$wrapper$;

CREATE FUNCTION public.frt_ic_create_obligation(p_workspace_id uuid,p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
 SELECT private.frt_ic_create_obligation_impl(p_workspace_id,p_payload);
$wrapper$;

CREATE FUNCTION public.frt_ic_record_settlement(
 p_workspace_id uuid,p_obligation_id uuid,p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
 SELECT private.frt_ic_record_settlement_impl(p_workspace_id,p_obligation_id,p_payload);
$wrapper$;

REVOKE ALL ON FUNCTION private.frt_ic_snapshot_impl(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.frt_ic_create_obligation_impl(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.frt_ic_record_settlement_impl(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.frt_ic_snapshot_impl(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.frt_ic_create_obligation_impl(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.frt_ic_record_settlement_impl(uuid,uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.frt_ic_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_ic_create_obligation(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_ic_record_settlement(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_ic_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_ic_create_obligation(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_ic_record_settlement(uuid,uuid,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
