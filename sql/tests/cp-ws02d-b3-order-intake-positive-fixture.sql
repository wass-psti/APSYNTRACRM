-- CP-WS-02D/B3 Order Intake synthetic domain schema for valid-write tests.
-- Based on read-only production column metadata. Disposable PG17 ONLY.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('public.order_intake_create(jsonb)') IS NULL
 OR to_regclass('public.order_intake_orders') IS NULL
 OR to_regclass('public.order_intake_activity') IS NOT NULL
 OR to_regclass('public.order_intake_create_idempotency') IS NOT NULL
 THEN RAISE EXCEPTION 'Order Intake fixture prerequisite/collision'
 USING ERRCODE='42501'; END IF;
END $pre$;
-- The preexisting source-fixture shell only has id UUID.
ALTER TABLE public.order_intake_orders
 ALTER COLUMN id SET DEFAULT gen_random_uuid(),
 ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id),
 ADD COLUMN po_number text,
 ADD COLUMN client_name text,
 ADD COLUMN po_date date,
 ADD COLUMN date_received date,
 ADD COLUMN delivery_date date,
 ADD COLUMN currency text NOT NULL DEFAULT 'PHP',
 ADD COLUMN po_amount numeric(18,2),
 ADD COLUMN vat_rate numeric(8,4) NOT NULL DEFAULT 12,
 ADD COLUMN vat_exclusive_amount numeric(18,2),
 ADD COLUMN vat_amount numeric(18,2),
 ADD COLUMN procurement_expenses numeric(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN gross_profit numeric(18,2),
 ADD COLUMN status text,
 ADD COLUMN company text,
 ADD COLUMN industry text,
 ADD COLUMN account_manager text NOT NULL DEFAULT 'Unassigned',
 ADD COLUMN buyer_in_charge text NOT NULL DEFAULT '',
 ADD COLUMN end_user_in_charge text NOT NULL DEFAULT '',
 ADD COLUMN notes text NOT NULL DEFAULT '',
 ADD COLUMN fiscal_year integer,
 ADD COLUMN archived boolean NOT NULL DEFAULT false,
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN status_updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN schema_version integer NOT NULL DEFAULT 2,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.order_intake_orders ADD PRIMARY KEY (id);
CREATE TABLE public.order_intake_activity(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 order_id uuid NOT NULL REFERENCES public.order_intake_orders(id),
 po_number text NOT NULL,type text NOT NULL,message text NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_intake_create_idempotency(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 payload_hash text NOT NULL,
 order_id uuid NOT NULL REFERENCES public.order_intake_orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,request_id)
);
CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $m$
 SELECT p_module_id IN ('fueltrack-plus','tradelink','time-tracker','employee-eval','order-intake')
 AND p_actor IS NOT NULL AND p_actor=auth.uid()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active')
 AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.user_id=p_actor
  AND m.active AND m.workspace_id=public.current_workspace_id(p_actor));
$m$;
