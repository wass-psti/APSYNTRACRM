-- CP-WS-ACTIVATE-04: disposable-only PostgreSQL 17 compilation dependencies.
-- Structural metadata only, no production records, account identities, access grants,
-- security-sensitive function bodies, persistent data or privileged runtime changes.
-- This overlay is NOT production schema, and helper stubs MUST NOT be used as
-- proof of live authorization behavior or positive/negative caller acceptance.
-- Apply only to the existing cp-ws01b-disposable-setup.sql fixture before
-- replaying the protected 74 original function definitions in owner isolation.
\set ON_ERROR_STOP on
DO $source_fixture_preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR current_setting('server_version_num')::integer<170000
  OR to_regclass('public.workspaces') IS NULL
  OR to_regclass('public.workspace_members') IS NULL
  OR to_regclass('auth.sessions') IS NULL
  OR to_regclass('public.order_intake_orders') IS NOT NULL
 THEN RAISE EXCEPTION 'Source replay synthetic dependency fixture only'
    USING ERRCODE='42501';
 END IF;
END $source_fixture_preflight$;

CREATE SCHEMA huly_rewrite;
ALTER TABLE public.work_boards
 ADD COLUMN description text, ADD COLUMN status text,
 ADD COLUMN created_by uuid, ADD COLUMN updated_by uuid,
 ADD COLUMN created_at timestamptz, ADD COLUMN updated_at timestamptz,
 ADD COLUMN archived_at timestamptz, ADD COLUMN trashed_at timestamptz;

-- Deliberately fail-closed placeholders for compilation only.
-- Full positive-role tests require original source and real synthetic
-- entitlements, not these placeholders.
CREATE FUNCTION public.apsyntra_crm_explicit_role(uuid,uuid)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.is_platform_admin(uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.apsyntra_crm_module_role_rank(text,text)
RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 0::integer $$;
CREATE FUNCTION public.apsyntra_crm_effective_role(uuid,uuid)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION public.apsyntra_crm_role_rank(text)
RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 0::integer $$;

CREATE TABLE public."aps_aims_entities" (
  "id" uuid,
  "workspace_id" uuid,
  "entity_type" text,
  "payload" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "revision" bigint,
  "archived" boolean
);

CREATE TABLE public."employee_evaluation_employees" (
  "id" uuid,
  "workspace_id" uuid,
  "auth_user_id" uuid,
  "employee_code" text,
  "name" text,
  "email" text,
  "job_title" text,
  "department" text,
  "supervisor_id" uuid,
  "role" text,
  "active" boolean,
  "revision" bigint,
  "schema_version" integer,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."employee_evaluation_evaluations" (
  "id" uuid,
  "workspace_id" uuid,
  "employee_id" uuid,
  "evaluator_id" uuid,
  "period" text,
  "ratings" jsonb,
  "comments" text,
  "strengths" text,
  "improvements" text,
  "recommendation" text,
  "overall_score" numeric(4,2),
  "status" text,
  "review_comment" text,
  "revision" bigint,
  "submitted_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "finalized_at" timestamp with time zone,
  "returned_at" timestamp with time zone,
  "reviewed_by" uuid,
  "finalized_by" uuid,
  "returned_by" uuid,
  "schema_version" integer,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."employee_evaluation_settings" (
  "workspace_id" uuid,
  "active_period" text,
  "evaluation_window" text,
  "window_open_date" timestamp with time zone,
  "window_close_date" timestamp with time zone,
  "grace_period_days" integer,
  "revision" bigint,
  "schema_version" integer,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."module_activity_events" (
  "workspace_id" uuid,
  "module_id" text,
  "sequence" bigint,
  "event_id" text,
  "event_type" text,
  "title" text,
  "message" text,
  "request_id" text,
  "actor_user_id" uuid,
  "actor_email" text,
  "actor_name" text,
  "actor_role" text,
  "payload" jsonb,
  "occurred_at" timestamp with time zone
);

CREATE TABLE public."module_role_assignments" (
  "user_id" uuid,
  "module_id" text,
  "role" text,
  "enabled" boolean,
  "assigned_by" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."order_intake_orders" (
  "id" uuid,
  "workspace_id" uuid,
  "po_number" text,
  "client_name" text,
  "po_date" date,
  "date_received" date,
  "delivery_date" date,
  "currency" text,
  "po_amount" numeric(18,2),
  "vat_rate" numeric(8,4),
  "vat_exclusive_amount" numeric(18,2),
  "vat_amount" numeric(18,2),
  "procurement_expenses" numeric(18,2),
  "gross_profit" numeric(18,2),
  "status" text,
  "company" text,
  "industry" text,
  "account_manager" text,
  "buyer_in_charge" text,
  "end_user_in_charge" text,
  "notes" text,
  "fiscal_year" integer,
  "archived" boolean,
  "archived_at" timestamp with time zone,
  "revision" integer,
  "status_updated_at" timestamp with time zone,
  "schema_version" integer,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."tradelink_documents" (
  "id" uuid,
  "board_id" uuid,
  "workspace_id" uuid,
  "board_item_id" uuid,
  "document_type" text,
  "document_number" text,
  "workflow_state" text,
  "revision" bigint,
  "content" jsonb,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "archived_at" timestamp with time zone
);

CREATE TABLE public."work_board_items" (
  "id" uuid,
  "board_id" uuid,
  "group_id" uuid,
  "title" text,
  "status" text,
  "assignee_id" uuid,
  "due_date" date,
  "notes" text,
  "position" integer,
  "archived_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."work_board_members" (
  "board_id" uuid,
  "user_id" uuid,
  "role" text,
  "view_mode" text,
  "added_by" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "preferences" jsonb
);

