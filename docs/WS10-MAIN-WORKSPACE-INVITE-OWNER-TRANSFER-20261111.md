# WS10 — Restricted Workspace Creator, Ownership and Board Invitation Integration

**Date:** November 11, 2026  
**Base:** `main` at `60d7a79d7cc9fdc302ecd08066fb059147042ecf`.  
**Integration:** `feat/ws10-creator-owner-invite-main-20261111` (review before merging).  
**Live deployment:** NO. All SQL in this change is candidate-only; no direct Supabase mutation or email delivery.

## Final user-approved access model

1. **Workspace creator authority:** Only an explicitly approved IT Admin or a **verified owner of an existing workspace** may create a new workspace. Ordinary members/employees cannot create, even if their CRM `platform_role` says generic `admin`. Server authority uses an explicit private IT Admin roster plus signed owner memberships; do not guess IT Admin from email suffix, frontend role selection or app administrator.
2. **Creator automatically becomes owner:** `wm_ws01_create` retains its original atomic INSERT into `workspaces`, `workspace_members`, `private.ws01_member_roles (owner)`, request idempotency and audit. No implicit workspace selection.
3. **Ownership transfers:** Current owner or IT Admin with verified **target-workspace membership** may transfer to another active verified member of the same workspace. One owner per workspace is enforced, and transfers are serialized/audited. Losing ownership does not delete the person's workspace membership. Ordinary members cannot transfer.
4. **Workspace invitations are the account-admission channel:** Workspace owner invites an email. Pending email invitation is NOT an authenticated account; verified acceptance provisions only membership to that workspace. No public self-registration and no automatic access to any board.
5. **Board visibility:** Exact-board direct member assignment or an approved workspace group assignment is necessary. Workspace membership alone does not confer access; administrators' separately approved override must be independently verified. Group creation/member changes are server-authorized, not local user-list updates.
6. **Application ownership:** Distinct from board membership. A private per-workspace module-owner registry is staged, with NO live app ownership change until each existing standalone application's RPC/RLS/Storage/domain roles adopt it, especially modules currently using globally keyed assignments.

## What was implemented in source

- Ported BS08/BS09 Share & Access, circular-member People popup, People/Groups board selector, and workspace invite launch into the **latest main code** without wholesale merging the divergent older experiment branch.
- `frontend/ws10-ownership.js`: signed exact-user/workspace creator eligibility, explicitly signed IT Admin receipt parser and client, default-OFF policy flag, strict owner-transfer client for workspace/application identifiers and post-RPC confirmation.
- `frontend/workspace-ui.js`: creation modal checks verified owner or signed IT Admin capability AND the reviewed backend activation flag; unverified creation is only a local draft. A successful creation offers **Open new workspace**, which calls the existing signed CAS selection client, rechecks the owner membership and reloads only after post-selection verified context. No localStorage workspace override, fabricated context or direct DB writes. Workspace owner sees a **disabled** ownership-transfer affordance until activation.
- `frontend/board-share.js`: existing workspace invitation dialog and member/group picker; protected modules show disabled app ownership transfer, not an unrestricted admin role.
- `sql/ws10-creator-owner-transfer-CANDIDATE-NOT-APPLIED.sql`: source-fingerprint-locked replacement of existing `wm_ws01_create`, explicit private IT Admin creator allowlist, deny-by-default flags, signed creator read RPC, one-owner partial index, audited atomic transfer RPC (NO EXECUTE grant). Critically: **running this candidate without subsequent approved activation would disable creation for everyone**.
- `sql/ws10-application-ownership-CANDIDATE-NOT-APPLIED.sql`: private workspace/module owner registry only; no live app authorization or transfer.
- `sql/bs09-workspace-board-access-groups-candidate.sql`: private RLS/default-deny group/board grant candidate, not integrated into public `work_board_access` or `wm_list_boards`. NO production group grants.
- Focused tests for exact actor, signed role receipt, default-off, owner-on-create, transfer idempotency and board/group isolation; existing frontend and CSS bundle regressions included.

