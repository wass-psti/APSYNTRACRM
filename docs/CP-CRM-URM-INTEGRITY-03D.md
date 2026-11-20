# CP-CRM-URM-INTEGRITY-03D — Owner Native Capability and Same-Workspace Two-Account Audit

**Date:** 2026-11-20, Asia/Manila. **Scope:** APSYNTRA CRM User Role Management, existing four native applications and signed independent QA sessions. Production data audited read-only; no account assignment/role/permission/RLS/Board/business record mutation.

## 1. Verified owner capability boundary

The current signed owner of their personal Main Workspace is correctly reported as **CRM Admin** through `apsyntra_crm_effective_role` and the signed projection. The native TimeTracker backend continues to return HTTP 403 because the owner has no active module assignment: `has_module_access` is false and `module_role_for` yields no role. CORE-03C fixed the **accuracy of the projected available modules**, not the underlying server authority.

Production function-source inspection confirmed the distinction:
- `apsyntra_crm_effective_role` recognizes the verified personal Main Workspace owner as `admin`.
- `is_platform_admin` recognizes an active `admin_general_manager` **platform profile**, not every workspace owner.
- `module_role_for` and `has_module_access` use actual scoped module assignments for non-platform admins; an effective CRM Admin role by itself does not synthesize the four native roles.
- Therefore Main Workspace CRM Admin **presentation** and native **execution** remain different. The real owner policy is a material production permission and architecture decision. Automatically installing a grant or rewriting these backend guards is **not** part of this functionality-only milestone; that needs separate explicit approval and narrowly scoped owner/denied-workspace regression evidence.

## 2. Genuine same-workspace, different-user browser acceptance

Read-only production membership check confirmed the two existing QA employees both have active memberships in **Work Management**. Previously the browser tabs had selected different workspaces, leading to a misleading prerequisite claim. Using the existing signed workspace selector, the first tab was temporarily switched to Work Management and later restored to its original personal Main Workspace; both sessions stayed authenticated.

| Genuine signed check | Result |
| --- | --- |
| Two distinct signed users, same Work Management workspace | VERIFIED via both independent HTTP 200 `wm_auth_access_context` responses |
| Effective role in shared workspace for both users | VERIFIED: **Employee / Employee** |
| First user TimeTracker native startup | VERIFIED: native canonical Board, HTTP 200 domain RPC, visible UI, zero page errors |
| First user Fund Tracker, FuelTrack+, TradeLink | NOT ASSIGNED; not navigated to denied native routes |
| Second user all four native applications | VERIFIED 4/4: canonical Board matches, domain RPC HTTP 200, visible UIs, zero page errors |
| Original personal Main Workspace restored in first tab | VERIFIED; both signed sessions remained active |
| Business or permission writes | **0** |
| Signed CRM Administrator in this shared workspace | **NOT PRESENT** in the two QA tabs; both employees |
| Administrator→employee assignment mutation and independent target readback | **BLOCKED** — no genuinely signed administrator in the shared workspace |
| Target allow/deny after role mutation, refresh, reauthentication, concurrent edits, and cross-user propagation | **PENDING**; no mutation executed |

## 3. Acceptance-runner correction

`assessSignedPair` continues to verify independent signed same-workspace **read-only eligibility**. It must not imply role administration or a successful propagation test. `assessAdminEmployeePair` now requires the authoritative effective-access projection from both tabs to show one signed workspace CRM Admin and a separate non-admin target before classifying a mutation test as merely **ELIGIBLE**. Two signed employees now return `BLOCKED` for that higher gate. A successful eligibility preflight **never** counts as persisted role mutation, readback, or capability execution. Positive and denied test cases ensure that different users/workspaces/roles and stale sessions cannot be conflated.

No new authorization restrictions were added to the CRM application; this is acceptance evidence classification only. Existing per-user and per-workspace database checks remain unchanged.

## 4. Remaining next solid implementation

**CP-CRM-URM-INTEGRITY-03E — Scoped Main Workspace Owner Native Role Policy Candidate, Genuine Signed Administrator–Employee Mutation, and Cross-Session Closeout.** First establish the intended owner module-access semantics, including explicit workspace role overrides and the four application-specific native roles. Test on disposable data, and require separate authorization before changing production permission behavior. Use an existing nonproduction administrator and target employee in the same workspace for signed reversible role writes, authoritative readback, actual positive/negative native operations, refresh/re-login and cross-session reconciliation. No new Supabase project and no eight-app conversion in this milestone.

**Disposition:** Same-workspace two-employee native readback **VERIFIED**. Genuine admin-to-employee mutation, automatic owner-native capability parity and final cross-session synchronization **PENDING/BLOCKED**.
