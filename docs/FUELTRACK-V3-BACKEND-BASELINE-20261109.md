# FuelTrack+ v3 — Minimal backend activation baseline (November 9, 2026)

**Scope:** Existing WatchdogWorkspace Supabase project; no new service, app, account system, or Supabase project.

**Status:** Implementation staged in the repository. **NOT deployed to production.** Do not enable the frontend mutation controls merely because this migration parses or passes isolated tests.

## Verified dependencies

- Signed identity: existing `auth.uid()` and `public.current_workspace_id()`.
- Module authorization: existing `has_module_access('fueltrack-plus',caller)` and `module_role_for` (observed `Admin` and `User`).
- Board authorization: `work_board_access(boardId,'view'|'edit')`, exact FuelTrack board identity and workspace.
- Existing source event stream: `list_module_activity`. This is not treated as immutable transaction evidence because `append_module_activity` may also be invoked by module users.
- Existing request module-state key `fueltrackplus.requests.v3`: no rows found during read-only inspection on November 9. No migration of existing records is claimed.

## Database contracts

One normalized transactional request table, one immutable transition-audit table, and the following signed RPCs (no direct table grants):

| Section | Backend source / operation | Limit |
|---|---|---|
| Dashboard | `fueltrack_v3_read` summary | Server-computed authorized aggregates |
| Analytics | `fueltrack_v3_analytics` | 1–365 days, Manila-local grouping |
| All Requests | `fueltrack_v3_read` rows | Latest 1–200, no full-history cursor yet |
| New Fuel Request | `fueltrack_v3_submit` | Signed requester, idempotency key and validation |
| Approvals | `fueltrack_v3_read` pending summary + `fueltrack_v3_decide` | Admin-only CAS transition |
| LightFuels | `fueltrack_v3_read` queue summary + `fueltrack_v3_mark_refueled`, `fueltrack_v3_complete` | Admin-only CAS transitions |
| Activity | `fueltrack_v3_audit_read` | Immutable source, Admin-only cursor pagination |

The current frontend continues to use its existing reads/disabled controls until the migration is applied and signed acceptance completes. `frontend/fueltrack-v3-domain-client.js` supplies the domain RPC boundary without UI changes.

## Security behavior

- Every RPC rechecks the signed caller, current workspace, module role, exact active Board, and Board `view` or `edit` grant.
- `Admin` can approve/reject, mark physical refueling complete, and save receipt totals; `User` can submit and read only their own requests, provided Board editing is allowed.
- Submitted → Approved/Rejected → Refueling Done → Completed transitions enforce expected revision and are atomic with immutable transition audit.
- Replay of a request's client-provided UUID returns the original record; reuse with changed payload is denied.
- Invoice number is optional. Actual amount and liters must be positive.
- Direct table access is revoked for `anon`/`authenticated` and RLS is enabled. Backend functions use `SECURITY DEFINER` solely for tightly checked RPC writes/reads.

## Verified disposable acceptance

Run using only an isolated PostgreSQL 16 container:

1. `sql/tests/fueltrack-v3-backend-core-fixture.sql`
2. `supabase/migrations/20261109115106_fueltrack_v3_backend_core.sql`
3. `sql/tests/fueltrack-v3-backend-core-acceptance.sql`

Pass result: `FT3_BACKEND_CORE_ACCEPTANCE_PASS`. Covers idempotency, owner reads, role denial, invalid details, cross-workspace denial, signed-out denial, stale updates, allowed transitions, immutable audit, and Analytics.

## Activation still required

1. Review and separately authorize the production schema deployment; apply using the existing migration policy, never ad-hoc production SQL execution.
2. Run signed Admin/User/foreign-workspace/revoked-session runtime acceptance against the deployed functions.
3. Connect the existing seven views and controls to `FuelTrackV3DomainClient`, without redesign; preserve the current fallback only until signed backend readiness is verified. UI actions must stay disabled on denied/unavailable reads.
4. Integrate receipt images through the existing private Supabase Storage with separately reviewed path and RLS restrictions; this migration deliberately stores no unauthenticated upload paths.
5. Verify existing Board integration and determine whether an authoritative Board-item projection is required. There is currently no verified transaction-to-Board synchronization contract in this increment.
6. Verify end-to-end persistence across logout/refresh and dashboard/analytics correctness before calling the feature production-ready.

**Do not** infer production readiness from a passing disposable database or frontend test.
