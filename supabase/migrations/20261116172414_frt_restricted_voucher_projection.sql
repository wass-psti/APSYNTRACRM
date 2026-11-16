-- CP-FRT-FLOW-03: additive voucher projection on the existing signed request-detail RPC.
-- Keeps the existing signature, membership check, workflow payload, and EXECUTE grants.
-- No new RPC, table, voucher counter, role, or permission grant is introduced.
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
   'company',jsonb_build_object('code',r.company_code,'name',r.company_name),
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
  )
 );
END $fn$;
