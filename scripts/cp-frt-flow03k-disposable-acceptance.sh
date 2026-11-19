#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NAME="cp-frt-flow03k-disposable-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=disposable postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
 if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true;break;fi
 sleep 1
done
if [[ "$ready" != true ]];then echo "Disposable PostgreSQL not ready." >&2;exit 1;fi
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
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active',PRIMARY KEY(workspace_id,user_id)
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$fn$;
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT m.role FROM public.frt_memberships m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=auth.uid()
  AND m.enabled=true AND m.status='active' LIMIT 1
$fn$;
INSERT INTO public.workspaces(id) VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
SQL
psql_in -q < sql/tests/cp-frt-sec10-ci03-native-finance.sql
psql_in -q <<'SQL'
-- Minimal structures needed by the narrow correction's terminal-state guard.
CREATE TABLE public.frt_request_accounting_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,
 fund_request_id uuid NOT NULL);
CREATE TABLE public.frt_bank_executions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,
 fund_request_id uuid NOT NULL);
SQL
psql_in -q < supabase/migrations/20261119085100_cp_frt_flow03k_payee_correction_cas.sql
psql_in -1 < sql/tests/cp-frt-flow03k-disposable.sql
echo "CP-FRT-FLOW-03K disposable PostgreSQL 17 payee CAS acceptance PASS."
