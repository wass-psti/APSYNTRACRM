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
