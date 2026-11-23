# CP-TT-BOOTSTRAP-OT-SELF-REVIEW-01 — Bootstrap OT approval and decline

## Scope and engineering decision

- Authoritative writer: `public.timetracker_ot_decide(uuid,uuid,text)` from CP-TT-MANUAL-OT-01. Remove the self-decision restriction **only** when the signed actor is an existing verified Bootstrap Administrator.
- Preserve existing System Admin `manual_admin`-only reviews, including the original prohibition on System Admin deciding their own requests, and preserve regular employee submission/visibility policy.
- Preserve row locks, per-employee advisory lock ordering, `Submitted`-only transition, immutable audit record, signed session/board/workspace context, timestamps, and data-free realtime invalidation.
- Reuse existing OT UI buttons and readback. No frontend business-logic bypass or new authority role is introduced.
- The signed Bootstrap snapshot includes all historic workspace OT submissions, including former/inactive employees; other user scopes remain unchanged.
- Migration is additive and forward-only, replacing two SQL functions without modifying existing OT rows or permissions. No deployment was performed by this change.

## Local evidence (2026-11-23)

- Focused TimeTracker OT: **14/14 PASS**.
- TimeTracker regression subset: **404/404 PASS**.
- Docker PostgreSQL 17 isolated acceptance: **CP_TT_FLOW01F_DISPOSABLE_ACCEPTANCE_PASS**. Includes simulated signed-role self-approve, self-decline, other-user approvals and rejections, persisted status/decider audit, concurrency, immutable audit, normal System Admin denial, existing GPS/attendance concurrency. Role simulation is not a genuine two-account browser acceptance.
- Manifest integrity: **222 baseline and 80 forward migration hashes PASS**.
- `git diff --check`: PASS.
- No gradient descent, backpropagation, training or model weight-update path added or executed.

## Pending deployment and runtime acceptance

Production migration execution was intentionally not performed. Before activation, validate the migration against current staging schema and signed Bootstrap profile(s), execute the approved migration via existing release policy, and verify real persisted approvals and declines (self and another user), refresh/reconnect cross-window readback, and audit/realtime notifications. Do not change production requests solely to test behavior; use approved nonproduction fixtures.
