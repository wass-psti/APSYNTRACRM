#!/usr/bin/env bash
# Disposable PostgreSQL + GoTrue + PostgREST. Never connect to a linked project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MANIFEST="${1:?Pass the private local compatibility manifest}"
ID="cpoi02f-$$"; NET="$ID-net"; DB="$ID-pg"; AUTH="$ID-auth"; REST="$ID-rest"
umask 077
TMP=$(mktemp -d "${TMPDIR:-/tmp}/cpoi02f-XXXXXX")
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
cleanup(){ docker rm -fv "$REST" "$AUTH" "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create "$NET" >/dev/null
docker run --pull never -d --rm --network "$NET" --name "$DB" -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:17-alpine >/dev/null
for i in $(seq 1 40); do
 if docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
run(){ docker exec -i "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
run < sql/tests/cp-oi-native-02f-prerequisites.sql
run < supabase/migrations/20261019112718_m195_order_intake_readonly_foundation.sql
run < supabase/migrations/20261124075640_cp_oi_native_02f_legacy_read.sql
# Optional CP03 mutation rehearsal: original deployed RPCs, fixture-only helpers.
if [ "${OI_VERIFY_MUTATIONS:-0}" = 1 ]; then
 run <<'SQL'
CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,active boolean);
CREATE FUNCTION public.is_platform_admin(actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT allowed FROM public.fixture_access WHERE user_id=actor),false)
$$;
SQL
 run < supabase/migrations/20261020022044_m19511_order_intake_create_rpc_permission_disabled.sql
 run < supabase/migrations/20261022093930_order_intake_update_details_authorized_20261022.sql
 run < supabase/migrations/20261023032352_order_intake_idempotent_create.sql
 run < supabase/migrations/20261021064459_order_intake_status_and_archive_lifecycle_default_deny_20261021.sql
 run < supabase/migrations/20261021064529_order_intake_lifecycle_audit_contract_correction_20261021.sql
 run < supabase/migrations/20261021064556_order_intake_status_archive_authenticated_activation_20261021.sql
 run < supabase/migrations/20261022093333_order_intake_restore_authorized_revision_20261022.sql
fi

run <<'SQL'
INSERT INTO public.order_intake_orders(workspace_id,po_number,client_name,po_date,date_received,delivery_date,currency,po_amount,vat_rate,vat_exclusive_amount,vat_amount,procurement_expenses,gross_profit,status,company,industry,fiscal_year)
VALUES ('00000000-0000-4000-8000-000000000001','CP02F-FIXTURE','Fixture','2026-01-01','2026-01-02','2026-01-03','PHP',100,12,89.29,10.71,5,84.29,'Processed','Fixture','Fixture',2026),
('00000000-0000-4000-8000-000000000001','CP02F-ARCHIVED','Fixture','2026-01-01','2026-01-02','2026-01-03','PHP',100,12,89.29,10.71,5,84.29,'Processed','Fixture','Fixture',2026);
UPDATE public.order_intake_orders SET archived=true,archived_at=now() WHERE po_number='CP02F-ARCHIVED';
SQL
# Readback includes the whole payload; replay must not duplicate or update it.
python3 scripts/order-intake-import/postgres-rehearsal-input.py "$MANIFEST" | run
python3 scripts/order-intake-import/postgres-rehearsal-input.py "$MANIFEST" | run
run <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.order_intake_legacy_orders)<>909 THEN RAISE EXCEPTION 'Legacy count mismatch'; END IF;
 IF (SELECT count(*) FROM public.order_intake_orders)<>2 THEN RAISE EXCEPTION 'Native count mismatch'; END IF;
 IF (SELECT count(*) FROM public.order_intake_legacy_orders WHERE payload->'sourceArchiveState'='null'::jsonb)<>909 THEN RAISE EXCEPTION 'Archive state mismatch'; END IF;
 IF (SELECT count(*) FROM public.order_intake_legacy_orders WHERE payload#>>'{values,currency}' IS NULL)<>728 THEN RAISE EXCEPTION 'Currency mismatch'; END IF;
 IF has_table_privilege('authenticated','public.order_intake_legacy_orders','INSERT') OR has_table_privilege('anon','public.order_intake_registry','SELECT') THEN RAISE EXCEPTION 'Unexpected grants'; END IF;
END $$;
SQL
printf 'PASS: PostgreSQL persistence, complete payload replay, existing native rows unchanged\n'
# Rehearse rollback inside this disposable database only. Keep the original
# snapshot intact even after a batch removal is attempted.
run <<'SQL'
BEGIN;
DELETE FROM public.order_intake_legacy_orders;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.order_intake_legacy_orders) THEN RAISE EXCEPTION 'Rollback rehearsal setup failed'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.order_intake_legacy_orders)<>909 THEN RAISE EXCEPTION 'Rollback failed'; END IF;
END $$;
SQL
python3 scripts/order-intake-import/postgres-rehearsal-input.py "$MANIFEST" | run
printf 'PASS: transaction rollback and exact snapshot readback\n'
# Negative import cases use temporary copies only, never change the reviewed source.
python3 - "$MANIFEST" "$TMP" <<'PY_FIXTURE'
import json, sys
from pathlib import Path
source=Path(sys.argv[1])
folder=Path(sys.argv[2])
for filename, field, value in (
    ("changed.json", "notes", "disposable changed-payload fixture"),
    ("collision.json", "poNumber", "CP02F-FIXTURE"),
):
    manifest=json.loads(source.read_bytes())
    manifest["records"][0]["values"][field]=value
    (folder/filename).write_text(json.dumps(manifest))