## Why Switch Workspace is still unavailable in the user's live Supabase

`docs/CP-WS01-SIGNED-WORKSPACE-SWITCH-20261110.md` and `docs/CP-WS01-FUNCTIONAL-SWITCH-ATOMIC-20261110.md` state that `wm_ws01_select(uuid,uuid)` and the membership-revocation pruning hook were absent in the last live check, `selection_enabled=false`, and `current_workspace_id` still selected the old membership. The safe atomic replacement migration is `sql/cp-ws01-atomic-functional-selection-CANDIDATE-NOT-APPLIED.sql` in existing draft PR #206. This is an **authorization resolver shared by many modules**. Do not call it a localhost problem or flip a JavaScript flag; production activation requires protected source-faithful tests and rollback evidence.

After that backend is approved, a workspace newly created by a verified authorized creator will be selectable with the signed flow. The current overview already shows a zero-board empty state; it does not require a separate sample-data store.

## Deployment blockers — do not merge/activate blindly

- [ ] Owner approves the change to creator eligibility (previous docs permitted all verified accounts; WS10 intentionally supersedes that policy).
- [ ] IT partner verifies **live** `wm_ws01_create` exact definition and source fingerprint, `private.ws01_member_roles` uniqueness, public grants, current workspace lifecycle flags, existing two/three-way role mappings, and Auth triggers. Guard intentionally refuses source drift.
- [ ] Designate approved IT Admin creator identities via a private, audited roster; avoid embedding real emails or IDs in GitHub or JavaScript.
- [ ] Validate owner creation and transfers with **real isolated PG17** session/revocation/duplicate-claim/foreign-workspace/expired-user tests, and verify snapshots+rollback.
- [ ] Review and separately authorize existing PR #206 protected workspace-selection cutover against 73 affected caller paths and the two changed fingerprints in its production preflight.
- [ ] Review the existing WS02D email delivery and acceptance SQL/Edge candidates, harden Auth signup bootstrap triggers, configure approved verified SMTP and deny unapproved signups. No direct service-role key in frontend.
- [ ] Review BS09 group-grant RLS/RPC/Storage/export/Realtime enforcement; only one non-sensitive QA board pilot after full denial checks.
- [ ] Define per-app owner transfer capabilities and role ceilings in module domains; do not apply the private registry alone.
- [ ] Compare new branch against head of rapidly changing main, run complete CI and IT partner review. Main and Supabase production remain unchanged pending separately approved release.

## Test now

From GitHub Desktop, switch to `feat/ws10-creator-owner-invite-main-20261111`, fetch/pull. Run the usual localhost frontend on port 8001. Inspect **Share & access → People / Groups**, **People**, and workspace selector. **Restricted workspace creation, app/workspace ownership transfer, invitation sending, and group assignment remain disabled pending backend deployment.** These are intentional safety states, not broken UI buttons.

## Live acceptance after protected deployment

- Approved IT Admin or existing owner creates workspace `QA Client Portal`; signed owner membership recorded and unrelated existing memberships unchanged. Ordinary employee creation must return signed **403** even by direct RPC.
- Click **Open new workspace**; signed session selection and reload change `current_workspace_id`. Empty workspace overview appears with zero authorized boards.
- Owner invites `qa-recipient@example.test`; verify acceptance creates account and one workspace membership, **no board membership**.
- In one board, owner assigns QA user individually or a workspace group; board A visible, board B/HR/Finance private by direct API. Revoke; next request denied. Pending email or forwarded link cannot bypass verified ownership.
- Transfer workspace ownership to a verified member; previous owner loses owner capabilities, remains member; retry/idempotency and concurrent-owner check pass. Repeat app transfer only after module-specific integration tests.
- Confirm existing employees can still access only their authorized old workspace boards and that no global module role leaks across workspaces.
