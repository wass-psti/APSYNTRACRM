#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${CP_URM04B_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}"
MIGRATION="20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql"
docker info --format '{{.ServerVersion}}' >/dev/null
# Supabase ECR can exhaust its anonymous pull quota on hosted CI runners.
# Preserve the pinned Supabase image when available; use a verified, pinned
# upstream PostgreSQL 17 image only if the primary registry is unavailable.
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
 if ! docker pull "$IMAGE" >/dev/null 2>&1; then
  if [[ "$IMAGE" != "public.ecr.aws/supabase/postgres:17.11.0.004" ]]; then
   echo "Requested PostgreSQL test image is unavailable: $IMAGE" >&2
   exit 1
  fi
  IMAGE="postgres@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"
  echo "Primary PostgreSQL registry unavailable; using pinned PG17 fallback" >&2
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
apply /source-migrations/20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql
apply /source-sql/tests/cp-urm04b-admin-parity-acceptance.sql
apply /source-sql/cp-urm04b-rollback.sql
apply /source-sql/tests/cp-urm04b-rollback-acceptance.sql
'
echo CP_URM04B_POSTGRES17_ADMIN_PARITY_PASS
