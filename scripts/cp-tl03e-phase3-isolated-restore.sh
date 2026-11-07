#!/usr/bin/env bash
# CP-TL-03E Phase 3: synthetic-only isolated PostgreSQL 17 restore rehearsal.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test -n "${PG_CONTAINER:-}"
test "${PGDATABASE:-}" = cp_tl03e_recovery_source
test "${PGHOST:-}" = 127.0.0.1
test "$(docker inspect --format '{{.Config.Image}}' "$PG_CONTAINER")" = postgres:17

SOURCE=cp_tl03e_recovery_source
TARGET=cp_tl03e_recovery_restored
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
started="$(date +%s)"
mkdir -p "$temporary/storage-original/synthetic" "$temporary/storage-recovered"
printf 'synthetic-storage-object-no-production-data\n' > "$temporary/storage-original/synthetic/fixture.txt"
sha="$(sha256sum "$temporary/storage-original/synthetic/fixture.txt" | awk '{print $1}')"

dbsql() { local database="$1"; shift; docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"; }
dbsql "$SOURCE" -v storage_sha="$sha" < sql/tests/cp-tl03e-phase3-synthetic-restore-fixture.sql
docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$SOURCE" --format=custom --file=/tmp/cp_tl03e_phase3.dump
docker cp "$PG_CONTAINER:/tmp/cp_tl03e_phase3.dump" "$temporary/db.dump"
test -s "$temporary/db.dump"
docker exec "$PG_CONTAINER" createdb -U postgres "$TARGET"
docker exec -i "$PG_CONTAINER" pg_restore -U postgres -d "$TARGET" --exit-on-error --no-owner < "$temporary/db.dump"

# Data integrity, constraints, grants and RLS after dump -> new disposable database.
dbsql "$TARGET" <<'SQL'
DO $verify$
BEGIN
 IF (SELECT count(*) FROM recovery_memberships) <> 2 OR
    (SELECT count(*) FROM recovery_boards) <> 2 OR
    (SELECT count(*) FROM recovery_attendance) <> 2 OR
    (SELECT count(*) FROM recovery_storage_manifest) <> 1 THEN
   RAISE EXCEPTION 'synthetic rows not fully restored';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relname LIKE 'recovery_%'
   AND relkind='r' AND NOT relrowsecurity) THEN
   RAISE EXCEPTION 'RLS setting missing on restored table';
 END IF;
 IF NOT has_table_privilege('recovery_actor','recovery_boards','SELECT') THEN
   RAISE EXCEPTION 'synthetic actor grant missing';
 END IF;
END $verify$;
SQL

# Actor A can see only A; Actor B can see only B; unsigned actor sees none.
dbsql "$TARGET" <<'SQL'
BEGIN;
SET LOCAL ROLE recovery_actor;
SET LOCAL app.synthetic_actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $verify$
BEGIN
 IF (SELECT count(*) FROM recovery_boards) <> 1 OR
    (SELECT count(*) FROM recovery_attendance) <> 1 OR
    (SELECT count(*) FROM recovery_storage_manifest) <> 1 OR
    EXISTS (SELECT 1 FROM recovery_boards WHERE title='Synthetic board B')
 THEN RAISE EXCEPTION 'actor A isolation failure'; END IF;
END $verify$;
COMMIT;
BEGIN;
SET LOCAL ROLE recovery_actor;
SET LOCAL app.synthetic_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $verify$
BEGIN
 IF (SELECT count(*) FROM recovery_boards) <> 1 OR
    (SELECT count(*) FROM recovery_attendance) <> 1 OR
    (SELECT count(*) FROM recovery_storage_manifest) <> 0 OR
    EXISTS (SELECT 1 FROM recovery_boards WHERE title='Synthetic board A')
 THEN RAISE EXCEPTION 'actor B isolation failure'; END IF;
END $verify$;
COMMIT;
BEGIN;
SET LOCAL ROLE recovery_actor;
SET LOCAL app.synthetic_actor = '';
DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM recovery_boards) OR
    EXISTS (SELECT 1 FROM recovery_attendance) OR
    EXISTS (SELECT 1 FROM recovery_storage_manifest)
 THEN RAISE EXCEPTION 'absent actor exposed records'; END IF;
END $verify$;
COMMIT;
SQL

# Database object metadata is not Storage bytes. Rehearse a separate object archive.
tar -cf "$temporary/storage-objects.tar" -C "$temporary/storage-original" .
test ! -e "$temporary/storage-recovered/synthetic/fixture.txt"
tar -xf "$temporary/storage-objects.tar" -C "$temporary/storage-recovered"
recovered_sha="$(sha256sum "$temporary/storage-recovered/synthetic/fixture.txt" | awk '{print $1}')"
manifest_sha="$(dbsql "$TARGET" -Atqc "SELECT expected_sha256 FROM recovery_storage_manifest WHERE object_key='synthetic/fixture.txt'")"
test "$sha" = "$recovered_sha"
test "$sha" = "$manifest_sha"

# A 15-minute synthetic backup age proves arithmetic only; not actual provider RPO.
synthetic_backup_age_seconds=900
test "$synthetic_backup_age_seconds" -le 86400
rto_seconds=$(( $(date +%s) - started ))
test "$rto_seconds" -le 86400
printf 'CP_TL03E_PHASE3_SYNTHETIC_RESTORE_PASS postgres=17 source=%s restored=%s rpo_simulated_seconds=%s rto_local_seconds=%s rls=3/3 storage_sha256=PASS\n' "$SOURCE" "$TARGET" "$synthetic_backup_age_seconds" "$rto_seconds"
printf 'LIMITATION: No Supabase physical-backup restore; no production data, Auth, Edge, Realtime or live Storage restore. Actual provider RPO/RTO NOT VERIFIED.\n'
