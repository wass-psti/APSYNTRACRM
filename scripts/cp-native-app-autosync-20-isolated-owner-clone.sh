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
cleanup() {
  if [[ "$created" == true ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$tmp" && -d "$tmp" ]]; then
    rm -rf -- "$tmp"
  fi
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
  echo 'BLOCKED: CP20 container exists; refusing overwrite' >&2
  exit 2
fi
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo 'BLOCKED: preinstalled PostgreSQL 17 image unavailable' >&2
  exit 2
fi
tmp="$(mktemp -d /tmp/cp-native20.XXXXXX)"
readonly dump="$tmp/staging-schema.sql"
readonly restore="$tmp/staging-owner-restore.sql"
readonly envfile="$tmp/pg.env"
readonly restore_log="$tmp/restore.log"

# Generate a one-use password and never print or commit it.
python3 - "$envfile" <<'PY'
from pathlib import Path
import secrets,sys
path=Path(sys.argv[1])
path.write_text("POSTGRES_PASSWORD="+secrets.token_urlsafe(48)+"\n")
path.chmod(0o600)
PY

# The new PG server is not published to the host or any Docker network.
docker run -d --name "$name" --network none --env-file "$envfile" "$image" >/dev/null
created=true
for attempt in $(seq 1 35); do
  if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.3
done
docker exec "$name" pg_isready -U postgres >/dev/null
echo 'PASS: independent PostgreSQL 17 initialized without external networking'

cd "$root"
supabase db dump --project-ref "$project" \
  --schema auth,public,private,extensions \
  --file "$dump" --yes --log-level error >"$restore_log" 2>&1
chmod 600 "$dump"

# Restore the exact original staged ownership statements into a separate
# cluster. Local role shells are NOLOGIN and have no global elevated privileges.
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

docker exec -i "$name" psql -X -U postgres -v ON_ERROR_STOP=1 \
  -f /dev/stdin < "$tmp/roles.sql" >"$restore_log" 2>&1
docker exec "$name" createdb -U postgres -T template0 cp_native20_owner_clone
docker exec "$name" psql -X -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;' \
  >>"$restore_log" 2>&1
if ! docker exec -i "$name" psql -X -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 --single-transaction -f /dev/stdin \
  < "$restore" >>"$restore_log" 2>&1; then
  echo 'BLOCKED: actual staging owner-preserving restore failed' >&2
  tail -7 "$restore_log" | sed -E 's/(password|secret|token)=[^ ]+/\1=[REDACTED]/gi' >&2
  exit 2
fi

docker exec -i "$name" psql -X -At -U postgres -d cp_native20_owner_clone \
  -v ON_ERROR_STOP=1 \
  < "$root/sql/acceptance/cp-native-app-autosync-20-owner-clone.sql"
echo 'PASS: actual staging Auth schema/table/sequence ownership verified in isolated cluster'
echo 'NOT VERIFIED: staging GoTrue startup, signed new-module writer acceptance'
