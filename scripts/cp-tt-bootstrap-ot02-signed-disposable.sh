#!/usr/bin/env bash
# Real isolated GoTrue JWT and PostgREST OT RPC acceptance; never contacts production.
# Official version-pinned Docker Hub mirrors bypass public ECR transfer quotas in CI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ID="cpttot02-$$"; NETWORK="$ID-net"; DB="$ID-pg"; AUTH="$ID-auth"; REST="$ID-rest"
PASSWORD="$(openssl rand -hex 24)"; JWT_SECRET="$(openssl rand -hex 48)"
cleanup(){ docker rm -f "$REST" "$AUTH" "$DB" >/dev/null 2>&1 || true; docker network rm "$NETWORK" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
command -v docker >/dev/null; command -v node >/dev/null
# All services are newly allocated, unshared, and bound exclusively to loopback.
docker network create "$NETWORK" >/dev/null
docker run -d --rm --name "$DB" --network "$NETWORK" -e POSTGRES_PASSWORD="$PASSWORD" -v "$ROOT:/repo:ro" postgres:17-alpine >/dev/null
for n in $(seq 1 40); do if docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres >/dev/null
# GoTrue owns auth.sessions; use actual signed sessions, not synthetic auth table rows.
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -c 'CREATE SCHEMA auth; ALTER ROLE postgres IN DATABASE postgres SET search_path=auth,public'
docker run --rm --network "$NETWORK" \
 -e DB_NAMESPACE=auth -e GOTRUE_DB_DB_NAMESPACE=auth \
 -e DATABASE_URL="postgres://postgres:$PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e GOTRUE_DB_DRIVER=postgres -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
 supabase/gotrue:v2.197.0 auth migrate >/dev/null
# Remove only fixture statements that would create duplicate Auth service-owned objects.
python3 - "$ROOT/sql/tests/cp-tt-ot02-disposable-setup.sql" > "/tmp/$ID-fixture.sql" <<'PY'
from pathlib import Path
import sys,re
s=Path(sys.argv[1]).read_text()
s=s.replace('CREATE SCHEMA auth;\n','')
s=s.replace('CREATE FUNCTION auth.jwt()', 'CREATE OR REPLACE FUNCTION auth.jwt()')
s=s.replace('CREATE FUNCTION auth.uid()', 'CREATE OR REPLACE FUNCTION auth.uid()')
s,n=re.subn(r'CREATE TABLE auth\.sessions\([\s\S]*?\);\nREVOKE ALL ON auth\.sessions FROM PUBLIC,authenticated,anon;\n','',s);assert n==1
s,n=re.subn(r'INSERT INTO auth\.sessions\(id,user_id,not_after\) VALUES\n[\s\S]*?;\n','',s);assert n==1
print(s)
PY
docker cp "/tmp/$ID-fixture.sql" "$DB:/tmp/ot-fixture.sql"; rm -f "/tmp/$ID-fixture.sql"
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -f /tmp/ot-fixture.sql
for migration in \
 sql/cp-tt-ot01-staged-bootstrap-approval.sql \
 supabase/migrations/20261123160000_cp_tt_manual_ot_01_manual_submission_and_scoped_review.sql \
 supabase/migrations/20261123170000_cp_tt_hr_ot_all_user_log_01.sql \
 supabase/migrations/20261123180000_cp_tt_bootstrap_ot_self_review_01.sql \
 supabase/migrations/20261124170000_cp_tt_ot_creator_withdrawal.sql; do
 docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -f "/repo/$migration"
done
# Exercise the new duration-OT DDL and guarded worker/snapshot patch in this
# same isolated PG17 database. The migration has an explicit disposable-only gate.
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres \
 -f /repo/sql/tests/cp-tt-duration-ot-prerequisites.sql
cat > "/tmp/$ID-duration-ot-apply.sql" <<'SQL'
SET apsyntra.test_disposable='on';
\i /repo/sql/cp-tt-duration-overtime-staged.sql
\i /repo/supabase/tests/tt_duration_overtime_staged.integration.sql
SQL
docker cp "/tmp/$ID-duration-ot-apply.sql" "$DB:/tmp/duration-ot-apply.sql"
rm -f "/tmp/$ID-duration-ot-apply.sql"
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -f /tmp/duration-ot-apply.sql
echo CP_TT_DURATION_OT_STAGED_SQL_PASS
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -c "CREATE ROLE authenticator LOGIN PASSWORD '$PASSWORD'; GRANT authenticated,anon TO authenticator; GRANT USAGE ON SCHEMA public TO authenticator,authenticated;"
docker run -d --rm --name "$AUTH" --network "$NETWORK" -p 127.0.0.1::9999 \
 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://postgres:$PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DATABASE_URL="postgres://postgres:$PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DB_NAMESPACE=auth -e GOTRUE_DB_DB_NAMESPACE=auth -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
 -e API_EXTERNAL_URL=http://127.0.0.1:9999 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 \
 -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_KEYS='[]' -e GOTRUE_JWT_EXP=3600 \
 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
 -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true \
 supabase/gotrue:v2.197.0 >/dev/null
docker run -d --rm --name "$REST" --network "$NETWORK" -p 127.0.0.1::3000 \
 -e PGRST_DB_URI="postgres://authenticator:$PASSWORD@$DB:5432/postgres" \
 -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
 postgrest/postgrest:v16.4 >/dev/null
AUTH_PORT="$(docker port "$AUTH" 9999/tcp | tail -1 | sed 's/.*://')"
REST_PORT="$(docker port "$REST" 3000/tcp | tail -1 | sed 's/.*://')"
if ! CP_TT_OT03_BROWSER="${CP_TT_OT03_BROWSER:-0}" node "$ROOT/scripts/cp-tt-bootstrap-ot02-signed-disposable.mjs" "$AUTH_PORT" "$REST_PORT" "$DB"; then
 echo 'ISOLATED_RUNTIME_DIAGNOSTICS (sanitized)'
 docker logs --tail 8 "$AUTH" 2>&1 | sed -E 's@postgres://[^ ]+@postgres://[redacted]@g;s/(password|secret|token)[=:][^ ]+/\1=[redacted]/gi'
 exit 1
fi
echo CP_TT_BOOTSTRAP_OT02_SIGNED_DISPOSABLE_PASS
