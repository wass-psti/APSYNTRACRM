BEGIN;
DO $m195_guard$
BEGIN
 IF to_regclass('public.order_intake_orders') IS NOT NULL OR to_regclass('public.order_intake_activity') IS NOT NULL THEN
  RAISE EXCEPTION 'M195 Order Intake tables already exist; reconcile schema before migration';
 END IF;
 IF to_regclass('public.workspaces') IS NULL OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL THEN
  RAISE EXCEPTION 'WatchdogWorkspace authority contracts are missing';
 END IF;
END
$m195_guard$;
CREATE TABLE public.order_intake_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 po_number text NOT NULL CHECK (length(btrim(po_number)) BETWEEN 1 AND 240),
 client_name text NOT NULL CHECK (length(btrim(client_name)) BETWEEN 1 AND 240),
 po_date date NOT NULL,
 date_received date NOT NULL,
 delivery_date date NOT NULL,
 currency text NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP','USD','EUR')),
 po_amount numeric(18,2) NOT NULL CHECK (po_amount > 0),
 vat_rate numeric(8,4) NOT NULL DEFAULT 12 CHECK (vat_rate >= 0),
 vat_exclusive_amount numeric(18,2) NOT NULL,
 vat_amount numeric(18,2) NOT NULL,
 procurement_expenses numeric(18,2) NOT NULL DEFAULT 0 CHECK (procurement_expenses >= 0),
 gross_profit numeric(18,2) NOT NULL,
 status text NOT NULL CHECK (length(btrim(status)) BETWEEN 1 AND 120),
 company text NOT NULL CHECK (length(btrim(company)) BETWEEN 1 AND 240),
 industry text NOT NULL CHECK (length(btrim(industry)) BETWEEN 1 AND 240),
 account_manager text NOT NULL DEFAULT 'Unassigned',
 buyer_in_charge text NOT NULL DEFAULT '',
 end_user_in_charge text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2300),
 archived boolean NOT NULL DEFAULT false,
 archived_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 status_updated_at timestamptz NOT NULL DEFAULT now(),
 schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version = 2),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workspace_id, id),
 CONSTRAINT order_intake_delivery_after_po CHECK (delivery_date >= po_date),
 CONSTRAINT order_intake_archived_timestamp CHECK ((archived AND archived_at IS NOT NULL) OR (NOT archived AND archived_at IS NULL))
);
CREATE UNIQUE INDEX order_intake_workspace_po_unique ON public.order_intake_orders (workspace_id, upper(btrim(po_number)));
CREATE INDEX order_intake_workspace_active_fy_received ON public.order_intake_orders (workspace_id, archived, fiscal_year, date_received DESC);
CREATE INDEX order_intake_workspace_status ON public.order_intake_orders (workspace_id, status);
CREATE TABLE public.order_intake_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 order_id uuid,
 po_number text,
 type text NOT NULL CHECK (length(btrim(type)) BETWEEN 1 AND 120),
 message text NOT NULL,
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (workspace_id, order_id) REFERENCES public.order_intake_orders(workspace_id, id)
);
CREATE INDEX order_intake_activity_workspace_order_created ON public.order_intake_activity (workspace_id, order_id, created_at DESC);
CREATE INDEX order_intake_activity_workspace_created ON public.order_intake_activity (workspace_id, created_at DESC);
ALTER TABLE public.order_intake_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_intake_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_intake_orders_select ON public.order_intake_orders FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND workspace_id = public.current_workspace_id(auth.uid()) AND public.has_module_access('order-intake', auth.uid()));
CREATE POLICY order_intake_activity_select ON public.order_intake_activity FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND workspace_id = public.current_workspace_id(auth.uid()) AND public.has_module_access('order-intake', auth.uid()));
REVOKE ALL ON public.order_intake_orders, public.order_intake_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_intake_orders, public.order_intake_activity TO authenticated;
COMMENT ON TABLE public.order_intake_orders IS 'M195.1 Order Intake schema-v2, workspace-scoped read-only foundation; mutations not yet enabled.';
COMMENT ON TABLE public.order_intake_activity IS 'M195.1 workspace-scoped Order Intake activity; append-only via future authorized RPC.';
COMMIT;;
