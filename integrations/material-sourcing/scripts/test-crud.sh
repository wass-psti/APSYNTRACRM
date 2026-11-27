#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
container=supabase_db_material-sourcing-local
scratch="ms_cp02_test_$$"
api_pid=""
preview_pid=""
docker exec "$container" createdb -U postgres "$scratch"
cleanup() {
  if [ -n "$preview_pid" ]; then kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true; fi
  if [ -n "$api_pid" ]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  docker exec "$container" dropdb -U postgres "$scratch"
}
trap cleanup EXIT
for f in supabase/migrations/*.sql supabase/seed.sql; do
 docker exec -i "$container" psql -X -U postgres -d "$scratch" -v ON_ERROR_STOP=1 < "$f" >/dev/null
done
MS_LOCAL_DATABASE="$scratch" MS_API_PORT=5182 node --experimental-strip-types server/localApi.ts >/tmp/ms-cp02-test-api.log 2>&1 &
api_pid=$!
MS_API_PORT=5182 node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort >/tmp/ms-cp02-test-preview.log 2>&1 &
preview_pid=$!
for i in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:4174/api/materials >/dev/null 2>&1; then break; fi
 sleep 1
done
curl -fsS http://127.0.0.1:4174/api/materials >/dev/null
if [ "${MS_PRICING_ONLY:-0}" = 1 ]; then
  MS_LOCAL_DATABASE="$scratch" node --experimental-strip-types tests/pricing-browser.mjs
elif [ "${MS_COLLAB_ONLY:-0}" = 1 ]; then
  node tests/collaboration-browser.mjs
elif [ "${MS_BULK_ONLY:-0}" = 1 ]; then
  MS_LOCAL_DATABASE="$scratch" node tests/bulk-browser.mjs
else
  node tests/crud-browser.mjs
fi
echo "PASS isolated scratch database verification"
# Optional restart proof: only the dedicated Material Sourcing container is restarted.
if [ "${MS_VERIFY_RESTART:-0}" = 1 ]; then
  docker restart "$container" >/dev/null
  for i in $(seq 1 30); do
    if docker exec "$container" pg_isready -U postgres -d "$scratch" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  # Fresh connections must recover the previously saved material and exact costs.
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:4174/api/materials >/tmp/ms-cp02-restart-readback.json 2>/dev/null; then break; fi
    sleep 1
  done
  node -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/ms-cp02-restart-readback.json","utf8")); const r=d.records.find(x=>x.material.name==="CP02-QA-RECOVER"); if(!r||r.costs.php!=="10.08")process.exit(1); console.log("PASS saved record and decimal cost after actual PostgreSQL restart")'
fi
