# CP-TEAMS-01 — Teams-first User Role Management (review proposal)

**Status: frontend UI and signed RPC contract staged; new Teams schema and application permissions NOT deployed.**

## Product behavior

The existing User Role Management route presents a screenshot-proportional near-fullscreen Teams modal, with a fixed-width left list and selected-team details on the right. It contains the neutral/optional image cover, overlapping avatar, compact Users and Content tabs, owner crowns, separate System Admin shields, search, filters, team action menus, empty/skeleton/error states, and dark/light toggle. Esc or X closes. The modal is responsive and gets counts exclusively from signed data; when the backend RPC is unavailable it shows a pending activation state and permits no role changes.

The existing frontend is vanilla JavaScript/CSS, not React. New modules:
- frontend/teams/teams-ui.js — presentation
- frontend/teams/teams.css — dark/light responsive visuals
- frontend/teams/teams-controller.js — interactions and signed verification
- frontend/teams/teams-client.js — fail-closed RPC contract
- frontend/app.js — route integration
- frontend/tests/teams-console.test.mjs — source and contract tests

## Proposed data model

Staged SQL: sql/cp-teams-role-management-CANDIDATE-NOT-APPLIED.sql

| Table | Scope/purpose |
| --- | --- |
| public.apsyntra_teams | Workspace team ID, name, avatar, cover, is_system and created_at |
| public.apsyntra_team_members | Unique (team_id,user_id), owner, attribution, timestamp |
| public.apsyntra_team_content | Unique team/content mapping and access level |
| private.apsyntra_system_admin_grants | Explicit, attributable, revisioned grant and revoke |
| private.apsyntra_teams_audit_log | Append-only actor/action/target/time/metadata |
| private.apsyntra_teams_revision | Workspace optimistic concurrency |

No authenticated or anonymous table-level access is granted. Signed snapshot and serialized change RPCs protect updates. Canonical General administration uses its is_system flag, not its name. That team confers inherited System Admin. Other users require explicit System Admin grants; IT department and team owner status never infer the global role. A nonempty team must retain one owner; the system team cannot be deleted; at least one effective active System Admin must remain. Mutations write audit evidence and use revision checks.

## Mandatory activation gates

1. **Explicit initial System Admin**: the candidate has no hardcoded email or user ID. A DBA must approve a known active bootstrap UUID; an operator must set the transaction-local approved_seed_admin setting during the authorized change. The candidate currently requires that identity to have membership in every existing workspace, or it fails and rolls back. Never select this account by department.
2. **Disposable PostgreSQL 17 tests** against the actual baseline: schemas, function ownership, RLS, Security Definer, session revocation, bad IDs, cross-workspace denial, concurrently stale requests, last owner, last admin, audit and rollback.
3. **Legacy role migration**: current CRM admin, bootstrap, old System Admin candidate, per-user board invitations and per-module roles must be mapped to the new grants safely. Do not erase existing assignments or silently widen permission.
4. **Board authorization integration**: the proposed effective board access helper is NOT wired to all currently authoritative board read/write/RLS/allowed() checks. It must be integrated and independently tested so direct Viewer/Editor grants and team Viewer/Editor grants union correctly, with immediate revocation after removal.
5. **Domain authorization**: all boards, workspaces, HR records, TimeTracker, TradeLink, finance approvals, Storage and other app domains require explicit audited System Admin backend checks. The current candidate remains workspace-scoped, not universal cross-workspace control. Never use client badges or service-role/RLS blanket bypass to claim full authority.
6. **Board Invite team search**: the Invite UI now includes optional server-verified team-name matches and Viewer-only bulk team assignment. The signed lookup/invite RPCs are staged in sql/cp-teams-board-invite-CANDIDATE-NOT-APPLIED.sql. Until that candidate is separately reviewed and deployed, the new team search is disabled and existing person invitations remain unchanged. A board owner or System Admin is required by the staged RPCs. Effective team-derived board access still requires existing board authorization integration.
7. **New workspace lifecycle**: the candidate seeds General administration only in existing workspaces. New-workspace creation must atomically seed the system team, have an approved recovery owner and protect uniqueness. This is an activation blocker.
8. **High-assurance administration**: require recent MFA/reauth for privileged grants/removals, plus full audit review, revoked/inactive account tests, recovery procedures and a rehearsed rollback. Production requires explicit change approval and genuine signed two-account staging acceptance.

## Current scope and boundaries

- Folder/app access writes are intentionally denied until their authoritative resource registries exist. Signed board assignment is the only modeled content mutation.
- Existing CRM/module per-user backend role assignments are left intact; the new Teams screen does not automatically convert them.
- Avatar/cover editing takes allowlisted public HTTPS URLs. There is not yet an integrated secure Storage upload.
- The UI can be merged without deploying its SQL; this does not mean production team roles or full-app System Admin access are active.
- The SQL is a review candidate, not a verified production migration.

## Acceptance

- [ ] CI frontend tests/build and Chromium browser visual + keyboard accessibility checks
- [ ] Disposable real PostgreSQL 17 schema/mutation tests
- [ ] Reviewed actor/session and two-user signed negative tests
- [ ] Approved initial System Admin and new-workspace bootstrap
- [ ] Effective team/direct board permission enforcement and production activation of staged Invite team search
- [ ] Domain access/MFA and cross-workspace authority model
- [ ] Controlled staged rollout, audit and rollback approval

**Never auto-apply the candidate SQL on production.**
