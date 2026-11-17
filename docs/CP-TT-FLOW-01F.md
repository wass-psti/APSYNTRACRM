# CP-TT-FLOW-01F — Disposable Signed Attendance/OT Transaction Acceptance

## Scope and evidence

This milestone consolidates the already implemented CP-TT-GPS01 and CP-TT-OT02 transaction contracts into one **reproducible, production-isolated acceptance command**:

`scripts/cp-tt-flow01f-disposable-acceptance.sh`

The script creates two independent temporary PostgreSQL 17 Docker containers. It mounts the repository read-only, sets `--network none`, publishes no ports, executes real PostgreSQL functions through local `psql`, and automatically removes each container. It does not access the existing Supabase project, live users, or actual attendance. The two databases are **separate clusters**, not merely separate databases, because fixture-created PostgreSQL roles are cluster-global.

## Test coverage and outcome

| Contract | Evidence |
| --- | --- |
| OT employee submission and persisted receipt | CP-TT-OT-02 PASS |
| OT approval/rejection by a distinct simulated reviewer | CP-TT-OT-02 PASS |
| Approval/rejection audit and immutable audit protection | CP-TT-OT-02 PASS |
| Duplicate unresolved OT prevention | CP-TT-OT-02 PASS |
| Denials for unauthorized, expired, revoked and foreign sessions | CP-TT-OT-02 PASS |
| Atomic Clock In/Out, GPS and board projection | CP-TT-GPS01 PASS |
| Distinct Clock-In and Clock-Out GPS events | CP-TT-GPS01 PASS |
| Two concurrent Clock-In/Clock-Out attempts | CP-TT-FM1-APP-03 PASS |
| Exactly one Clock commit and audit event per action | CP-TT-FM1-APP-03 PASS |
| Safe rejection on stale revisions and projection failures | CP-TT-GPS01 PASS |
| Actual production signed write and reviewer decision | **BLOCKED** — no designated disposable production identities |

Fixture credentials are for an ephemeral isolated PostgreSQL instance only. Synthetic JWT/session claims in these fixtures are not equivalent to genuine production GoTrue sessions.

## Live read-only verification

On November 17, 2026, the authenticated APSYNTRA CRM TimeTracker browser completed the existing read-only ten-tab acceptance with `READ_ONLY_SIGNED_RUNTIME_ACCEPTANCE_PASS`. PostgreSQL production readback verified one active attendance projection with a corresponding board item and captured Clock-In GPS; OT requests and OT audit events remained at zero. No production attendance or OT records were modified in this milestone.

## Production operational closeout condition

Final genuine acceptance requires an **explicitly designated disposable test employee** and a **separate existing authorized reviewer**, both with valid signed sessions. With those identities, perform one expressly designated test-only Clock In/Out and an OT submission/decision with signed readback, request audit, attendance source revision, GPS and board projection. Do not use the existing employee's active shift; do not manufacture credentials, weaken the existing review rules or alter historical attendance. Preserve current credited-hour calculations.

**Result:** Disposable PostgreSQL contract acceptance is VERIFIED. Genuine production-signed transaction acceptance remains PENDING and must not be represented as completed.

**Follow-up if still blocked:** CP-TT-FLOW-01G — Designated Two-Account Signed Production Acceptance and Final Operational Signoff. This is an operational acceptance gate, not an additional architecture or authorization rewrite.
