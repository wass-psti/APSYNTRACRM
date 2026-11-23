# CP-TT-BOOTSTRAP-OT-SELF-REVIEW-02 — Signed runtime acceptance and controlled activation

## Decision

CP01's forward SQL migration is unchanged and remains pending the repository's production-release process. CP02 adds an independent disposable PostgreSQL 17 + GoTrue v2.197.0 + PostgREST v16.4 harness exercising the **actual** TimeTracker RPCs with verified JWT sessions, rather than only mocked session claims. No existing Supabase project, local test stack, production credentials, roles or data is modified.

## Executable acceptance

`bash scripts/cp-tt-bootstrap-ot02-signed-disposable.sh`

The harness creates a unique isolated Docker network and database, binds GoTrue/PostgREST only to loopback ephemeral ports, migrates a fresh Auth schema, adapts the existing disposable TimeTracker fixture to use genuine GoTrue-managed sessions, applies staged OT migrations through CP01, and creates three independently signed temporary identities. It verifies HTTP signup, password login, `/user`, JWT identity/session, regular and self-submitted OT approval/decline, durable database status/timestamps/audit, signed snapshot visibility, fresh password-login readback, regular-employee denial, System Admin manual-only denial, and repeated-decision conflict. A cleanup trap destroys the services/network/database regardless of success or error. Synthetic addresses use `example.invalid`, and no tokens, test passwords or signing keys are printed.

## Evidence — November 23, 2026

- Three genuine signed identities: **PASS**.
- Four independent signed Bootstrap decisions (self-approve, self-decline, approve/reject employee OT): **PASS**.
- SQL persistence and audit readback for all four decisions: **PASS**.
- Distinct signed reconnect, visibility, denial, and replay checks: **PASS**.
- **29 signed HTTP/SQL assertions PASS**, `CP_TT_BOOTSTRAP_OT02_SIGNED_DISPOSABLE_PASS`.
- Existing CP01 TimeTracker regression: **404/404 PASS**; disposable OT/attendance acceptance **PASS**.
- No gradient descent, backpropagation, model training or iterative parameter updates were introduced or executed.

## Important limitations and production gate

This test uses a **representative isolated SQL fixture with genuine GoTrue sessions**, not a full cloned staging schema, production credentials, or an authenticated CRM browser UI. The live TimeTracker screen, cross-window refresh behavior, staging migration ordering, and production migration application are **not yet independently certified**.

Before merge/production activation: verify full CI, review signed staged schema compatibility and existing release/migration policy, perform nonproduction real CRM browser acceptance with signed Bootstrap and employee profiles including cross-tab readback, and obtain applicable approval before modifying a production authorization rule. Once activated, confirm migration ledger/readback and preserve existing application behavior; do not create real production OT solely for testing.
