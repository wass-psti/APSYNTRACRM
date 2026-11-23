# CP-TT-BOOTSTRAP-OT-SELF-REVIEW-03 — Browser acceptance, CI reconciliation and activation readiness

## Root cause corrected

CP01's authoritative SQL writer permits Bootstrap self-approval/decline, and CP02's real GoTrue JWT-backed SQL acceptance passed, but CP03 inspection found three independent frontend blockers:

1. The OT renderer hid self-submitted request review buttons.
2. The native signed OT client refused self-owned decision targets.
3. The CRM click handler silently dropped self-owned decisions.

CP03 removes these restrictions **only for an already verified Bootstrap Administrator**. Existing System Admin manual-OT-only review and nonbootstrap self-decision denial remain unchanged. A fourth frontend issue filtered historical signed Bootstrap workspace OT by the active employee directory, contradicting the server's complete workspace snapshot. CP03 now trusts the server-authorized Bootstrap snapshot while preserving nonbootstrap employee projection behavior.

## Executed verification (November 23, 2026)

- GitHub PR #817 at `f60f8ee`: 13 executed CI checks PASS; Supabase Preview SKIPPED. These checks predate CP03 frontend changes.
- `node --test frontend/tests/time-tracker-overtime.test.mjs`: 16/16 PASS; signed Bootstrap self-decision and former-member snapshot cases included.
- `node --test frontend/tests/time-tracker-*.test.mjs`: 414/414 PASS after rebasing onto latest main.
- `node scripts/time-tracker-browser-acceptance.mjs`: `TIMETRACKER_BROWSER_ACCEPTANCE_PASS`; Chromium fixture includes visible and enabled Bootstrap self-review buttons and accessibility assertions.
- `CP_TT_OT03_BROWSER=1 bash scripts/cp-tt-bootstrap-ot02-signed-disposable.sh`: PASS. Three genuine signed GoTrue accounts, 29 baseline signed HTTP/SQL assertions, signed Chromium clicks on Bootstrap-owned and employee-owned submitted requests, two isolated browser contexts, refreshed signed API readback, immutable OT audit persistence, existing denied actions, and cleanup.
- Full frontend regression **3,533/3,533 PASS**, `npm run check` **PASS**, `npm run lint` **PASS**, production `npm run build` **PASS** after a clean `npm ci` (an initial attempt with a symlinked dependency directory failed module resolution).
- All isolated services are destroyed on exit. The existing local Supabase stack and production database were not altered.

The Chromium integration harness uses the real TimeTracker OT renderer, genuine isolated GoTrue sessions, PostgREST OT decision/snapshot RPCs, and real button clicks. Its test-only event bridge is **not** the full production CRM controller or hosted CRM session. Accordingly, it verifies isolated signed browser/component integration, not complete deployed-CRM acceptance or real cross-window Realtime delivery.

## Connected production state (read-only metadata inspection)

Project `jtlusodorfnyzgyuewkz` is active. The OT RPCs exist, but `supabase_migrations.schema_migrations` has no `20261123180000` entry and the server function lacks the new Bootstrap self-review predicate. TimeTracker migration versions `20261123160000` and `20261123170000` are recorded as applied; independent OJT version `20261123150000` is not. This discrepancy must be reconciled separately without applying unrelated OJT changes through this OT rollout.

## Remaining acceptance and activation gates

1. Complete CI for the updated CP03 commit, including the dedicated signed Chromium job.
2. Verify nonproduction genuine full CRM app/controller behavior and live cross-window Realtime refresh (the component fixture is not the deployed CRM).
3. Review production migration ordering/status and obtain existing required release authorization before applying CP01's authorizing DB function update.
4. After the approved rollout, verify migration ledger, signed Bootstrap self/other OT write/readback and audit, preservation of System Admin manual-only rules, rollback readiness, and no unexplained active-record changes.

Do **not** claim live activation, merge or deploy while these gates remain outstanding. No new roles, broad grants, permissions or restrictions are introduced. No gradient descent, backpropagation or model-training loops were added or executed.
