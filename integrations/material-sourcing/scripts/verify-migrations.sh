#!/bin/sh
# Applies and rolls back only a newly created scratch database in the dedicated local container.
set -eu
cd "$(dirname "$0")/.."
container=supabase_db_material-sourcing-local
scratch="ms_cp01_verify_$$"
migration=supabase/migrations/20261127005325_material_sourcing_foundation.sql
down=supabase/rollback/20261127005325_material_sourcing_foundation.down.sql
lifecycle=supabase/migrations/20261127005740_material_sourcing_lifecycle_integrity.sql
lifecycle_down=supabase/rollback/20261127005740_material_sourcing_lifecycle_integrity.down.sql
docker exec "$container" createdb -U postgres "$scratch"
cleanup() { docker exec "$container" dropdb -U postgres "$scratch"; }
trap cleanup EXIT
apply() { docker exec -i "$container" psql -X -U postgres -d "$scratch" -v ON_ERROR_STOP=1 < "$1"; }
apply "$migration" >/dev/null
apply "$lifecycle" >/dev/null
apply supabase/migrations/20261127053020_bulk_operation_receipts.sql >/dev/null
apply supabase/seed.sql >/dev/null
apply supabase/tests/foundation.sql
apply supabase/tests/lifecycle.sql
echo "PASS clean migration and seed in independent scratch database"
apply supabase/rollback/20261127053020_bulk_operation_receipts.down.sql >/dev/null
apply "$lifecycle_down" >/dev/null
apply "$down" >/dev/null
test "$(docker exec "$container" psql -X -U postgres -d "$scratch" -Atc "select count(*) from pg_namespace where nspname='material_sourcing'")" = 0
echo "PASS rollback removed only the checkpoint schema in scratch database"
apply "$migration" >/dev/null
apply "$lifecycle" >/dev/null
apply supabase/migrations/20261127053020_bulk_operation_receipts.sql >/dev/null
apply supabase/seed.sql >/dev/null
apply supabase/tests/foundation.sql
apply supabase/tests/lifecycle.sql
echo "PASS migration reapplied and fixtures reverified"
test "$(docker exec "$container" psql -X -U postgres -d postgres -Atc "select count(*) from material_sourcing.materials")" = 7
echo "PASS main local fixture database remains intact"
