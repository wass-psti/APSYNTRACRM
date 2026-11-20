#!/usr/bin/env bash
# Run only in an isolated disposable PostgreSQL 17 instance with synthetic users.
set -euo pipefail
: "${DOMAIN:?Select a scoped-role domain}"
: "${PGHOST:?An isolated PostgreSQL instance is required}"
# Explicitly reject network database endpoints. Never connect to live Supabase.
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo 'BLOCKED: nonlocal database endpoint' >&2; exit 2 ;; esac
: "${PGPORT:=5432}"
: "${PGDATABASE:=postgres}"
: "${PGUSER:=postgres}"
apply(){ psql -X -v ON_ERROR_STOP=1 -f "$1"; }
case "$DOMAIN" in
 fund-tracker)
  apply sql/tests/cp-urm-scoped02-frt-setup.sql
  apply supabase/migrations/20261118052000_cp_urm_scoped02a_frt_roles.sql
  apply sql/tests/cp-urm-scoped02-frt-acceptance.sql
  ;;
 six-apps)
  apply sql/tests/cp-urm-scoped02b-setup.sql
  apply sql/tests/cp-urm-scoped02b-live-role-baseline.sql
  apply supabase/migrations/20261118062000_cp_urm_scoped02b_six_modules.sql
  apply sql/tests/cp-urm-scoped02b-acceptance.sql
  ;;
 charter)
  apply sql/tests/cp-urm-scoped02b-setup.sql
  apply sql/tests/cp-urm-scoped02b-live-role-baseline.sql
  apply supabase/migrations/20261118062000_cp_urm_scoped02b_six_modules.sql
  apply sql/tests/cp-urm-scoped02c-setup.sql
  apply sql/tests/cp-urm-scoped02c-live-charter-timetracker.sql
  apply sql/tests/cp-urm-scoped02c-live-ranks.sql
  apply supabase/migrations/20261118063000_cp_urm_scoped02c_charter_timetracker.sql
  apply sql/tests/cp-urm-scoped02c-acceptance.sql
  ;;
 fueltrans)
  # The original fixture establishes its synthetic admin via session-local
  # set_config; all three source files must share a single psql connection.
  psql -X -v ON_ERROR_STOP=1 \
   -f sql/tests/cp-urm-app-toolbox-01-disposable-setup.sql \
   -f sql/tests/cp-urm-fueltrans-workspace-disposable.sql \
   -f sql/tests/cp-urm-fueltrans-nonbootstrap-admin-403.sql
  ;;
 tooltrace)
  apply sql/tests/cp-urm-effective01a-disposable-setup.sql
  apply supabase/migrations/20261118020130_cp_urm_effective_access_source_parity_20261118.sql
  apply sql/tests/cp-urm-effective01a-disposable-acceptance.sql
  apply supabase/migrations/20261118032000_cp_urm_tooltrace_workspace_role_sync.sql
  apply sql/tests/cp-urm-tooltrace-disposable-acceptance.sql
  ;;
 *) echo 'BLOCKED: unknown scoped-role domain' >&2; exit 2 ;;
esac
echo "CP_CRM_URM_INTEGRITY_03_${DOMAIN}_DISPOSABLE_PASS"
