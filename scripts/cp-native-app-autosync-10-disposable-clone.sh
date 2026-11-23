#!/usr/bin/env bash
# Clone only existing local disposable CRM schemas. NEVER connects to remote staging.
set -euo pipefail
container="supabase_db_cp16019-disposable-local"
repository="$(cd "$(dirname "$0")/.." && pwd)"
clone="cp_native10_disposable"
dump="/tmp/cp_native10_disposable.dump"
lock_dir="/tmp/cp_native10_disposable.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
 echo "BLOCKED: existing local clone acceptance is in progress" >&2; exit 2
fi
created=0
exec_db() { local database="$1"; shift; docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"; }
cleanup() {
 if ((created)); then docker exec "$container" dropdb -U postgres "$clone" || echo "CLEANUP REQUIRED" >&2; fi
 docker exec "$container" rm -f "$dump" 2>/dev/null || true
 rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT
if [[ "$(exec_db postgres -Atqc "SELECT count(*) FROM pg_database WHERE datname='$clone'")" != "0" ]]; then
 echo "BLOCKED: $clone already exists; refusing overwrite" >&2; exit 2
fi
docker exec "$container" pg_dump -U postgres -d postgres -Fc -n public -n auth -n private --no-owner --no-acl -f "$dump"
docker exec "$container" chmod 600 "$dump"
docker exec "$container" createdb -U postgres -T template0 "$clone"
created=1
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" -c 'CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS private;' >/dev/null
docker exec "$container" pg_restore -U postgres -d "$clone" -n public -n auth -n private --no-owner --no-acl --exit-on-error "$dump"
# Clone-only notification adapter: Realtime is intentionally not restored.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" <<'SQL' >/dev/null
CREATE SCHEMA realtime;
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,is_private boolean)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
SQL
echo "PASS: isolated local PostgreSQL CRM schema and fixture restore"
# These compatibility tests create TEMP tables only; live profiles are unchanged.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
  -f /dev/stdin < "$repository/sql/acceptance/cp-native-app-autosync-11-profile-compatibility.sql" >/dev/null
echo "PASS: staging-shaped profile DDL addition and synthetic row preservation"
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" \
  -f /dev/stdin < "$repository/sql/acceptance/cp-native-app-autosync-14-staging-membership-fidelity.sql" >/dev/null
echo "PASS: staging invitation and workspace membership FK/role/cascade fidelity"

if [[ "$(docker exec "$container" psql -X -U postgres -d "$clone" -Atqc "SELECT count(*) FROM public.module_role_assignments")" != "0" ]]; then
 echo "BLOCKED: clone contains prior module assignment rows" >&2; exit 2
fi
bash "$repository/scripts/cp-native-app-autosync-04-local-acceptance.sh" "$container" "$clone" >/dev/null
echo "PASS: registry lifecycle on cloned local data (synthetic JWT claims, rollback)"
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" <<'SQL' >/dev/null
CREATE TEMP TABLE cp10_participants AS
SELECT workspace_id, (array_agg(m.user_id ORDER BY m.user_id))[1] AS actor,
 (array_agg(m.user_id ORDER BY m.user_id))[2] AS member_one,
 (array_agg(m.user_id ORDER BY m.user_id))[3] AS member_two
FROM public.workspace_members m
JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
WHERE m.active
GROUP BY m.workspace_id HAVING count(DISTINCT m.user_id)>=3 LIMIT 1;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cp10_participants WHERE actor<>member_one AND member_one<>member_two)
 THEN RAISE EXCEPTION 'Three-person synthetic fixture missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.module_role_assignments a,cp10_participants q
 WHERE a.module_id='time-tracker' AND a.user_id IN(q.member_one,q.member_two))
 THEN RAISE EXCEPTION 'Assignment baseline was not empty'; END IF;
END $$;
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
SELECT member_one,'time-tracker','Employee',true,actor FROM cp10_participants
UNION ALL
SELECT member_two,'time-tracker','Supervisor',true,actor FROM cp10_participants;
SQL
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" <<'SQL' >/dev/null
DO $$
BEGIN
 IF (SELECT count(*) FROM public.module_role_assignments WHERE
 module_id='time-tracker' AND role IN ('Employee','Supervisor') AND enabled)<>2
 THEN RAISE EXCEPTION 'First independent SQL connection readback failed'; END IF;
END $$;
UPDATE public.module_role_assignments SET role='HR',updated_at=clock_timestamp()
WHERE module_id='time-tracker' AND role='Employee' AND enabled;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.module_role_assignments WHERE module_id='time-tracker' AND role='HR')
 THEN RAISE EXCEPTION 'Update failed'; END IF;
 BEGIN
  INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled)
  SELECT user_id,'qa-new-app','Admin',true FROM public.workspace_members LIMIT 1;
  RAISE EXCEPTION 'Unsupported module unexpectedly assignable';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
SQL
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$clone" <<'SQL' >/dev/null
DO $$
BEGIN
 IF (SELECT count(*) FROM public.module_role_assignments WHERE
  module_id='time-tracker' AND role IN ('HR','Supervisor') AND enabled)<>2
 THEN RAISE EXCEPTION 'Second independent SQL connection readback failed'; END IF;
END $$;
DELETE FROM public.module_role_assignments
 WHERE module_id='time-tracker' AND role IN ('HR','Supervisor');
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.module_role_assignments)
 THEN RAISE EXCEPTION 'QA rollback failed'; END IF;
END $$;
SQL
echo "PASS: synthetic two-member SQL assignment, change, independent connection readbacks, invalid module denial, restoration"
echo "NOT VERIFIED: three real signed browser sessions or new module writer contract"
