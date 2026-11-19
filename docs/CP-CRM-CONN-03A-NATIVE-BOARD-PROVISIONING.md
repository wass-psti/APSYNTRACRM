# CP-CRM-CONN-03A — Native Application Board Provisioning

**Date:** 2026-11-19
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Scope:** TimeTracker, Fund Tracker, FuelTrack+, TradeLink
**Change:** Only missing canonical-board `viewer` memberships for users with existing enabled application assignments in Work Management

## Baseline

Read-only production reconciliation before the migration found 36 non-platform-admin users with enabled application roles, all with exactly one active workspace membership. Of 144 module-to-board pairs, 138 lack the corresponding native board membership (35 distinct users). The four canonical boards are present and active; existing assignments, workspace membership, and backend session resolution require no changes.

## Implementation

- `supabase/migrations/20261119024533_cp_crm_conn03a_native_board_membership_provision.sql` introduces `private.crm_native_board_provision` provenance. The existing `public.work_board_members` table remains authoritative for board access.
- `private.crm_native_board_sync` maps exactly four module identifiers to four verified board IDs and their existing board names in the original Work Management workspace. It enforces active workspace/profile, exactly one active membership, nonadministrator target, current module assignment and existing CRM role ceiling. It never creates or replaces a board.
- Successful provisioning inserts only a missing `viewer` row, and records its exact membership revision. An existing `owner`, `editor`, or independent `viewer` row is unchanged.
- Revocation removes a viewer row only if the provenance row exists **and** its stored revision matches the unchanged system-provisioned viewer membership. Manual edits, independently assigned board roles, and already-existing board memberships are preserved. Provenance is dropped after a role is revoked or changed.
- Triggers reconcile changes from central assignments, workspace-scoped overrides, FRT workspace memberships, and activation of Work Management workspace membership. No new public API endpoint is created. No existing RLS, workspace policy, role hierarchy, or signed-session contract is changed.
- One bounded migration backfill walks existing enabled application assignments and applies the exact same reconciliation checks.
- `frontend/time-tracker-application.js` now selects the exact existing `TimeTracker Attendance` board ID, preventing older active `TimeTracker` boards from taking precedence during native route discovery.

## Invariants

1. Preserve all pre-existing board roles and independent memberships.
2. Never provision boards from other workspaces, archived/trashed boards, or renamed/similarly named boards.
3. Never grant editor, owner, manage, or other elevated board authority.
4. Never assign an app role, modify a workspace membership, or relax a permission check.
5. Revocation is provenance-based and must not remove independent grants.
6. Repeated reconciliation is idempotent and no more than the missing eligible board memberships are created.
7. No credentials, administrator session impersonation, or new Supabase project.

## Acceptance

The isolated disposable PostgreSQL fixture in `scripts/cp-crm-conn03a-disposable-acceptance.sh` applies the complete production migration against mock authority tables. Assertions cover four canonical grants, existing owner and viewer preservation, disabled and inactive actors, administrator exclusion, multi-workspace exclusion, module role revoke/regrant, FRT source override, workspace-scoped override, invalid/trashed board, workspace activation, and idempotency.

Real employee browser acceptance remains a separate requirement and must use an existing signed employee session after the production database and Pages frontend are deployed.
