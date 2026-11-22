#!/usr/bin/env bash
# Rollback-only registry acceptance against an existing disposable Supabase container.
set -euo pipefail

container_name="${1:-supabase_db_cp16019-disposable-local}"
database_name="${2:-postgres}"
case "$database_name" in
  postgres|cp_native10_disposable) ;;
  *) echo "Refusing unapproved database name" >&2; exit 2 ;;
esac
case "$container_name" in
  *disposable-local*) ;;
  *) echo "Refusing to run outside a disposable-local database container" >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20261122010413_cp_native_app_autosync_03_registry_projection.sql"

{
cat <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE cp04_fixture AS
SELECT m.workspace_id, (array_agg(m.user_id ORDER BY m.user_id))[1] AS actor_one,
 (array_agg(m.user_id ORDER BY m.user_id))[2] AS actor_two
FROM public.workspace_members m
JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
WHERE m.active
GROUP BY m.workspace_id
HAVING count(DISTINCT m.user_id)>=2
LIMIT 1;

DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cp04_fixture WHERE actor_one<>actor_two) THEN
  RAISE EXCEPTION 'Disposable fixture needs two existing local profiles in one workspace';
 END IF;
END;
$check$;

-- Temporary scope guard for the local fixture only. Transaction rolls it back.
CREATE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $scope$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=auth.uid() AND wm.active
 ) THEN
  RAISE EXCEPTION 'Local QA workspace scope denied' USING ERRCODE='42501';
 END IF;
END;
$scope$;
SQL
sed '/^BEGIN;$/d;/^COMMIT;$/d' "$migration"
cat <<'SQL'
CREATE TEMP TABLE cp04_boards(id uuid, name text, workspace_id uuid);
INSERT INTO cp04_boards(id,name,workspace_id)
SELECT gen_random_uuid(),'QA New Application',workspace_id FROM cp04_fixture;

INSERT INTO public.work_boards(id,workspace_id,name,description,status,created_by,updated_by)
SELECT b.id,b.workspace_id,b.name,'[APSYNTRA:MODULE:qa-new-app:v1] Disposable registry read only',
'active',f.actor_one,f.actor_one
FROM cp04_boards b CROSS JOIN cp04_fixture f;

DO $checks$
DECLARE
 fixture record;
 payload jsonb;
BEGIN
 SELECT * INTO fixture FROM cp04_fixture;
 PERFORM set_config('request.jwt.claim.sub',fixture.actor_one::text,true);
 SELECT public.apsyntra_native_application_registry(fixture.workspace_id) INTO payload;
 IF jsonb_array_length(payload->'modules')<>1 OR
    payload->'modules'->0->>'moduleId'<>'qa-new-app' THEN
  RAISE EXCEPTION 'New application registration was not discovered: %',payload;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',fixture.actor_two::text,true);
 SELECT public.apsyntra_native_application_registry(fixture.workspace_id) INTO payload;
 IF payload->'modules'->0->>'moduleId'<>'qa-new-app' THEN
  RAISE EXCEPTION 'Second local identity did not observe registration';
 END IF;
END;
$checks$;

UPDATE public.work_boards SET name='QA Renamed Application',
 updated_at=now() + interval '1 second'
WHERE id=(SELECT id FROM cp04_boards);
DO $check$
DECLARE payload jsonb;
BEGIN
 SELECT public.apsyntra_native_application_registry(workspace_id) INTO payload FROM cp04_fixture;
 IF payload->'modules'->0->>'name'<>'QA Renamed Application' OR
    payload->'modules'->0->>'moduleId'<>'qa-new-app' THEN
  RAISE EXCEPTION 'Rename altered application identity or failed to refresh: %',payload;
 END IF;
END;
$check$;

-- Duplicate marker: one canonical entry, newest updated_at wins.
INSERT INTO public.work_boards(workspace_id,name,description,status,created_by,updated_by,updated_at)
SELECT workspace_id,'QA Duplicate',
 '[APSYNTRA:MODULE:qa-new-app:v1] Duplicate fixture','active',
 actor_one,actor_one,now() - interval '1 day'
FROM cp04_fixture;
DO $check$
DECLARE payload jsonb;
BEGIN
 SELECT public.apsyntra_native_application_registry(workspace_id) INTO payload FROM cp04_fixture;
 IF jsonb_array_length(payload->'modules')<>1 OR
    payload->'modules'->0->>'name'<>'QA Renamed Application' THEN
  RAISE EXCEPTION 'Concurrent registration deduplication mismatch: %',payload;
 END IF;
END;
$check$;

UPDATE public.work_boards SET status='archived',archived_at=now()
WHERE description LIKE '[APSYNTRA:MODULE:qa-new-app:v1]%';
DO $check$
DECLARE payload jsonb;
BEGIN
 SELECT public.apsyntra_native_application_registry(workspace_id) INTO payload FROM cp04_fixture;
 IF jsonb_array_length(payload->'modules')<>0 THEN
  RAISE EXCEPTION 'Deactivated application is still discoverable: %',payload;
 END IF;
END;
$check$;

DO $check$
DECLARE actor uuid;
BEGIN
 SELECT actor_two INTO actor FROM cp04_fixture;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN
  PERFORM public.apsyntra_native_application_registry((SELECT workspace_id FROM cp04_fixture));
  RAISE EXCEPTION 'Unrelated profile unexpectedly passed workspace scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
END;
$check$;
SELECT 'PASS: two local identity claims, registration, rename, duplicate, deactivation, unrelated identity denial' AS result;
ROLLBACK;
SQL
} | docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database_name"
