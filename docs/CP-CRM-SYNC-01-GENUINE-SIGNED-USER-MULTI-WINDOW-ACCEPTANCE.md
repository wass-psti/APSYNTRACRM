# CP-CRM-SYNC-01 — Genuine Signed-User Multi-Window Synchronization, Live Mutation Propagation, and Cache-Coherence Acceptance

**Date:** 2026-11-15
**Status:** IMPLEMENTED — frontend regression and synthetic browser acceptance passed; production deployment and same-identity live multi-window write acceptance remain pending.
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Base commit:** `fb351f488a26d9d23c4bd2c82cb6e5fa07e97387`
**Branch:** `feat/cp-crm-sync-01-genuine-multi-window`

## 1. Scope and guardrails

This increment closes the remaining client-side synchronization paths that could leave CRM windows displaying stale module-owned data after a successful write or when returning to a previously open application window.

- Keep signed sessions, server-side RBAC/RLS, workspace isolation, board view/edit/manage checks, and existing mutation validation authoritative.
- Do not add roles, grants, memberships, approval gates, or new restrictions.
- Do not change authentication storage from `sessionStorage` to `localStorage`; no bearer/session token is broadcast or copied between windows.
- No production record was created, updated, deleted, or otherwise mutated during this increment.
- No database migration, DDL, RLS policy, database setting, extension, or project change was made.
- No persistent data cache, background worker, polling service, telemetry, or monitoring agent was added.
- Broadcast messages remain content-free invalidation hints. All visible records are re-read through existing signed server APIs.

## 2. Root-cause findings

### 2.1 Incorrect User Role Management mutation name

The exact write classifier contained `apsyntra_crm_role_manage_user_access`, while the actual caller invokes `apsyntra_role_manage_user_access`. The successful write therefore did not publish the expected post-commit cross-window invalidation.

### 2.2 Native Issues bypassed `DomainApi.rpc`

Native Issues mutations use the signed `apsyntra-native-issues` Edge Function and verified transaction receipts. This path invalidated neither the board cache nor other windows after a confirmed commit.

### 2.3 FuelTrans bypassed the CRM mutation broadcaster

The embedded FuelTrans module uses direct signed PostgREST table writes rather than the CRM `DomainApi.rpc` wrapper. Successful writes therefore did not publish an invalidation to other CRM windows, and the mounted FuelTrans view had no host-driven refresh hook.

### 2.4 Module-owned data was not refreshed by board snapshot reconciliation

The generic board reconciliation refreshed board metadata and board items, but the active FuelTrack and TradeLink tabs also own signed projections outside the board snapshot:

- FuelTrack backend snapshots and activity lists.
- TradeLink activity, saved-draft/document lists, and the currently selected draft/document revision.

Those projections could remain stale even when the parent board had been refreshed.

### 2.5 Local editing state needed additional protection

The cross-window edit guard did not account for FuelTrack loading/submission/refueling state, TradeLink unsaved draft changes, or the Material Sourcing add view. Refreshing module-owned data during those states could overwrite user work.

### 2.6 Profile avatar changes had no cross-window hint

A successful profile avatar save updated only the current tab's context and rendered state. Other tabs could continue showing the previous avatar until a later full refresh.

## 3. Implemented changes

### 3.1 Exact RPC classifier correction

- Replaced the incorrect role-management RPC alias with the actual `apsyntra_role_manage_user_access` name.
- Kept the mutation set exact-name based; no broad prefix classification or additional permission behavior was introduced.
- Read-only RPC contracts remain disjoint from the mutation set.

### 3.2 Native Issues commit propagation

- Validate board and workspace UUIDs once and use the validated values for request and receipt comparison.
- Publish a board invalidation only after every signed transaction receipt confirms the expected board, workspace, and revision.
- Invalidate the local board cache before publishing.
- Rejected requests and malformed/foreign-scope receipts do not publish success hints.

### 3.3 FuelTrans write propagation and in-place refresh

- The embedded FuelTrans host now supplies a content-free mutation callback.
- Successful non-GET PostgREST writes under `/rest/v1/` publish a scoped board invalidation only after an HTTP-success response and current host/session validation.
- Ordinary GET reads and failed writes do not publish.
- The host can request a refresh of the existing mounted FuelTrans view after a cross-window invalidation or focus reconciliation.
- Refresh is performed in place; the parent board shell is not rebuilt merely to refresh FuelTrans.
- Refresh is skipped while a FuelTrans operation is busy, while an editable control is focused, or when a control's value differs from its default value. This prevents overwriting active/dirty form state.
- The refresh listener is removed when the module is disposed.

### 3.4 FuelTrack and TradeLink signed projection refresh

- FuelTrack now reloads its authoritative backend snapshot after a relevant reconciliation and reloads the activity projection when the Activity section is active.
- TradeLink now reloads the active Activity or saved-document/draft list after a relevant reconciliation.
- When a TradeLink draft is selected and remains editable, the selected draft is re-read using the signed document read path.
- If the selected draft was archived, removed, or moved out of an editable workflow state, the stale selection is cleared and the refreshed signed list is shown.
- When a TradeLink document preview is open, the selected document is re-read through the manager or assigned-document path appropriate to the current signed role.

