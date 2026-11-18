#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${CP_URM_FUELTRANS_PG17_IMAGE:-postgres:17}"
docker info --format '{{.ServerVersion}}' >/dev/null
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then docker pull "$IMAGE" >/dev/null; fi
docker run --rm --network none --read-only \
 --tmpfs /tmp:rw,exec,nosuid,size=256m --tmpfs /run:rw,nosuid,size=16m \
 --security-opt no-new-privileges \
 --mount "type=bind,source=$ROOT/sql,target=/source-sql,readonly" \
 --mount "type=bind,source=$ROOT/supabase/migrations,target=/supabase/migrations,readonly" \
 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
mkdir -p /tmp/pgdata
chown postgres:postgres /tmp/pgdata
su postgres -s /bin/sh -c "initdb -D /tmp/pgdata -A trust --no-sync --no-instructions >/dev/null"
su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -o \"-c listen_addresses=127.0.0.1 -k /tmp\" -w start >/dev/null"
trap '\''su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -m immediate -w stop >/dev/null" || true'\'' EXIT
psql -X -q -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 \
 -f /source-sql/tests/cp-urm-app-toolbox-01-disposable-setup.sql \
 -f /source-sql/tests/cp-urm-fueltrans-workspace-disposable.sql \
 -f /source-sql/tests/cp-urm-fueltrans-nonbootstrap-admin-403.sql
'
