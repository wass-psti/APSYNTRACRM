#!/bin/sh
set -eu
# CP-FT-UI-06. All resources are disposable and use an isolated Docker network.
# No production Supabase credentials, customer tickets, or existing local stack.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CURRENT_PHT_YEAR=$(TZ=Asia/Manila date +%Y)
ID="cpft06-$$"
NETWORK="$ID-net"
DB="$ID-pg"
AUTH="$ID-auth"
REST="$ID-rest"
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
cleanup(){
 docker rm -f "$REST" "$AUTH" "$DB" >/dev/null 2>&1 || true
 docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

# The official mirrors serve the identical multi-platform manifests. Pin content
# and fall back only to the same image, never a different version or test fixture.
pull_verified_image(){
 primary="$1"
 fallback="$2"
 for image in "$primary" "$fallback"; do
  if docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >&2; then
   printf '%s\n' "$image"
   return 0
  fi
 done
 echo "FAIL: both verified registries unavailable for $primary" >&2
 return 1
}
GOTRUE_IMAGE=$(pull_verified_image \
 'docker.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b' \
 'public.ecr.aws/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b')
POSTGREST_IMAGE=$(pull_verified_image \
 'docker.io/postgrest/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df' \
 'public.ecr.aws/supabase/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df')

docker network create "$NETWORK" >/dev/null
docker run -d --rm --network "$NETWORK" --name "$DB" \
 -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:17-alpine >/dev/null
ready=0
i=0
while [ "$i" -lt 40 ]; do
 # The postgres:17 image starts a temporary socket-only server during initdb.
 # Require the final TCP listener to avoid racing the temporary server shutdown.
 if docker exec "$DB" pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; then ready=1;break;fi
 i=$((i+1));sleep 1
done
if [ "$ready" -ne 1 ];then echo "FAIL: disposable database did not become ready";exit 1;fi

docker cp "$ROOT/sql/tests/cp-ft-ui05-prerequisites.sql" "$DB:/tmp/prerequisites.sql"
docker cp "$ROOT/supabase/migrations/20260928034824_fueltrans_workspace_integration.sql" "$DB:/tmp/fueltrans-initial.sql"
docker cp "$ROOT/supabase/migrations/20260928035728_fueltrans_membership_identity.sql" "$DB:/tmp/fueltrans-identity.sql"
docker cp "$ROOT/supabase/migrations/20260928035850_fueltrans_notifications.sql" "$DB:/tmp/fueltrans-notifications.sql"
docker cp "$ROOT/supabase/migrations/20260928040345_fueltrans_admin_state_and_hardening.sql" "$DB:/tmp/fueltrans-hardening.sql"
docker cp "$ROOT/supabase/migrations/20260928041601_fueltrans_policy_hardening.sql" "$DB:/tmp/fueltrans-policies.sql"
docker cp "$ROOT/supabase/migrations/20260929005600_fueltrans_workspace_contract_guard.sql" "$DB:/tmp/fueltrans-contract.sql"
docker cp "$ROOT/supabase/migrations/20261123081039_cp_fueltrans_m7_ticket_number_allocator.sql" "$DB:/tmp/fueltrans-m7-numbering.sql"
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -f /tmp/prerequisites.sql \
 -f /tmp/fueltrans-initial.sql \
 -f /tmp/fueltrans-identity.sql \
 -f /tmp/fueltrans-notifications.sql \
 -f /tmp/fueltrans-hardening.sql \
 -f /tmp/fueltrans-policies.sql \
 -f /tmp/fueltrans-contract.sql

# Seed disposable pre-existing references so the migration proves it resumes the
# client/year high-water mark without rewriting old ticket identifiers.
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "insert into public.workspaces(id) values ('00000000-0000-4000-8000-000000000901')"
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "begin; set local session_replication_role = replica; insert into public.fueltrans_tickets (workspace_id,id,ticket_number,client_code,status,archived,payload,created_at,updated_at) values ('00000000-0000-4000-8000-000000000901','cpft06-seed-unioil','UNI-$CURRENT_PHT_YEAR-037','UNIOIL','Resolved',true,'{}'::jsonb,'2026-11-23T03:00:00Z','2026-11-23T03:00:00Z'),('00000000-0000-4000-8000-000000000901','cpft06-seed-aramco','ARA-$CURRENT_PHT_YEAR-012','ARAMCO','Resolved',true,'{}'::jsonb,'2026-11-23T03:00:00Z','2026-11-23T03:00:00Z'),('00000000-0000-4000-8000-000000000901','cpft06-seed-legacy','FTS-2026-00001','UNIOIL','Resolved',true,'{}'::jsonb,'2026-11-23T03:00:00Z','2026-11-23T03:00:00Z'); commit"
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -f /tmp/fueltrans-m7-numbering.sql
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "do \$\$ begin if (select last_value from private.fueltrans_ticket_number_counters where client_code='UNIOIL' and ticket_year=$CURRENT_PHT_YEAR) <> 37 then raise exception 'UNIOIL high-water seed failed'; end if; if (select last_value from private.fueltrans_ticket_number_counters where client_code='ARAMCO' and ticket_year=$CURRENT_PHT_YEAR) <> 12 then raise exception 'ARAMCO high-water seed failed'; end if; if (select ticket_number from public.fueltrans_tickets where id='cpft06-seed-legacy') <> 'FTS-2026-00001' then raise exception 'legacy ticket number was changed'; end if; if not (select relrowsecurity from pg_class where oid='private.fueltrans_ticket_number_counters'::regclass) then raise exception 'counter RLS is not enabled'; end if; if has_table_privilege('authenticated','private.fueltrans_ticket_number_counters','SELECT') or has_table_privilege('authenticated','private.fueltrans_ticket_number_counters','INSERT') then raise exception 'authenticated role can access private counters'; end if; if has_function_privilege('authenticated','private.fueltrans_assign_ticket_number()','EXECUTE') then raise exception 'authenticated role can execute trigger function directly'; end if; end \$\$"
echo 'FUELTRANS_M7_NUMBERING_MIGRATION_AND_LEGACY_PRESERVATION PASS'

# Existing test roles are not broadened; this is PostgREST's disposable connection role.
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "create role authenticator login password '$DB_PASSWORD'; grant authenticated, anon to authenticator;"

# Initialize GoTrue's own ephemeral auth schema using its pinned migration tooling.
# GoTrue queries auth identities with unqualified names; ensure the disposable
# DB role resolves auth tables first, as Supabase's dedicated Auth role does.
docker exec "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "alter role postgres in database postgres set search_path = auth, public;"

docker run --rm --network "$NETWORK" \
 -e DB_NAMESPACE=auth \
 -e GOTRUE_DB_DB_NAMESPACE=auth \
 -e DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e GOTRUE_DB_DRIVER=postgres \
 -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 \
 -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
 "$GOTRUE_IMAGE" auth migrate >/dev/null
echo 'ISOLATED_GOTRUE_SCHEMA_MIGRATED'

docker run -d --network "$NETWORK" --name "$AUTH" \
 -p 127.0.0.1::9999 \
 -e GOTRUE_DB_DRIVER=postgres \
 -e GOTRUE_DB_DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DB_NAMESPACE=auth \
 -e GOTRUE_DB_DB_NAMESPACE=auth \
 -e GOTRUE_API_HOST=0.0.0.0 \
 -e GOTRUE_API_PORT=9999 \
 -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 \
 -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
 -e GOTRUE_JWT_EXP=3600 \
 -e GOTRUE_JWT_AUD=authenticated \
 -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
 -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
 -e GOTRUE_DISABLE_SIGNUP=false \
 -e GOTRUE_MAILER_AUTOCONFIRM=true \
 "$GOTRUE_IMAGE" >/dev/null

docker run -d --network "$NETWORK" --name "$REST" \
 -p 127.0.0.1::3000 \
 -e PGRST_DB_URI="postgres://authenticator:$DB_PASSWORD@$DB:5432/postgres" \
 -e PGRST_DB_SCHEMAS=public \
 -e PGRST_DB_ANON_ROLE=anon \
 -e PGRST_JWT_SECRET="$JWT_SECRET" \
 -e PGRST_OPENAPI_SERVER_PROXY_URI=http://127.0.0.1 \
 "$POSTGREST_IMAGE" >/dev/null

auth_port=$(docker port "$AUTH" 9999/tcp | tail -1 | sed 's/.*://')
rest_port=$(docker port "$REST" 3000/tcp | tail -1 | sed 's/.*://')
if [ -z "$auth_port" ] || [ -z "$rest_port" ];then
 echo 'FAIL: isolated services have no loopback port'
 for service in "$AUTH" "$REST"; do
  echo "DIAGNOSTIC $service $(docker inspect --format '{{.State.Status}}' "$service" 2>/dev/null || echo missing)"
  docker logs --tail 16 "$service" 2>&1 | sed -E 's@postgres://[^ ]+@postgres://[redacted]@g;s/(password|secret|token)[=:][^ ]+/\1=[redacted]/gi' | tail -16
 done
 exit 1
fi

if node "$ROOT/scripts/cp-ft-ui06-two-session.mjs" "$auth_port" "$rest_port" "$DB"; then
 echo 'PASS: isolated GoTrue + PostgREST acceptance, all containers removed on exit'
else
 echo 'ISOLATED_AUTH_DIAGNOSTICS'
 docker logs --tail 22 "$AUTH" 2>&1 | sed -E 's@postgres://[^ ]+@postgres://[redacted]@g;s/(password|secret|token)[=:][^ ]+/\1=[redacted]/gi' | tail -22
 docker exec "$DB" psql -X -q -A -t -U postgres -c "select to_regclass('auth.users') is not null, to_regclass('auth.identities') is not null, count(*) from auth.users;" 2>&1 | tail -3
 exit 1
fi