### 3.5 Unsaved-state protection

The platform-sync edit guard now defers data reconciliation while any of the following are active:

- FuelTrack backend/activity loading, pending submission, or refueling dialog.
- TradeLink draft save activity or unsaved draft changes.
- Material Sourcing add view.
- Existing modal, inline edit, TimeTracker, role-management, and focused form states.

Authorization reads remain authoritative and are not skipped merely because an editor is open.

### 3.6 Profile avatar invalidation

A successful avatar save publishes a full, content-free invalidation hint to other windows in the same signed user/workspace scope. No avatar bytes, URL, profile fields, or tokens are sent in the message.

### 3.7 Existing board and overview count behavior retained

The signed `wm_list_boards` contract returns `item_count`. Reconciliation compares the refreshed board-list snapshot, including `item_count`, and re-renders when the value changes. No redundant overview refresh path or database query was added.

## 4. Verification completed on the implementation branch

| Check | Result | Evidence |
|---|---|---|
| Full frontend Node test suite | VERIFIED | **2,281/2,281 passed** |
| Exact mutation/read contract | VERIFIED | 59 exact write RPC names; read/write sets disjoint; actual role-management RPC included |
| Native Issues success propagation | VERIFIED | Full valid receipt publishes one scoped invalidation |
| Native Issues failure handling | VERIFIED | Rejected or malformed/foreign-scope receipts publish no success hint |
| FuelTrans successful write propagation | VERIFIED | Successful signed write publishes one content-free host invalidation |
| FuelTrans failed write/read behavior | VERIFIED | HTTP 403 and ordinary GET do not publish |
| FuelTrans refresh lifecycle | VERIFIED | In-place host refresh hook; active/dirty controls protected; listener disposed |
| FuelTrack/TradeLink reconciliation | VERIFIED | Regression assertions cover signed projection refresh and dirty-state protection |
| Overview board counts | VERIFIED | A changed signed `item_count` is read again after cache invalidation |
| Real Node `BroadcastChannel` | VERIFIED | Independent same-scope clients receive the actual BroadcastChannel message |
| Chromium browser fixture | VERIFIED | Actual Chromium, two same-origin tabs, real BroadcastChannel, second tab independently reads updated fixture board |
| Synthetic foreign-workspace/revoked-view checks | VERIFIED | Foreign scope and revoked view denied; signed view authorization rechecked |
| Pages source guard | VERIFIED | `scripts/verify-pages-source.mjs` passed |
| Legacy FRT read guard | VERIFIED | CP-FRT-SEC14 guard passed; external deployed clients/legacy permission retirement not evaluated by this increment |
| JavaScript syntax | VERIFIED | Changed files and all shipped root/FuelTrans JavaScript parsed successfully |
| Diff integrity | VERIFIED | `git diff --check` clean |

The browser fixture uses synthetic signed identities and no Supabase connection. Its request-count reduction is a fixture measurement only, not a production latency or CPU claim.

## 5. Production acceptance prerequisites and limitations

### 5.1 Authentication storage is intentionally unchanged

The existing `AuthClient` stores each tab's signed session in `sessionStorage`. Separate top-level windows do not automatically share that storage. The new cross-window channel accepts messages only when the receiver is signed in as the same user and active workspace; it does not copy tokens or relax session isolation.

The two browser windows available during this implementation held different signed identities. They were not treated as a same-user multi-window pair, and no cross-user session bridge was introduced. For genuine same-user window acceptance, both windows must independently hold a valid session for the same user and workspace (for example, sign in to the second window using the same account).

### 5.2 Production writes were not used as test fixtures

No production board item, document, profile, role, membership, or workspace record was mutated. The implementation and fixture tests prove that successful writes publish invalidations and failed writes do not. A genuine production signed-user write-propagation test requires explicit authorization to update a designated existing QA record or use an already-authorized nonproduction fixture.

### 5.3 Remaining deployment acceptance

- Merge and verify GitHub Pages deployment of the implementation commit.
- Verify live signed reads and focus-return reconciliation with the existing authenticated session.
- Verify two separately authenticated windows for the same user/workspace receive fresh authoritative reads after a successful authorized mutation.
- Verify the same event is rejected across different users/workspaces.
- Perform the live mutation step only against a designated QA record after explicit production-data authorization; otherwise keep it synthetic/read-only.

## 6. Acceptance decision

**Implementation status:** VERIFIED locally and in the synthetic browser fixture.
**Production deployment status:** PENDING.
**Same-user signed multi-window production acceptance:** PENDING — second window must independently authenticate as the same user; no session token sharing was added.
**Production mutation propagation:** PENDING — no production record writes were performed without separate authorization.

No additional database or security changes are required for this increment. The remaining gates are deployment and real-session acceptance, not further architectural work.
