#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${CP_URM_EFFECTIVE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}"
docker info --format '{{.ServerVersion}}' >/dev/null
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
 if ! docker pull "$IMAGE" >/dev/null 2>&1; then
  if [[ "$IMAGE" != "public.ecr.aws/supabase/postgres:17.11.0.004" ]]; then
   echo "Requested PostgreSQL image unavailable: $IMAGE" >&2
   exit 1
  fi
  IMAGE="postgres@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"
  echo "Primary registry unavailable; using pinned PG17 fallback" >&2
  docker pull "$IMAGE" >/dev/null
 fi
fi
docker run --rm --network none --read-only \
 --tmpfs /tmp:rw,exec,nosuid,size=256m --tmpfs /run:rw,nosuid,size=16m \
 --security-opt no-new-privileges \
 --mount "type=bind,source=$ROOT/sql/tests,target=/sql-tests,readonly" \
 --mount "type=bind,source=$ROOT/supabase/migrations,target=/source-migrations,readonly" \
 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
mkdir -p /tmp/pgdata
chown postgres:postgres /tmp/pgdata
su postgres -s /bin/sh -c "initdb -D /tmp/pgdata -A trust --no-sync --no-instructions >/dev/null"
su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -o \"-c listen_addresses=127.0.0.1 -k /tmp\" -w start >/dev/null"
trap '\''su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -m immediate -w stop >/dev/null" || true'\'' EXIT
apply(){ psql -X -q -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$1"; }
apply /sql-tests/cp-urm-effective01a-disposable-setup.sql
psql -X -q -1 -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -f /source-migrations/20261118020130_cp_urm_effective_access_source_parity_20261118.sql
apply /sql-tests/cp-urm-effective01a-disposable-acceptance.sql
'
