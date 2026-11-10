# CP-WS01 — Functional workspace switch: atomic activation candidate

Date: 2026-11-10. Repository: wass-psti/APSYNTRACRM
Feature branch: feat/ws01-signed-workspace-switch-20261110
PR #206 (draft). Production status: NOT ACTIVATED.

## Root cause

Production supports signed workspace discovery and the affected employee
has active membership in both Main Workspace and Work Management. But
the existing current_workspace_id resolver always selects the oldest
membership, the signed wm_ws01_select RPC and member-pruning trigger are
absent, and selection_enabled=false.

## Focused implementation

The atomic candidate
sql/cp-ws01-atomic-functional-selection-CANDIDATE-NOT-APPLIED.sql
installs the session-aware resolver, signed selector, revocation pruning,
and authenticated-only RPC activation in ONE PostgreSQL transaction.
Failed prerequisites or postconditions roll back the complete cutover.
No workspace, Board, account, role, or membership data changes.

The existing emergency-disable candidate atomically disables selection,
revokes the selector EXECUTE grant, and prunes temporary choices while
preserving the previous deterministic workspace fallback.

The disposable acceptance exercises an existing-style synthetic member
with two authorized workspaces: switching away and back, authoritative
catalog/context, stale CAS denial, foreign-workspace denial, and emergency
rollback. The guarded shell runner accepts only local PostgreSQL 17 and a
disposable database, with a separate GitHub workflow job for the exact
atomic script. No additional Supabase project or production fixture.

## Verification

Actual isolated PostgreSQL 17.11 Docker acceptance returned
WS01_ATOMIC_FUNCTIONAL_DISPOSABLE_PASS.
The broader PG17 lifecycle tests separately cover revoked/expired
sessions, membership revocation, and concurrent CAS.

## Production boundary

The exact cutover replaces a shared production authorization resolver
and adds authenticated EXECUTE to a scoped selection RPC. Separate
explicit approval of that production permission/architecture change
is required before deployment. PR #206 must not merge before backend
activation, signed two-way workspace selection and Board/role reload
acceptance. No anonymous grants or global RLS weakening are needed.

IMPLEMENTED/VERIFIED: staged frontend, atomic backend, isolated denial
and rollback tests.
PENDING: production cutover, genuine signed workspace selection and
protected frontend release.
RELEASE: NO-GO until runtime acceptance passes.
