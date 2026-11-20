#!/usr/bin/env bash
# Isolated nonproduction PostgreSQL. Never connects to a deployed Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${CP_URM_INTEGRITY_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}"
docker info --format '{{.ServerVersion}}' >/dev/null
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
 if ! docker pull "$IMAGE" >/dev/null 2>&1; then
  if [[ "$IMAGE" != "public.ecr.aws/supabase/postgres:17.11.0.004" ]]; then
   echo "Explicit PostgreSQL image unavailable: $IMAGE" >&2; exit 1
  fi
  IMAGE="postgres@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"
  docker pull "$IMAGE" >/dev/null
 fi
fi
docker run --rm --network none --read-only \
 --tmpfs /tmp:rw,exec,nosuid,size=256m --tmpfs /run:rw,nosuid,size=16m \
 --security-opt no-new-privileges \
 --mount "type=bind,source=$ROOT/sql,target=/source-sql,readonly" \
 --mount "type=bind,source=$ROOT/supabase/migrations,target=/source-migrations,readonly" \
 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
mkdir -p /tmp/pgdata
chown postgres:postgres /tmp/pgdata
su postgres -s /bin/sh -c "initdb -D /tmp/pgdata -A trust --no-sync --no-instructions >/dev/null"
su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -o \"-c listen_addresses=127.0.0.1 -k /tmp\" -w start >/dev/null"
trap '\''su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -m immediate -w stop >/dev/null" || true'\'' EXIT
apply(){ psql -X -q -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$1"; }
apply /source-sql/tests/cp-urm04b-disposable-setup.sql
# The parity fixture intentionally uses a minimal module-only mock. Overlay
# the checked-in canonical RC02 role RPC so tests exercise its real audit,
# CAS, Board and revocation implementation, not the fixture stub.
awk -f /source-sql/tests/cp-crm-urm-integrity-02-extract.awk \
 /source-migrations/20261030080046_cp_rc02_bootstrap_user_role_management.sql > /tmp/role-rpc.sql
test "$(wc -l < /tmp/role-rpc.sql)" -gt 140
apply /tmp/role-rpc.sql
# Replace the minimal CRM setter mock as well: its lack of updatedAt CAS and
# audited transaction would conceal the very failures under acceptance.
awk -v function_name=apsyntra_crm_platform_role_set \
 -f /source-sql/tests/cp-crm-urm-integrity-02-extract.awk \
 /source-migrations/20261031012212_cp_frt_sec08_crm_platform_role_activation.sql > /tmp/crm-setter.sql
test "$(wc -l < /tmp/crm-setter.sql)" -gt 50
apply /tmp/crm-setter.sql
apply /source-migrations/20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql
# The existing disposable admin-parity fixture does not contain the full
# effective module-role resolver. Install the *unmodified* canonical SQL
# functions from their checked-in source, not a reconstructed test stub.
for fn in apsyntra_crm_role_rank apsyntra_crm_module_role_rank apsyntra_crm_explicit_role module_role_for has_module_access; do
 awk -v function_name="$fn" -f /source-sql/tests/cp-crm-urm-integrity-02-extract.awk \
  /source-migrations/20261031012212_cp_frt_sec08_crm_platform_role_activation.sql > "/tmp/$fn.sql"
 test "$(wc -l < "/tmp/$fn.sql")" -gt 5
 apply "/tmp/$fn.sql"
done
apply /source-sql/tests/cp-crm-urm-integrity-02-disposable-acceptance.sql
'
echo CP_CRM_URM_INTEGRITY_02_DISPOSABLE_PASS
