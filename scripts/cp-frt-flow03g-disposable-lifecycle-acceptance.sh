#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NAME="cp-frt-flow03g-lifecycle-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=disposable postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
 if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true;break;fi
 sleep 1
done
if [[ "$ready" != true ]];then echo "Disposable PostgreSQL did not become ready." >&2;exit 1;fi
psql_in(){ docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_in -q <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.frt_memberships(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active',
 PRIMARY KEY(workspace_id,user_id)
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$fn$;
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT m.role FROM public.frt_memberships m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=auth.uid()
  AND m.enabled=true AND m.status='active' LIMIT 1
$fn$;
INSERT INTO public.workspaces(id)
 VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004');
SQL
psql_in -q < sql/tests/cp-frt-sec10-ci03-native-finance.sql
psql_in -q < supabase/migrations/20261117010000_frt_wf05b_monthly_voucher_and_duplicate_guard.sql
psql_in -q <<'SQL'
INSERT INTO public.frt_companies(workspace_id,code,name,display_order)
VALUES
 ('00000000-0000-4000-8000-000000000001','WASS','Watchdog Automation Sales & Services',1),
 ('00000000-0000-4000-8000-000000000001','WAO','Watchdog Automation OPC',2),
 ('00000000-0000-4000-8000-000000000001','PSTI','Process Solutions Technology Inc.',3);
SQL
psql_in -q < supabase/migrations/20261113085038_frt_wf02_signed_multi_receipt_liquidation.sql
psql_in -q < supabase/migrations/20261113091401_frt_wf03_authoritative_bank_execution.sql
psql_in -q < supabase/migrations/20261113092816_frt_wf04_signed_aging_summary.sql
psql_in -1 < sql/tests/cp-frt-wf02-disposable.sql
psql_in -1 < sql/tests/cp-frt-wf03-disposable.sql
psql_in -1 < sql/tests/cp-frt-wf04-disposable.sql
psql_in < sql/tests/cp-frt-flow03g-disposable-lifecycle.sql
echo "CP-FRT-FLOW-03G disposable PostgreSQL lifecycle acceptance passed."
