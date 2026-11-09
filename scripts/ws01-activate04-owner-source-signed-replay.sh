#!/usr/bin/env bash
# Owner-host, protected-source PostgreSQL 17 replay. Never production.
# Usage: bash this-script.sh /absolute/private/source-dir <40-hex-repository-commit>
set -euo pipefail
umask 077
deny() { echo "CP_WS_ACTIVATE04_REPLAY_BLOCKED: $1" >&2; exit 1; }
[[ ($# == 2 || ($# == 3 && ("$3" == "--check-disjoint-roles" || "$3" == "--candidate-actor-boundary"))) && "$1" == /* && "$2" =~ ^[a-f0-9]{40}$ ]] || deny USAGE
DISJOINT_CANARY=0
ACTOR_BOUNDARY=0
if [[ $# == 3 ]]; then
 DISJOINT_CANARY=1
 if [[ "$3" == "--candidate-actor-boundary" ]]; then ACTOR_BOUNDARY=1; fi
fi
SOURCE_DIR="$1"
COMMIT="$2"
[[ -d "$SOURCE_DIR" && ! -L "$SOURCE_DIR" ]] || deny PROTECTED_SOURCE_DIRECTORY_ABSENT
[[ "$(stat -f '%Lp' "$SOURCE_DIR")" == 700 ]] || deny PROTECTED_DIRECTORY_MODE
[[ "$(find "$SOURCE_DIR" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')" == 74 ]] || deny SOURCE_FILE_COUNT
if env | grep -Eq '^(PGHOST|PGDATABASE|PGPASSWORD)='; then deny PRODUCTION_DB_ENV_PRESENT; fi
command -v node >/dev/null || deny NODE_MISSING
command -v curl >/dev/null || deny CURL_MISSING
DOCKER="$(command -v docker || true)"
if [[ -z "$DOCKER" && -x "$HOME/.docker/bin/docker" ]]; then DOCKER="$HOME/.docker/bin/docker"; fi
[[ -n "$DOCKER" ]] || deny DOCKER_MISSING
"$DOCKER" info --format '{{.ServerVersion}}' >/dev/null 2>&1 || deny DOCKER_STOPPED
WORK="$(mktemp -d /tmp/ws01-owner-replay.XXXXXXXX)"
chmod 700 "$WORK"
cleanup() { rm -rf -- "$WORK"; }
trap cleanup EXIT
mkdir -p "$WORK/scripts" "$WORK/sql/tests"
download() {
 curl -fsSL --connect-timeout 8 --max-time 30 \
 "https://raw.githubusercontent.com/wass-psti/APSYNTRACRM/$COMMIT/$1" -o "$WORK/$1" ||
 deny FIXTURE_DOWNLOAD_FAILED
 chmod 600 "$WORK/$1"
}
download scripts/ws01-h3-private-source-guard.mjs
download sql/tests/cp-ws01-h3-private-core-source-manifest.json
download sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json
download sql/tests/cp-ws01c-g4c-role-dependent-fingerprints.json
download sql/tests/cp-ws01b-disposable-setup.sql
download sql/tests/cp-ws-activate04-74-caller-synthetic-dependencies.sql
download sql/cp-ws01b-lifecycle-contract-candidate.sql
download sql/cp-ws01c-b3-create-contract-candidate.sql
download sql/cp-ws01b-session-cutover-candidate.sql
download sql/tests/cp-ws01b-disposable-acceptance.sql
download sql/tests/cp-ws-activate04-original-domain-role-subset.sql
download sql/tests/cp-ws-activate04-disjoint-role-denial-canary.sql
download sql/tests/cp-ws-activate04-disposable-actor-boundary-candidate.sql
download sql/tests/cp-ws-activate04-private-delegation-boundary.sql
download scripts/ws01-activate04-concurrent-cas-disposable.sh
node "$WORK/scripts/ws01-h3-private-source-guard.mjs" \
 "--full-live-private-dir=$SOURCE_DIR" >/dev/null || deny ORIGINAL_SOURCE_HASH_DRIFT
echo CP_WS_ACTIVATE04_PRIVATE_SOURCE_74_HASH_PASS
cat >"$WORK/replay.sh" <<'RUNNER'
#!/bin/sh
set -eu
su postgres -s /bin/sh -c 'initdb -D /tmp/pgws -A trust --no-sync --no-instructions >/dev/null'
su postgres -s /bin/sh -c 'pg_ctl -D /tmp/pgws -o "-c listen_addresses=127.0.0.1 -k /tmp" -w start >/dev/null'
trap 'su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgws -m immediate -w stop >/dev/null" || true' EXIT
psql -X -q -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE workspace_disposable' >/dev/null
apply() {
 psql -X -q -h /tmp -U postgres -d workspace_disposable -v ON_ERROR_STOP=1 \
 -f "/public/$1" >/tmp/step.out 2>/tmp/step.err || {
 echo "CP_WS_ACTIVATE04_REPLAY_BLOCKED: DISPOSABLE_SQL_STAGE_FAILED $1"; head -n 5 /tmp/step.err; head -n 3 /tmp/step.out; exit 2; }
}
apply sql/tests/cp-ws01b-disposable-setup.sql
apply sql/tests/cp-ws-activate04-74-caller-synthetic-dependencies.sql
apply sql/cp-ws01b-lifecycle-contract-candidate.sql
: >/tmp/retry
count=0
for f in /protected/*.sql; do
 if psql -X -q -h /tmp -U postgres -d workspace_disposable -v ON_ERROR_STOP=1 \
 -f "$f" >/tmp/step.out 2>/tmp/step.err; then count=$((count+1))
 else echo "$f" >>/tmp/retry; fi
done
if [ -s /tmp/retry ]; then
 cp /tmp/retry /tmp/pending
 : >/tmp/retry
 while IFS= read -r f; do
  if psql -X -q -h /tmp -U postgres -d workspace_disposable -v ON_ERROR_STOP=1 \
  -f "$f" >/tmp/step.out 2>/tmp/step.err; then count=$((count+1))
  else echo "$f" >>/tmp/retry; fi
 done </tmp/pending
fi
[ "$count" -eq 74 ] && [ ! -s /tmp/retry ] || {
 echo CP_WS_ACTIVATE04_REPLAY_BLOCKED: ORIGINAL_COMPILATION; exit 2; }
echo CP_WS_ACTIVATE04_ORIGINAL_SOURCE_74_COMPILE_PASS
apply sql/cp-ws01c-b3-create-contract-candidate.sql
apply sql/cp-ws01b-session-cutover-candidate.sql
if [ "${WS01_ACTOR_BOUNDARY:-0}" = 1 ]; then
 apply sql/tests/cp-ws-activate04-disposable-actor-boundary-candidate.sql
 echo CP_WS_ACTIVATE04_DISPOSABLE_ACTOR_BOUNDARY_INSTALLED
 apply sql/tests/cp-ws-activate04-private-delegation-boundary.sql
 echo CP_WS_ACTIVATE04_PRIVATE_TRUSTED_DELEGATION_PASS
fi
if [ "${WS01_RUN_DISJOINT_CANARY:-0}" = 1 ]; then
 echo CP_WS_ACTIVATE04_DISJOINT_ROLE_CANARY_STARTED
 apply sql/tests/cp-ws-activate04-disjoint-role-denial-canary.sql
 echo CP_WS_ACTIVATE04_DISJOINT_ROLE_DENIAL_PASS
fi
apply sql/tests/cp-ws-activate04-original-domain-role-subset.sql
echo CP_WS_ACTIVATE04_ORIGINAL_DOMAIN_ROLE_SUBSET_PASS
apply sql/tests/cp-ws01b-disposable-acceptance.sql
echo CP_WS_ACTIVATE04_ORIGINAL_SOURCE_SIGNED_ACCEPTANCE_PASS
export PGHOST=127.0.0.1 PGUSER=postgres PGDATABASE=workspace_disposable
bash /public/scripts/ws01-activate04-concurrent-cas-disposable.sh >/tmp/cas.out 2>/tmp/cas.err || {
 echo CP_WS_ACTIVATE04_REPLAY_BLOCKED: CONCURRENT_CAS; exit 2; }
grep -qx CP_WS_ACTIVATE04_CONCURRENT_CAS_ISOLATED_PASS /tmp/cas.out || {
 echo CP_WS_ACTIVATE04_REPLAY_BLOCKED: CAS_RECEIPT; exit 2; }
echo CP_WS_ACTIVATE04_ORIGINAL_SOURCE_CONCURRENT_CAS_PASS
RUNNER
chmod 600 "$WORK/replay.sh"
"$DOCKER" run --rm --network none --read-only \
 --tmpfs /tmp:rw,exec,nosuid,size=256m --tmpfs /run:rw,nosuid,size=16m \
 --security-opt no-new-privileges \
 --env "WS01_RUN_DISJOINT_CANARY=$DISJOINT_CANARY" \
 --env "WS01_ACTOR_BOUNDARY=$ACTOR_BOUNDARY" \
 --mount "type=bind,source=$SOURCE_DIR,target=/protected,readonly" \
 --mount "type=bind,source=$WORK,target=/public,readonly" \
 --entrypoint /bin/sh public.ecr.aws/supabase/postgres:17.11.0.004 \
 /public/replay.sh || deny ISOLATED_EXECUTION_FAILED
echo CP_WS_ACTIVATE04_PROTECTED_SIGNED_CAS_SCOPED_PASS
