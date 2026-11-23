#!/usr/bin/env bash
# CP20: staging schema-only export into a standalone, disposable PG17 cluster.
# Restore actual owner statements without modifying roles in any shared DB.
set -euo pipefail
umask 077
readonly root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly name="cp_native20_pg_owner_qa"
readonly project="jeqwjlxubntsddeauvqa"
readonly lock="/tmp/cp_native20_pg_owner_qa.lock"
readonly image="postgres:17-alpine"

if ! mkdir "$lock" 2>/dev/null; then
  echo 'BLOCKED: CP20 owner-clone lock exists' >&2
  exit 2
fi
tmp=""
created=false
network_created=false
readonly network="cp_native23_internal_qa"
phase="initialization"
# Diagnostics report only the operation category and a redacted error class.
# Do not print database passwords, connection strings or schema contents.
diagnose_failure() {
  local code="$1"
  local stage="$phase"
  local category="unclassified"
  if [[ -n "$tmp" && -f "$tmp/restore.log" ]]; then
    if grep -qi 'role .* does not exist' "$tmp/restore.log"; then
      category="missing-disposable-role"
    elif grep -qi 'permission denied' "$tmp/restore.log"; then
      category="ownership-or-permission"
    elif grep -qi 'already exists' "$tmp/restore.log"; then
      category="existing-object-conflict"
    elif grep -qi 'connection refused\|could not connect' "$tmp/restore.log"; then
      category="connection"
    elif grep -qi 'timeout\|deadline exceeded' "$tmp/restore.log"; then
      category="timeout"
    elif grep -qi 'ERROR:\|FATAL:' "$tmp/restore.log"; then
      category="postgres-error"
    fi
  fi
  printf 'CP22_FAILURE_STAGE=%s\nCP22_FAILURE_CLASS=%s\nCP22_FAILURE_EXIT=%s\n' "$stage" "$category" "$code" >&2
}
trap 'diagnose_failure "$?"' ERR
cleanup() {
  if [[ "$created" == true ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
  if [[ "$network_created" == true ]]; then
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
  if [[ -n "$tmp" && -d "$tmp" ]]; then
    rm -rf -- "$tmp"
  fi
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

# Deterministic, no-network failure diagnostic. Does not start Docker or
# contact staging. It exercises ERR and EXIT cleanup using the real lock.
if [[ "${1:-}" == "--diagnostic-self-test" ]]; then
  phase="diagnostic-self-test"
  false
fi
if [[ $# -gt 0 ]]; then
  echo 'BLOCKED: unknown owner-clone option' >&2
  exit 2
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
  echo 'BLOCKED: CP20 container exists; refusing overwrite' >&2
  exit 2
fi
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo 'BLOCKED: preinstalled PostgreSQL 17 image unavailable' >&2
  exit 2
fi
phase="temporary-directory"
tmp="$(mktemp -d /tmp/cp-native20.XXXXXX)"
readonly dump="$tmp/staging-schema.sql"
readonly restore="$tmp/staging-owner-restore.sql"
readonly envfile="$tmp/pg.env"
readonly restore_log="$tmp/restore.log"

# Generate a one-use password and never print or commit it.
phase="temporary-password"
python3 - "$envfile" <<'PY'
from pathlib import Path
import secrets,sys
path=Path(sys.argv[1])
path.write_text("POSTGRES_PASSWORD="+secrets.token_urlsafe(48)+"\n")
path.chmod(0o600)
PY

# Ordinary owner-only runs have no Docker networking. Runtime probes use
# a private internal-only network from container creation (not reconnect).
network_arg="none"
if [[ "${CP23_DISPOSABLE_RUNTIME_PROBE:-}" == 1 ]]; then
  if docker network ls --format '{{.Name}}' | grep -qx "$network"; then
    echo 'BLOCKED: pre-existing isolated QA network; refusing overwrite' >&2
    exit 2
  fi
  phase="isolated-internal-network"
  docker network create --internal "$network" >/dev/null
  network_created=true
  network_arg="$network"
fi
phase="isolated-postgres-startup"
docker run -d --name "$name" --network "$network_arg" --env-file "$envfile" "$image" >/dev/null
created=true
for attempt in $(seq 1 35); do
  if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.3
done
docker exec "$name" pg_isready -U postgres >/dev/null
echo 'PASS: independent PostgreSQL 17 initialized without external networking'

cd "$root"
phase="staging-schema-export"
supabase db dump --project-ref "$project" \
  --schema auth,public,private,extensions \
  --file "$dump" --yes --log-level error >"$restore_log" 2>&1
chmod 600 "$dump"

# Restore the exact original staged ownership statements into a separate
# cluster. Local role shells are NOLOGIN and have no global elevated privileges.
phase="source-owner-inventory"
python3 - "$dump" "$tmp/roles.sql" "$restore" <<'PY'
from pathlib import Path
import re,sys
schema=Path(sys.argv[1]).read_text()
roles=set(re.findall(r' OWNER TO ([A-Za-z_][A-Za-z_0-9]*);',schema))
roles.update(re.findall(r'AUTHORIZATION ([A-Za-z_][A-Za-z_0-9]*);',schema))
roles.update(re.findall(r'\b(?:TO|FROM) (supabase_[A-Za-z_0-9]+)',schema))
roles.update({'supabase_admin','supabase_auth_admin','anon','authenticated','service_role'})
roles.discard('postgres')
for role in roles:
 if not role.startswith('supabase_') and role not in ('anon','authenticated','service_role'):
  raise SystemExit('BLOCKED: unexpected staging object owner or grantee')
if len(re.findall(r'^ALTER .* OWNER TO ',schema,re.M))!=78:
 raise SystemExit('BLOCKED: staging owner statement count changed')
if len(re.findall(r'^ALTER DEFAULT PRIVILEGES ',schema,re.M))!=12:
 raise SystemExit('BLOCKED: staging default ACL statement count changed')
# This is an isolated owner-fidelity test. Omit only privilege grants,
# revokes and default privilege rules requiring full platform roles.
lines=schema.splitlines(keepends=True)
skip=('ALTER DEFAULT PRIVILEGES ','GRANT ','REVOKE ')
Path(sys.argv[3]).write_text(''.join(line for line in lines if not line.startswith(skip)))
Path(sys.argv[2]).write_text(''.join(
 'CREATE ROLE "'+role+'" NOLOGIN;\n' for role in sorted(roles)))
print('PASS: staged ownership preserved, platform ACLs omitted only in isolated clone')
PY

phase="disposable-owner-roles"
docker exec -i "$name" psql -X -U postgres -v ON_ERROR_STOP=1 \
  -f /dev/stdin < "$tmp/roles.sql" >"$restore_log" 2>&1
phase="owner-clone-create"
docker exec "$name" createdb -U postgres -T template0 cp_native20_owner_clone
phase="pgcrypto-extension"
docker exec "$name" psql -X -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;' \
  >>"$restore_log" 2>&1
phase="staging-schema-restore"
if ! docker exec -i "$name" psql -X -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 --single-transaction -f /dev/stdin \
  < "$restore" >>"$restore_log" 2>&1; then
  echo 'BLOCKED: actual staging owner-preserving restore failed' >&2
  diagnose_failure 2
  exit 2
fi

phase="auth-ownership-verification"
docker exec -i "$name" psql -X -At -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 \
  < "$root/sql/acceptance/cp-native-app-autosync-20-owner-clone.sql"
phase="complete"
echo 'PASS: actual staging Auth schema/table/sequence ownership verified in isolated cluster'
if [[ "${CP23_DISPOSABLE_RUNTIME_PROBE:-}" == 1 ]]; then
  phase="disposable-auth-data-api"
  python3 "$root/scripts/cp-native-app-autosync-23-disposable-runtime.py" \
    --disposable "$envfile"
fi
echo 'NOT VERIFIED: staging GoTrue startup, signed new-module writer acceptance'
