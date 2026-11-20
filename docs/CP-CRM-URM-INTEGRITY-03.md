# CP-CRM-URM-INTEGRITY-03 — Signed Two-Account Native Capability and Scoped Role Matrix

**Date:** 2026-11-20 Asia/Manila
**Disposition:** Implemented acceptance infrastructure; full cross-user runtime certification requires genuine same-workspace signed test accounts and nonproduction authorized role mutation.

## Requirements and evidence separation

1. **Canonical workspace-scoped role setters:** The CI matrix runs five independent PostgreSQL 17 disposable cases, using existing checked-in fixtures, migration functions and authoritative acceptance SQL. Cases are Fund Tracker, six scoped applications (TimeTracker, FuelTrack+, TradeLink, Order Intake, Employee Evaluation, APS AIMS), Charter Navigator, FuelTrans and Tool Traceability. Existing tests exercise assignment/revocation, fresh persisted readback, expected-revision conflicts, source domain integrity, allowed/denied effective permissions and isolation where implemented in the respective fixture. The cases intentionally reuse the exact source tests rather than implementing a parallel role engine.
2. **Signed native UI readback:** `scripts/cp-crm-urm-integrity-03-signed-native.mjs` attaches only to existing genuine Chromium tabs through local CDP. It requires two explicit authoritative account pseudonyms and compares signed `wm_auth_access_context` and `apsyntra_crm_my_effective_access` responses. For each of the four currently native applications, it visits the native route *only if* the signed module projection explicitly reports `allowed: true`. It then checks native UI visibility, canonical Board ID, user/workspace identity and one signed domain RPC, and restores the tab's original URL. A denied module is classified `NOT_ASSIGNED`, not probed by navigation.
3. **Cross-user propagation:** Two different signed accounts must be in the *same workspace* to qualify for a cross-user acceptance run. Distinct workspaces produce `BLOCKED`, even if both sessions return successful native or effective-access reads. Different-user role changes cannot be proven by same-user `BroadcastChannel` invalidation; eventual focus/realtime reconciliation is a separate runtime requirement.
4. **No live user mutation:** No production roles, assignments, grants, RLS, credentials, business records or schema are changed. Any role-change execution uses synthetic disposable PostgreSQL. No new Supabase project is created.

## Scoped acceptance definitions

- **VERIFIED:** Tests actually executed and passing in CI or observed through genuine signed RPC/DOM evidence.
- **IMPLEMENTED-UNVERIFIED:** New code/scripts that have not yet executed under the required real environment.
- **PENDING:** Signed same-workspace administrator→employee role mutation/readback, affected-user allow/deny business workflow tests, repeat access after logout and direct reauthentication, simultaneous conflicting signed writes, and cross-user propagation without manual refresh.
- **NOT APPLICABLE:** Staged-only Role Configuration proposals as proof of operational grants, conversions of the eight future native applications, and historical Charter Navigator role mapping changes.

## Next milestone if any acceptance requirement is unresolved

**CP-CRM-URM-INTEGRITY-03B — Same-Workspace Two-Account Mutation, Native Workflow Allow/Deny, Reauthentication, and Cross-User Reconciliation Closeout.** Use two genuinely signed nonproduction accounts within the same workspace and reversible nonproduction fixtures. Do not lower permission controls or automatically alter production assignments to make a test pass.

## Genuine signed November 20 runtime observations

The authorized Chromium QA profile held **two independently authenticated accounts in different workspaces**, so the cross-user same-workspace propagation condition was not satisfied. No production credentials, tokens, identifiers, roles or business records were copied or modified.

| Genuine signed check | Result |
| --- | --- |
| Both browser tabs signed and active; signed workspace-context and effective-access RPCs | VERIFIED (HTTP 200) |
| Signed workspace-member account, TimeTracker / Fund Tracker / FuelTrack+ / TradeLink | VERIFIED, four visible native UIs, four canonical Board contexts, and HTTP 200 domain reads |
| Second signed workspace-owner account; effective-access projection | REPORTS 12 of 12 modules allowed |
| Second account's four native routes | BLOCKED: native interfaces not visible within 25 seconds |
| Independent TimeTracker native resolver diagnostic for the second account | **FAILED PROJECTION/ACTUAL ACCESS PARITY**: signed native resolver HTTP 403, SQLSTATE `42501`, `Native application assignment is not active`, despite the effective-access projection reporting TimeTracker allowed |
| Same-workspace cross-user role-change propagation, logout/reauthentication, allowed/denied business mutations | PENDING: no shared-workspace signed employee test pair or production-write authorization |

**Root-cause boundary:** The checked-in `private.native_application_board_context(text)` requires `public.has_module_access` and a non-null `public.module_role_for` before selecting the canonical native Board. A broader effective-access projection can therefore advertise an application as allowed without the native resolver accepting the current signed user in that workspace. The native 403 precedes the Board lookup; it is incorrect to conclude from this error alone that the canonical Board is missing. No grant or privilege bypass was introduced to make the account pass.

**Scoped functional correction:** TimeTracker's previously hard-coded “Existing attendance board unavailable” screen now displays the actual signed `state.ttError` and uses an access-unavailable heading when the server denies native assignment. This is a diagnostic/presentation fix, not an authorization change. The signed acceptance runner now classifies HTTP 403 after positive projection as `FAILED_PROJECTION_NATIVE_MISMATCH`, not generic timeout/Board-missing.

**Disposable SQL verification:** All five role domains (Fund Tracker; six scoped; Charter; FuelTrans; Tool Traceability) passed after correcting the FuelTrans acceptance runner to keep the synthetic actor in one `psql` session. These exercises verify real isolated SQL behavior and do not certify live cross-user propagation.

**Required next closeout:** Resolve the discrepancy between effective module projection and native module-role authority for the affected workspace *without silently widening access*. Determine the intended current assignment/board mapping and obtain separate approval before any changes to actual production permission records. Repeat genuine same-workspace two-account login, authenticated capability allow/deny, controlled revocation, refresh/reauthentication, and cross-session propagation. The eight future native conversions remain out of scope.
