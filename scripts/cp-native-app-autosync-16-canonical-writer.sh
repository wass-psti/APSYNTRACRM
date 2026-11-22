#!/usr/bin/env bash
# CP16: existing canonical writer + tables activated ONLY in the disposable clone.
# Source is the installed local CRM PostgreSQL schema, not an invented contract.
set -euo pipefail
container="${1:-}"
clone="${2:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$container" != 'supabase_db_cp16019-disposable-local' ||
      "$clone" != 'cp_native15_staging_clone' ||
      "${CP16_LOCAL_WRITER_PROBE:-}" != '1' ]]; then
  echo 'BLOCKED: CP16 is restricted to the CP15 disposable staging clone' >&2
  exit 2
fi
if ! docker exec "$container" psql -X -U postgres -d "$clone" -Atqc \
  "SELECT to_regclass('public.module_role_assignments') IS NULL AND
          to_regclass('public.wm_workspace_application_roles') IS NULL" |
  grep -qx t; then
 echo 'BLOCKED: canonical writer cannot overwrite existing backend' >&2
 exit 2
fi
tmp="$(mktemp -d /tmp/cp-native16.XXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT

# Preserve the exact canonical table/constraint/index/RLS source. Drop only the
# local audit trigger declaration until its original function is installed.
docker exec "$container" pg_dump -U postgres -d postgres --schema-only \
 --no-owner --no-acl \
 -t public.wm_workspace_application_roles -t public.wm_application_role_audit \
 >"$tmp/source.sql"
python3 - "$tmp/source.sql" "$tmp/tables.sql" <<'PY'
from pathlib import Path
import re
import sys
source=Path(sys.argv[1]).read_text()
needle='CREATE TRIGGER wm_application_audit_immutable '
if source.count(needle)!=1:
 raise SystemExit('Canonical audit trigger source changed')
source=re.sub(r'^CREATE TRIGGER wm_application_audit_immutable .*?;\n','',source,flags=re.M)
Path(sys.argv[2]).write_text(source)
PY

# Existing public.profiles lacks the single required CRM platform_role field.
# This is ADDITIVE only in the isolated, empty-from-source staging clone.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
 -c "ALTER TABLE public.profiles ADD COLUMN platform_role text NOT NULL DEFAULT 'employee'
  CHECK(platform_role IN('admin_general_manager','hr','supervisor','employee'))" >/dev/null
cat "$tmp/tables.sql" | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
 -U postgres -d "$clone" >"$tmp/tables.log"

# Use original installed CRM routines, including its workspace-admin validation,
# audit immutability, existing module role whitelist and transaction behavior.
docker exec "$container" psql -X -U postgres -d postgres -Atqc "
 SELECT pg_get_functiondef(p.oid)||';'||E'\n'
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('is_platform_admin','wm_reject_application_audit_mutation','wm_admin_set_application_role')
 ORDER BY CASE p.proname WHEN 'is_platform_admin' THEN 1
 WHEN 'wm_reject_application_audit_mutation' THEN 2 ELSE 3 END;" >"$tmp/functions.sql"
if [[ "$(grep -c 'CREATE OR REPLACE FUNCTION public.' "$tmp/functions.sql")" != 3 ]]; then
 echo 'BLOCKED: original canonical writer dependencies unavailable' >&2
 exit 2
fi
cat "$tmp/functions.sql" | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
 -U postgres -d "$clone" >"$tmp/functions.log"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
 -c 'CREATE TRIGGER wm_application_audit_immutable BEFORE DELETE OR UPDATE
 ON public.wm_application_role_audit FOR EACH ROW
 EXECUTE FUNCTION public.wm_reject_application_audit_mutation()' >/dev/null

for step in assign readback update deny revoke final; do
 docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
 -f /dev/stdin < "$root/sql/acceptance/cp-native-app-autosync-16-$step.sql" >"$tmp/$step.log"
 echo "PASS: canonical TimeTracker writer $step separate SQL connection"
done
echo 'NOT VERIFIED: real signed Auth sessions or arbitrary new-module writer'
