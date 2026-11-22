#!/usr/bin/env bash
# CP15: export the EXISTING nonproduction Supabase staging schema (NO ROW DATA).
# Restore only to a fresh local disposable PostgreSQL database, verify its real
# relationship contracts and remove the entire fixture. No remote database writes.
set -euo pipefail
umask 077

readonly container="supabase_db_cp16019-disposable-local"
readonly staging_project="jeqwjlxubntsddeauvqa"
readonly clone="cp_native15_staging_clone"
readonly root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly lock="/tmp/cp_native15_staging_clone.lock"
if ! mkdir "$lock" 2>/dev/null; then
  echo 'BLOCKED: CP15 clone is already running' >&2
  exit 2
fi

created=false
tmp_dir=""
cleanup() {
  if [[ "$created" == true ]]; then
    docker exec "$container" dropdb -U postgres "$clone" >/dev/null ||
      echo 'CLEANUP REQUIRED: disposable clone could not be removed' >&2
  fi
  if [[ -n "$tmp_dir" && -d "$tmp_dir" ]]; then
    rm -rf -- "$tmp_dir"
  fi
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo 'BLOCKED: approved local disposable container is not running' >&2
  exit 2
fi
if [[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atqc   "SELECT count(*) FROM pg_database WHERE datname='$clone'")" != 0 ]]; then
  echo 'BLOCKED: clone already exists; refusing to overwrite it' >&2
  exit 2
fi

tmp_dir="$(mktemp -d /tmp/cp-native15.XXXXXX)"
readonly original="$tmp_dir/staging-original.sql"
readonly neutral="$tmp_dir/staging-local-neutral.sql"
readonly restore_log="$tmp_dir/restore.log"

# Supabase OAuth CLI reads only the existing staging database schema.
# The exported schema is never committed, printed or retained.
cd "$root"
supabase db dump --project-ref "$staging_project" \
  --schema auth,public,private,extensions \
  --file "$original" --yes --log-level error >/dev/null
chmod 600 "$original"

python3 - "$original" "$neutral" <<'PY'
import re
import sys
from pathlib import Path
original = Path(sys.argv[1])
output = Path(sys.argv[2])
lines = original.read_text().splitlines(keepends=True)
owner_lines = [line for line in lines
               if line.startswith('ALTER ') and ' OWNER TO ' in line]
default_lines = [line for line in lines
                 if line.startswith('ALTER DEFAULT PRIVILEGES ')]
if len(owner_lines) != 78 or len(default_lines) != 12:
    raise SystemExit('BLOCKED: staging owner/default privilege footprint changed')
if len(re.findall(r'^CREATE TABLE IF NOT EXISTS ', ''.join(lines), re.M)) != 41:
    raise SystemExit('BLOCKED: staging table inventory changed')
output.write_text(''.join(line for line in lines
    if line not in owner_lines and line not in default_lines))
output.chmod(0o600)
print('PASS: actual staging schema exported; 78 managed owner and 12 default '
      'privilege statements omitted from local restore only')
PY

docker exec "$container" createdb -U postgres -T template0 "$clone"
created=true
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
  -c 'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;' \
  >"$restore_log"
if ! cat "$neutral" | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
    --single-transaction -U postgres -d "$clone" >>"$restore_log" 2>&1; then
  echo 'FAILED: actual staging schema restore (see local restore log)' >&2
  tail -5 "$restore_log" >&2
  exit 1
fi

# Check exact observed schema and RLS topology, not a representative subset.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
  -f /dev/stdin <<'SQL' >/dev/null
DO $verify$
DECLARE actual record;
BEGIN
 FOR actual IN
  SELECT n.nspname, COUNT(*) FILTER(WHERE c.relkind='r')::int AS tables,
    COUNT(*) FILTER(WHERE c.relkind='r' AND c.relrowsecurity)::int AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('auth','public','private')
  GROUP BY n.nspname
 LOOP
  IF NOT ((actual.nspname='auth' AND actual.tables=27 AND actual.rls=16)
       OR (actual.nspname='private' AND actual.tables=11 AND actual.rls=11)
       OR (actual.nspname='public' AND actual.tables=3 AND actual.rls=3)) THEN
    RAISE EXCEPTION 'Staging schema mismatch in %: % tables, % RLS',
      actual.nspname,actual.tables,actual.rls;
  END IF;
 END LOOP;
 IF (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('auth','public','private'))<>17 THEN
   RAISE EXCEPTION 'Staging application/Auth function count mismatch';
 END IF;
 IF (SELECT COUNT(*) FROM pg_constraint co
     JOIN pg_class c ON c.oid=co.conrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname IN ('private','public'))<>57 THEN
   RAISE EXCEPTION 'Staging public/private constraint count mismatch';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users) OR
    EXISTS(SELECT 1 FROM public.workspace_members) THEN
   RAISE EXCEPTION 'Schema-only clone accidentally contains real user data';
 END IF;
 IF to_regclass('public.module_role_assignments') IS NOT NULL OR
    to_regclass('public.work_boards') IS NOT NULL THEN
   RAISE EXCEPTION 'Unexpected CRM role/boards activation in existing staging';
 END IF;
END $verify$;
SQL
echo 'PASS: actual staging tables, RLS, functions, constraints and no-data clone verified'
# Fingerprints are a verified read-only snapshot of live staging on 2026-11-22.
# A changed schema must be re-reviewed rather than silently accepted.
fingerprint="$(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
 -U postgres -d "$clone" -At -F '|' -f /dev/stdin \
 < "$root/sql/acceptance/cp-native-app-autosync-15-schema-fingerprint.sql")"
# Exact metadata fingerprint from live staging, except the one documented
# associative-AND parenthesis normalization in a private CHECK constraint.
expected='e37703b8877f3e3e8239a80b0ef7d6df|1c402e6eb26ffc937429fb6a0e496eb4|5d16ab869542c2eae5bb968d125f2d62|efcc5ea2f1dffd7075f8513a313a7557'
if [[ "$fingerprint" != "$expected" ]]; then
  echo 'BLOCKED: staging schema changed; review the metadata fingerprint' >&2
  exit 2
fi
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$clone" -f /dev/stdin \
  < "$root/sql/acceptance/cp-native-app-autosync-15-constraint-normalization.sql" \
  >"$restore_log"
echo 'PASS: source-compatible schema fingerprint and known check normalization'

# Three DISTINCT PostgreSQL sessions: synthetic users cannot sign in.
# The clone is destroyed unconditionally, even when any test fails.
for stage in fixture update readback; do
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$clone" -f /dev/stdin \
    < "$root/sql/acceptance/cp-native-app-autosync-15-staging-clone-$stage.sql" \
    >"$restore_log"
  echo "PASS: actual staging-schema $stage SQL connection"
done
if [[ "${CP16_LOCAL_WRITER_PROBE:-}" == 1 ]]; then
  bash "$root/scripts/cp-native-app-autosync-16-canonical-writer.sh" "$container" "$clone"
fi
echo 'NOT VERIFIED: signed Auth sessions, CRM new-module writer, browser persistence'
