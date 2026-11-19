#!/usr/bin/env bash
# CP-CRM-NATIVE-04A: four-application isolated transaction and readback acceptance.
# No production Supabase host, credentials, records, or ports.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo 'BLOCKED: Docker is required' >&2; exit 1; }
command -v node >/dev/null || { echo 'BLOCKED: Node.js is required' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'BLOCKED: Docker engine is not running' >&2; exit 1; }

echo 'CP-CRM-NATIVE-04A | TimeTracker PostgreSQL 17 concurrent clock and GPS readback'
bash scripts/cp-tt-flow01f-disposable-acceptance.sh

echo 'CP-CRM-NATIVE-04A | Fund Tracker PostgreSQL 17 full financial lifecycle'
bash scripts/cp-frt-flow03g-disposable-lifecycle-acceptance.sh

echo 'CP-CRM-NATIVE-04A | FuelTrack+ signed request / receipt / Board workflow'
bash scripts/fueltrack-v3-backend-disposable.sh

echo 'CP-CRM-NATIVE-04A | TradeLink six modules / review / history / readback'
bash scripts/cp-crm-native04a-tradelink-disposable.sh

echo 'CP-CRM-NATIVE-04A | Four-domain frontend command and domain contract regressions'
node --test \
 frontend/tests/time-tracker-clock-command.test.mjs \
 frontend/tests/time-tracker-pending-recovery.test.mjs \
 frontend/tests/time-tracker-my-hours-command.test.mjs \
 frontend/tests/frt-request-draft.test.mjs \
 frontend/tests/frt-filing-workflow.test.mjs \
 frontend/tests/frt-liquidation.test.mjs \
 frontend/tests/fueltrack-v3-requests.test.mjs \
 frontend/tests/fueltrack-v3-approvals.test.mjs \
 frontend/tests/fueltrack-v3-domain-client.test.mjs \
 frontend/tests/tradelink-dual-review-approval.test.mjs \
 frontend/tests/tradelink-approval-rejection.test.mjs \
 frontend/tests/tradelink-signed-submit.test.mjs \
 frontend/tests/tradelink-operational-completion.test.mjs \
 frontend/tests/tradelink-approved-supersession.test.mjs \
 frontend/tests/tradelink-revision-history.test.mjs

echo 'CP_CRM_NATIVE04A_FOUR_APPLICATION_DISPOSABLE_ACCEPTANCE_PASS'
