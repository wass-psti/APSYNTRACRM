#!/usr/bin/env bash
# CP-WS-ACTIVATE-04: genuine two-connection session CAS contention.
# Must run only in the disposable PostgreSQL 17 CI fixture, never live.
set -euo pipefail

if [[ "${PGDATABASE:-}" != 'workspace_disposable' || "${PGHOST:-}" != '127.0.0.1' || "${PGUSER:-}" != 'postgres' ]]; then
  echo 'CP_WS_ACTIVATE04_BLOCKED: isolated PostgreSQL connection required' >&2
  exit 1
fi
if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_database() || '|' || (current_setting('server_version_num')::integer >= 170000)")" != 'workspace_disposable|t' ]]; then
  echo 'CP_WS_ACTIVATE04_BLOCKED: PG17 disposable database required' >&2
  exit 1
fi
fixture_ok=$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT
  (SELECT selection_enabled FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
  AND has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  AND EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND workspace_id='00000000-0000-4000-8000-000000000001' AND active IS TRUE)
  AND EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND workspace_id='00000000-0000-4000-8000-000000000002' AND active IS TRUE)
  AND NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id='cccccccc-0000-4000-8000-000000000004');")
if [[ "$fixture_ok" != t ]]; then
  echo 'CP_WS_ACTIVATE04_BLOCKED: disposable signed switching fixture missing' >&2
  exit 1
fi

scratch=$(mktemp -d /tmp/ws01-activate04-concurrency.XXXXXX)
chmod 700 "$scratch"
a_pid=''
b_pid=''
cleanup(){
  [[ -z "$a_pid" ]] || kill "$a_pid" 2>/dev/null || true
  [[ -z "$b_pid" ]] || kill "$b_pid" 2>/dev/null || true
  rm -rf -- "$scratch"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -qAtc "INSERT INTO auth.sessions(id,user_id,not_after) VALUES ('cccccccc-0000-4000-8000-000000000004','cccccccc-cccc-4ccc-8ccc-cccccccccccc',NULL);" >/dev/null

# Transaction A takes the GoTrue session row lock and holds it after
# successfully selecting the second workspace. Transaction B begins during
# the lock and must reject the now-stale expected workspace after A commits.
psql -X -v ON_ERROR_STOP=1 -qAt >"$scratch/a.out" 2>"$scratch/a.err" <<SQL &
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000004',true);
SELECT (public.wm_ws01_select('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001')->>'switched')='true';
\! touch "$scratch/a-ready"
SELECT pg_catalog.pg_sleep(3);
COMMIT;
SQL
a_pid=$!

ready=false
for _ in $(seq 1 120); do
  if [[ -f "$scratch/a-ready" ]]; then ready=true; break; fi
  if ! kill -0 "$a_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then
  wait "$a_pid" || true
  echo 'CP_WS_ACTIVATE04_FAILED: first selection did not reach locked state' >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -qAt >"$scratch/b.out" 2>"$scratch/b.err" <<'SQL' &
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000004',true);
SELECT public.wm_ws01_select('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
COMMIT;
SQL
b_pid=$!

if ! wait "$a_pid"; then
  echo 'CP_WS_ACTIVATE04_FAILED: first signed selection failed' >&2
  exit 1
fi
a_pid=''
if wait "$b_pid"; then
  echo 'CP_WS_ACTIVATE04_FAILED: concurrent stale CAS was accepted' >&2
  exit 1
fi
b_pid=''
if ! grep -q '40001' "$scratch/b.err"; then
  echo 'CP_WS_ACTIVATE04_FAILED: second request did not fail with SQLSTATE 40001' >&2
  exit 1
fi

checked=$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT
  (SELECT count(*) FROM private.ws01_events WHERE action='workspace.selected' AND session_id='cccccccc-0000-4000-8000-000000000004')=1
  AND EXISTS(SELECT 1 FROM private.ws01_session_choices WHERE session_id='cccccccc-0000-4000-8000-000000000004' AND actor_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND workspace_id='00000000-0000-4000-8000-000000000002');")
if [[ "$checked" != t ]]; then
  echo 'CP_WS_ACTIVATE04_FAILED: session choice or audit diverged after contention' >&2
  exit 1
fi

scope=$(psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000004',false);
SELECT public.current_workspace_id(auth.uid());
SQL
)
if [[ "${scope##*$'\n'}" != '00000000-0000-4000-8000-000000000002' ]]; then
  echo 'CP_WS_ACTIVATE04_FAILED: selected session did not resolve target' >&2
  exit 1
fi

# Synthetic fixtures exist only inside the disposable CI database.
psql -X -v ON_ERROR_STOP=1 -qAtc "DELETE FROM auth.sessions WHERE id='cccccccc-0000-4000-8000-000000000004';" >/dev/null
if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT NOT EXISTS(SELECT 1 FROM private.ws01_session_choices WHERE session_id='cccccccc-0000-4000-8000-000000000004')")" != t ]]; then
  echo 'CP_WS_ACTIVATE04_FAILED: revocation did not prune test choice' >&2
  exit 1
fi
printf '%s\n' 'CP_WS_ACTIVATE04_CONCURRENT_CAS_ISOLATED_PASS'