PY_FIXTURE
if python3 scripts/order-intake-import/postgres-rehearsal-input.py "$TMP/changed.json" | run > "$TMP/changed.log" 2>&1; then
 echo 'FAIL: changed payload accepted'; exit 1
fi
grep -q 'Changed source payload' "$TMP/changed.log"
if python3 scripts/order-intake-import/postgres-rehearsal-input.py "$TMP/collision.json" | run > "$TMP/collision.log" 2>&1; then
 echo 'FAIL: native PO collision accepted'; exit 1
fi
grep -q 'Native PO collision' "$TMP/collision.log"
python3 scripts/order-intake-import/postgres-rehearsal-input.py "$MANIFEST" | run
printf 'PASS: changed payload and native PO collision rejected; exact replay preserved\n'


run <<SQL
CREATE ROLE authenticator LOGIN PASSWORD '$DB_PASSWORD';
GRANT authenticated,anon TO authenticator;
ALTER ROLE postgres IN DATABASE postgres SET search_path=auth,public;
SQL
docker run --pull never --rm --network "$NET" \
 -e DB_NAMESPACE=auth -e GOTRUE_DB_DB_NAMESPACE=auth \
 -e DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e GOTRUE_DB_DRIVER=postgres -e API_EXTERNAL_URL=http://127.0.0.1:9999 \
 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
 public.ecr.aws/supabase/gotrue:v2.197.0 auth migrate >/dev/null 2>&1
docker run --pull never -d --network "$NET" --name "$AUTH" -p 127.0.0.1::9999 \
 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DATABASE_URL="postgres://postgres:$DB_PASSWORD@$DB:5432/postgres?sslmode=disable" \
 -e DB_NAMESPACE=auth -e GOTRUE_DB_DB_NAMESPACE=auth -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
 -e API_EXTERNAL_URL=http://127.0.0.1:9999 -e GOTRUE_SITE_URL=http://127.0.0.1:9999 \
 -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
 -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
 -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true \
 public.ecr.aws/supabase/gotrue:v2.197.0 >/dev/null
docker run --pull never -d --network "$NET" --name "$REST" -p 127.0.0.1::3000 \
 -e PGRST_DB_URI="postgres://authenticator:$DB_PASSWORD@$DB:5432/postgres" \
 -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
 public.ecr.aws/supabase/postgrest:v16.4 >/dev/null
auth_port=$(docker port "$AUTH" 9999/tcp | tail -1 | sed 's/.*://')
rest_port=$(docker port "$REST" 3000/tcp | tail -1 | sed 's/.*://')
node scripts/cp-oi-native-02f-signed.mjs "$auth_port" "$rest_port" "$DB" "$MANIFEST"
printf 'PASS: disposable signed acceptance; cleanup on exit\n'
