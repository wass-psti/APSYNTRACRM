-- Unapplied candidate. Additive historical representation in the existing database.
BEGIN;
CREATE TABLE public.order_intake_legacy_orders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  source_key text NOT NULL CHECK (btrim(source_key) <> ''),
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_key),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK ((payload #>> '{identity,key}' = source_key) IS TRUE),
  CHECK ((payload #>> '{provenance,boardId}' = '3670228015') IS TRUE),
  CHECK ((jsonb_typeof(payload->'values') = 'object') IS TRUE),
  CHECK (COALESCE(btrim(payload #>> '{values,poNumber}'),'') <> ''),
  CHECK (payload ? 'sourceArchiveState' AND jsonb_typeof(payload->'sourceArchiveState') IN ('boolean','null'))
);
CREATE INDEX order_intake_legacy_read_order ON public.order_intake_legacy_orders
  (workspace_id, (payload #>> '{values,dateReceived}') DESC NULLS LAST, id DESC);
ALTER TABLE public.order_intake_legacy_orders ENABLE ROW LEVEL SECURITY;
-- Same predicate as current order_intake_orders_select; no new role checks.
CREATE POLICY order_intake_legacy_orders_select ON public.order_intake_legacy_orders
  FOR SELECT TO authenticated USING (
    ((SELECT auth.uid()) IS NOT NULL)
    AND (workspace_id = (SELECT public.current_workspace_id((SELECT auth.uid()))))
    AND (SELECT public.has_module_access('order-intake'::text, (SELECT auth.uid())))
  );
REVOKE ALL ON public.order_intake_legacy_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_intake_legacy_orders TO authenticated;

-- Explicit projection: text decimal fields avoid numeric conversion in the REST JSON client.
-- Raw payload remains in the historical table, not in every list response.
CREATE VIEW public.order_intake_registry WITH (security_invoker = true) AS
SELECT n.id,n.workspace_id,'native'::text AS record_kind,
  n.po_number::text AS po_number,
  n.client_name::text AS client_name,
  n.po_date::text AS po_date,
  n.date_received::text AS date_received,
  n.delivery_date::text AS delivery_date,
  n.currency::text AS currency,
  n.po_amount::text AS po_amount,
  n.vat_rate::text AS vat_rate,
  n.vat_exclusive_amount::text AS vat_exclusive_amount,
  n.vat_amount::text AS vat_amount,
  n.procurement_expenses::text AS procurement_expenses,
  n.gross_profit::text AS gross_profit,
  n.company::text AS company,
  n.industry::text AS industry,
  n.account_manager::text AS account_manager,
  n.buyer_in_charge::text AS buyer_in_charge,
  n.end_user_in_charge::text AS end_user_in_charge,
  n.notes::text AS notes,
  n.status,n.fiscal_year,n.archived,n.revision,
  n.status_updated_at,n.updated_at,
  NULL::text AS source_key,NULL::text AS source_item_id,
  NULL::text AS source_locator,NULL::text AS source_group,
  'crm_vat_derived'::text AS financial_basis,
  NULL::text AS historical_client_name,NULL::text AS po_file_reference,
  NULL::text AS confirmation_reference
FROM public.order_intake_orders n
UNION ALL
SELECT l.id,l.workspace_id,'legacy'::text,
  l.payload #>> '{values,poNumber}' AS po_number,
  l.payload #>> '{values,clientName}' AS client_name,
  l.payload #>> '{values,poDate}' AS po_date,
  l.payload #>> '{values,dateReceived}' AS date_received,
  l.payload #>> '{values,deliveryDate}' AS delivery_date,
  l.payload #>> '{values,currency}' AS currency,
  l.payload #>> '{values,poAmount}' AS po_amount,
  l.payload #>> '{values,vatRate}' AS vat_rate,
  l.payload #>> '{values,vatExclusiveAmount}' AS vat_exclusive_amount,
  l.payload #>> '{values,vatAmount}' AS vat_amount,
  l.payload #>> '{values,procurementExpenses}' AS procurement_expenses,
  l.payload #>> '{values,grossProfit}' AS gross_profit,
  l.payload #>> '{values,company}' AS company,
  l.payload #>> '{values,industry}' AS industry,
  l.payload #>> '{values,accountManager}' AS account_manager,
  l.payload #>> '{values,buyerInCharge}' AS buyer_in_charge,
  l.payload #>> '{values,endUserInCharge}' AS end_user_in_charge,
  l.payload #>> '{values,notes}' AS notes,
  l.payload->>'sourceStatus',(l.payload->>'sourceFiscalYear')::integer,
  (l.payload->>'sourceArchiveState')::boolean,NULL::integer,
  NULL::timestamptz,NULL::timestamptz,
  l.source_key,l.payload #>> '{identity,itemId}',
  l.payload #>> '{provenance,locator}',l.payload->>'sourceGroup',
  l.payload->>'financialBasis',l.payload #>> '{historicalClientEvidence,clientName}',
  l.payload #>> '{attachments,poFileReference}',l.payload #>> '{attachments,confirmationReference}'
FROM public.order_intake_legacy_orders l;
REVOKE ALL ON public.order_intake_registry FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_intake_registry TO authenticated;
COMMIT;
