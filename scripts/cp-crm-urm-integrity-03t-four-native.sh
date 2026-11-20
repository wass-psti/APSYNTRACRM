#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?Disposable postgres PGHOST required}"
case "$PGHOST" in localhost|127.0.0.1) ;; *) echo 'BLOCKED: nonlocal PostgreSQL target' >&2;exit 2;;esac
psql -X -v ON_ERROR_STOP=1 \
 -f sql/tests/cp-urm-scoped02b-setup.sql \
 -f sql/tests/cp-urm-scoped02b-live-role-baseline.sql \
 -f sql/tests/cp-crm-urm-integrity-03t-setup.sql \
 -f supabase/migrations/20261118052000_cp_urm_scoped02a_frt_roles.sql \
 -f supabase/migrations/20261118062000_cp_urm_scoped02b_six_modules.sql \
 -f supabase/migrations/20261120190000_cp_frt_native_role_source_parity.sql \
 -f sql/tests/cp-crm-urm-integrity-03t-four-native.sql
