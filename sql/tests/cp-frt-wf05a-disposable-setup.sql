-- Minimal disposable FRT schema for CP-FRT-WF-05A archive acceptance.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$fn$;
CREATE TABLE public.frt_companies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 code text NOT NULL,name text NOT NULL,display_order integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,code)
);
CREATE TABLE public.frt_memberships(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),role text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,status text NOT NULL DEFAULT 'active',
 display_name text,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.frt_voucher_counters(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.frt_companies(id) ON DELETE CASCADE,
 voucher_year integer NOT NULL,last_number integer NOT NULL DEFAULT 0 CHECK(last_number>=0),
 PRIMARY KEY(workspace_id,company_id,voucher_year)
);
CREATE TABLE public.frt_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.frt_companies(id),
 requestor_id uuid NOT NULL REFERENCES auth.users(id),voucher_no text NOT NULL,
 title text NOT NULL,department text NOT NULL,fund_source text NOT NULL,
 recipient_name text,recipient_bank text,recipient_account text,
 date_needed date NOT NULL,description text NOT NULL,order_intake_no text,check_no text,
 total_amount numeric(14,2) NOT NULL CHECK(total_amount>=0),
 status text NOT NULL DEFAULT 'PENDING_APPROVAL',liquidation_status text NOT NULL DEFAULT 'NOT_SUBMITTED',
 filing_status text NOT NULL DEFAULT 'NOT_FILED',
 finance_approved_by uuid,finance_approved_at timestamptz,
 transfer_confirmed_by uuid,transfer_confirmed_at timestamptz,transfer_reference text,
 closed_by uuid,closed_at timestamptz,archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,company_id,voucher_no)
);
CREATE TABLE public.frt_request_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 fund_request_id uuid NOT NULL REFERENCES public.frt_requests(id) ON DELETE CASCADE,
 category text NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>=0),
 notes text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.frt_audit_logs(
 id bigserial PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 fund_request_id uuid REFERENCES public.frt_requests(id),user_id uuid REFERENCES auth.users(id),
 action text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT m.role FROM public.frt_memberships m WHERE m.workspace_id=p_workspace_id
 AND m.user_id=auth.uid() AND m.enabled=true AND m.status='active' LIMIT 1
$fn$;
CREATE OR REPLACE FUNCTION private.frt_has_membership(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.frt_memberships m WHERE m.workspace_id=p_workspace_id
   AND m.user_id=auth.uid() AND m.enabled=true AND m.status='active')
$fn$;
CREATE OR REPLACE FUNCTION private.frt_has_role(p_workspace_id uuid,VARIADIC p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.frt_memberships m WHERE m.workspace_id=p_workspace_id
 AND m.user_id=auth.uid() AND m.enabled=true AND m.status='active' AND m.role=ANY(p_roles))
$fn$;
CREATE OR REPLACE FUNCTION public.frt_request_action(
 p_workspace_id uuid,p_request_id uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE v_request public.frt_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_request FROM public.frt_requests WHERE workspace_id=p_workspace_id
 AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF p_action='archive' THEN
  IF private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') IS NOT TRUE THEN
   RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.frt_requests SET archived_at=now(),updated_at=now()
  WHERE workspace_id=p_workspace_id AND id=p_request_id;
  INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action)
  VALUES(p_workspace_id,p_request_id,auth.uid(),'REQUEST_ARCHIVED');
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Unsupported request action: %',p_action;
END
$fn$;
INSERT INTO public.workspaces(id) VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000002');
INSERT INTO public.frt_companies(workspace_id,code,name,display_order)
VALUES
 ('00000000-0000-4000-8000-000000000001','WASS','Watchdog Automation Sales & Services',1),
 ('00000000-0000-4000-8000-000000000001','WAO','Watchdog Automation OPC',2),
 ('00000000-0000-4000-8000-000000000001','PSTI','Process Solutions Technology Inc.',3);
