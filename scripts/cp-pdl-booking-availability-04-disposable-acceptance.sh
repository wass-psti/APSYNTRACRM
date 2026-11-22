#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="supabase_db_cp16019-disposable-local"
ACCEPTANCE="$ROOT/supabase/pdl-booking/acceptance/pdl_booking_availability_04_disposable.sql"
TMP_SQL="$(mktemp)"
trap 'rm -f "$TMP_SQL"' EXIT

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "BLOCKED: expected dedicated disposable database container is not running: $CONTAINER" >&2
  exit 2
fi

IDENTITY="$(docker exec "$CONTAINER" psql -X -U postgres -d postgres -Atc \
  "select current_database() || '|' || current_setting('server_version_num') || '|' || coalesce(to_regclass('auth.users')::text,'missing') || '|' || coalesce(to_regclass('storage.buckets')::text,'missing')")"
if [[ "$IDENTITY" != postgres\|17*\|auth.users\|storage.buckets ]]; then
  echo "BLOCKED: disposable Supabase PostgreSQL identity/prerequisites did not match: $IDENTITY" >&2
  exit 2
fi

printf 'begin;\n' > "$TMP_SQL"
while IFS= read -r migration; do
  cat "$migration" >> "$TMP_SQL"
  printf '\n' >> "$TMP_SQL"
done < <(find "$ROOT/supabase/pdl-booking/source/migrations" -maxdepth 1 -name '*.sql' -type f | sort)
sed 's/^begin;$/-- transaction is opened by this disposable runner/' "$ACCEPTANCE" >> "$TMP_SQL"
printf "select case when to_regclass('pdl_booking.reservations') is null then 'ROLLBACK_CONFIRMED' else 'ROLLBACK_FAILED' end;\n" >> "$TMP_SQL"

echo "Running all Paseo migrations and CP04 acceptance inside one disposable PostgreSQL 17 transaction."
docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$TMP_SQL"

POSTCHECK="$(docker exec "$CONTAINER" psql -X -U postgres -d postgres -Atc \
  "select case when to_regclass('pdl_booking.reservations') is null then 'CLEAN' else 'DIRTY' end")"
if [[ "$POSTCHECK" != "CLEAN" ]]; then
  echo "FAILED: PDL test schema remained after rollback." >&2
  exit 1
fi

echo "PASS: CP04 database acceptance completed; PDL schema and all test data rolled back."
