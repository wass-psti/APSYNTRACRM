#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/frontend/apps/Paseo/source"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/pdl-cp02.XXXXXX")"
PROJECT_ID="pdl-cp02-$(date +%s)-$$"
API_PORT=56321 DB_PORT=56322 SHADOW_PORT=56320
STUDIO_PORT=56323 INBUCKET_PORT=56324 REALTIME_PORT=56325 INSPECTOR_PORT=56329
WEB_PORT=5178 EDGE_PID="" VITE_PID=""
cleanup() {
  local status=$?
  [[ -z "$VITE_PID" ]] || kill "$VITE_PID" >/dev/null 2>&1 || true
  [[ -z "$EDGE_PID" ]] || kill "$EDGE_PID" >/dev/null 2>&1 || true
  supabase stop --workdir "$WORKDIR" --no-backup >/dev/null 2>&1 || true
  if [[ "${PDL_CP02_KEEP_ENV:-0}" == "1" ]]; then echo "CP02 logs retained at $WORKDIR"; else rm -rf "$WORKDIR"; fi
  exit "$status"
}
trap cleanup EXIT INT TERM
for command in docker supabase psql node npm curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 2; }
done

mkdir -p "$WORKDIR/supabase/migrations" "$WORKDIR/supabase/functions/pdl-guest-api"
cp "$ROOT"/supabase/pdl-booking/source/migrations/*.sql "$WORKDIR/supabase/migrations/"
cp "$ROOT/supabase/pdl-booking/source/functions/pdl-guest-api/index.ts" "$WORKDIR/supabase/functions/pdl-guest-api/index.ts"

cat > "$WORKDIR/supabase/config.toml" <<EOF
project_id = "$PROJECT_ID"
[api]
enabled = true
port = $API_PORT
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = $DB_PORT
shadow_port = $SHADOW_PORT
major_version = 17
[db.pooler]
enabled = false
[studio]
enabled = true
port = $STUDIO_PORT
[inbucket]
enabled = true
port = $INBUCKET_PORT
[realtime]
enabled = true
port = $REALTIME_PORT
[storage]
enabled = true
file_size_limit = "50MiB"
[edge_runtime]
enabled = true
policy = "per_worker"
inspector_port = $INSPECTOR_PORT
[analytics]
enabled = false
[functions.pdl-guest-api]
enabled = true
verify_jwt = false
EOF

echo "Starting isolated local Supabase project $PROJECT_ID"
supabase start --workdir "$WORKDIR"
supabase db reset --workdir "$WORKDIR" --local
supabase status --workdir "$WORKDIR" -o env > "$WORKDIR/supabase.env"
read_env() { sed -n "s/^$1=\"\\(.*\\)\"$/\\1/p" "$WORKDIR/supabase.env" | head -n 1; }
API_URL="$(read_env API_URL)"
DB_URL="$(read_env DB_URL)"
ANON_KEY="$(read_env ANON_KEY)"
SERVICE_ROLE_KEY="$(read_env SERVICE_ROLE_KEY)"
for value in "$API_URL" "$DB_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY"; do
  [[ -n "$value" ]] || { echo "Incomplete local Supabase status." >&2; exit 1; }
done
[[ "$API_URL" == "http://127.0.0.1:$API_PORT" || "$API_URL" == "http://localhost:$API_PORT" ]] || {
  echo "Refusing unexpected nonlocal Supabase URL: $API_URL" >&2; exit 1;
}

node - "$WORKDIR/qr.png" <<'NODE'
const fs = require("node:fs");
fs.writeFileSync(process.argv[2], Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/x7sAAAAASUVORK5CYII=",
  "base64",
));
NODE
upload_qr() {
  local path="$1"
  curl --fail --silent --show-error --request POST \
    "$API_URL/storage/v1/object/pdl-payment-qr/$path" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: image/png" -H "x-upsert: true" \
    --data-binary "@$WORKDIR/qr.png" >/dev/null
}
upload_qr "gcash/00000000-0000-4000-8000-000000000001.png"
upload_qr "maya/00000000-0000-4000-8000-000000000002.png"
upload_qr "bpi/00000000-0000-4000-8000-000000000003.png"

cat > "$WORKDIR/seed.sql" <<'SQL'
begin;
update pdl_booking.courts set enabled=true,open_minute=480,close_minute=1440,updated_at=now();
insert into pdl_booking.weekday_hours(court_code,weekday,enabled,open_minute,close_minute)
select c.code,d.weekday,true,480,1440 from pdl_booking.courts c cross join generate_series(0,6) d(weekday)
on conflict(court_code,weekday) do update set enabled=excluded.enabled,open_minute=excluded.open_minute,close_minute=excluded.close_minute;
insert into pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
select c.code,d.duration,case d.duration when 60 then 15000 when 90 then 22500 else 30000 end,true
from pdl_booking.courts c cross join (values(60),(90),(120)) d(duration)
on conflict(court_code,duration_minutes) do update set amount_minor=excluded.amount_minor,enabled=excluded.enabled,updated_at=now();
update pdl_booking.payment_methods set
 recipient=case method when 'gcash' then 'CP02 TEST GCash Recipient' when 'maya' then 'CP02 TEST Maya Recipient' else 'CP02 TEST BPI Recipient' end,
 qr_object_path=case method
 when 'gcash' then 'gcash/00000000-0000-4000-8000-000000000001.png'
 when 'maya' then 'maya/00000000-0000-4000-8000-000000000002.png'
 else 'bpi/00000000-0000-4000-8000-000000000003.png' end, updated_at=now();
do $$ begin
 if (select count(*) from pdl_booking.courts where enabled)<>3 then raise exception 'Expected three courts'; end if;
 if (select count(*) from pdl_booking.rates where enabled)<>9 then raise exception 'Expected nine rates'; end if;
 if (select count(*) from pdl_booking.payment_methods where qr_object_path is not null)<>3 then raise exception 'Expected three QR paths'; end if;
end $$;
commit;
SQL
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$WORKDIR/seed.sql"

cat > "$WORKDIR/edge.env" <<EOF
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
PDL_ALLOWED_ORIGINS=http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT
EOF
API_BASE="$API_URL/functions/v1/pdl-guest-api"
supabase functions serve pdl-guest-api --workdir "$WORKDIR" --env-file "$WORKDIR/edge.env" --no-verify-jwt > "$WORKDIR/edge.log" 2>&1 &
EDGE_PID=$!
for attempt in $(seq 1 90); do
  curl --fail --silent "$API_BASE/v1/health" >/dev/null 2>&1 && break
  sleep 1
done
curl --fail --silent "$API_BASE/v1/health" >/dev/null || { tail -n 80 "$WORKDIR/edge.log"; exit 1; }

(
 cd "$SOURCE"
 VITE_RESERVATION_API_BASE_URL=/api VITE_STAGING_ONLY=1 PDL_ENABLE_STAGING_PROXY=1 \
 PDL_STAGING_PROXY_TARGET="$API_BASE" PDL_STAGING_PROXY_REWRITE_API_PREFIX=1 \
 npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort
) > "$WORKDIR/vite.log" 2>&1 &
VITE_PID=$!
for attempt in $(seq 1 60); do
  curl --fail --silent "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break
  sleep 1
done
curl --fail --silent "http://127.0.0.1:$WEB_PORT/" >/dev/null || { tail -n 80 "$WORKDIR/vite.log"; exit 1; }

(
 cd "$SOURCE"
 CP02_API_BASE_URL="$API_BASE" SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
 DATABASE_URL="$DB_URL" CP02_WEB_BASE_URL="http://127.0.0.1:$WEB_PORT" \
 node "$SOURCE/scripts/pdl-cp02-acceptance.mjs"
)
(
 cd "$SOURCE"
 npm test
 npm run typecheck
 npm run build
)
git -C "$ROOT" diff --check
echo "PASS CP-PDL-GUEST-EXPERIENCE-02 disposable API, PostgreSQL, Storage, browser, tests and build."
