#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.11.0.004"
docker info --format '{{.ServerVersion}}' >/dev/null
docker run --rm --network none --read-only \
 --tmpfs /tmp:rw,exec,nosuid,size=256m --tmpfs /run:rw,nosuid,size=16m \
 --security-opt no-new-privileges \
 --mount "type=bind,source=$ROOT/sql,target=/source-sql,readonly" \
 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
mkdir -p /tmp/pgdata
chown postgres:postgres /tmp/pgdata
su postgres -s /bin/sh -c "initdb -D /tmp/pgdata -A trust --no-sync --no-instructions >/dev/null"
su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -o \"-c listen_addresses=127.0.0.1 -k /tmp\" -w start >/dev/null"
trap '\''su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -m immediate -w stop >/dev/null" || true'\'' EXIT
apply(){ psql -X -q -h /tmp -U postgres -d "$2" -v ON_ERROR_STOP=1 -f "$1"; }
apply /source-sql/tests/cp-rc03-disposable-setup.sql postgres
apply /source-sql/cp-rc03-workspace-scoped-mrh-role-management.sql postgres
apply /source-sql/tests/cp-rc03-workspace-scoped-mrh-role-acceptance.sql postgres
apply /source-sql/cp-rc03-workspace-scoped-mrh-role-management-rollback.sql postgres
apply /source-sql/tests/cp-rc03-rollback-acceptance.sql postgres

psql -X -q -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE cp_rc03_guard"
apply /source-sql/tests/cp-rc03-disposable-setup.sql cp_rc03_guard
psql -X -q -h /tmp -U postgres -d cp_rc03_guard -v ON_ERROR_STOP=1 -c "INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled) VALUES ('\''11111111-1111-4111-8111-111111111111'\'','\''material-request-hub'\'','\''REQUESTOR'\'',true)"
if apply /source-sql/cp-rc03-workspace-scoped-mrh-role-management.sql cp_rc03_guard >/tmp/cp-rc03-guard.log 2>&1; then
 echo CP_RC03_LEGACY_GLOBAL_MRH_GUARD_FAILED
 exit 1
fi
grep -q "Legacy global MRH role rows require explicit workspace reconciliation" /tmp/cp-rc03-guard.log
echo CP_RC03_LEGACY_GLOBAL_MRH_GUARD_PASS
'
echo CP_RC03_POSTGRES17_DISPOSABLE_ACCEPTANCE_PASS
