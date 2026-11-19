# CP-CRM-CONN-03A — Native Application Board Provisioning

**Date:** 2026-11-19
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Scope:** TimeTracker, Fund Tracker, FuelTrack+, TradeLink
**Change:** Only missing canonical-board `viewer` memberships for users with existing enabled application assignments in Work Management

## Baseline

Read-only production reconciliation before the migration found 36 non-platform-admin users with enabled application roles, all with exactly one active workspace membership. Of 144 module-to-board pairs, 138 lack the corresponding native board membership (35 distinct users). The four canonical boards are present and active; existing assignments, workspace membership, and backend session resolution require no changes.

## Implementation

- `supabase/migrations/20261119025306_cp_crm_conn03a_native_board_membership_provision.sql` introduces `private.crm_native_board_provision` provenance. The existing `public.work_board_members` table remains authoritative for board access.
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

## Production activation — 2026-11-19

- PR #565 merged to `main` at `1940f471c7f94b940f075eb553df0c570183ab53`. Required full regression, production build and TimeTracker browser CI checks passed.
- Applied migration successfully to the **existing** Supabase project, recorded remotely as version `20261119025306`. The local file is named to match the actual Supabase migration history; the migration must **not** be reapplied.
- Reconciliation created exactly **138** provenance-linked `viewer` board memberships across **35** distinct users. Missing corresponding board memberships among the 36 already assigned, active non-platform-admin users fell from 138 to **0**.
- Read-only database identity-claim simulation with an existing signed employee's Auth session found the **four** canonical boards in `wm_list_boards('active')`. All four `work_board_access(board_id,'view')` calls returned `true`; TimeTracker `edit` and `manage` returned `false`.
- Production integrity: 138/138 provenance revisions match system-provisioned viewer rows; no wrong-workspace, inactive-board, or changed-role provenance entries. Private provenance RLS enabled; four internal sync triggers installed.
- These are database claims and contracts, **not** a replacement for actual employee browser acceptance. Actual end-to-end employee UI/clock-in/domain workflow verification remains pending.
- No production board creation, no new Supabase project, no unrelated role/RLS/permission-policy changes.
