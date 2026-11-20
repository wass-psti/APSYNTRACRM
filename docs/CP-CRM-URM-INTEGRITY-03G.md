# CP-CRM-URM-INTEGRITY-03G — Genuine Native Readback and Same-Workspace Mutation Readiness

**Date:** November 20, 2026, Asia/Manila. **Disposition:** signed four-application native startup VERIFIED; same-workspace Administrator-to-Employee role mutation BLOCKED (prerequisite), cross-user synchronization PENDING. No production role/permission/membership/business changes.

## Genuine signed runtime evidence

- Both original Chromium tabs were reloaded and independently returned HTTP 200 from `wm_auth_access_context` and `apsyntra_crm_my_effective_access`, with effective CRM roles **Admin** and **Employee** and correct signed workspace projections. These accounts currently have **different selected workspaces**.
- Existing signed native matrix runner was exercised against the same two sessions, navigating only authorized native routes, and restoring original navigation after inspection. The employee's **TimeTracker**, **Fund Tracker**, **FuelTrack+** and **TradeLink** each loaded its canonical native Board, returned HTTP 200 from a domain RPC and had **zero page errors**. This verifies four application startups, not cross-user mutation or propagation.
- The admin's currently selected personal Main Workspace projects each of the four modules as `NOT_ASSIGNED`. This matches the preexisting server behavior: 03E remains a **disposable, nondeployable owner-native integration candidate** and is not production authority.
- Production role writes, business writes, membership writes and permission changes: **zero**.

## Reproducible acceptance classification

`scripts/cp-crm-urm-integrity-03g-acceptance.mjs` consumes only two sanitized logs: the JSON emitted by the existing 03F signed preflight and the `CP_URM03_SIGNED_READONLY` result of the existing native matrix probe. It requires exact independent actor/workspace pseudonyms, the same signed workspace, Admin and nonadmin roles and all four target native contexts (Board match, HTTP 200 domain RPC, no page errors). If all those prerequisites pass, the highest possible outcome is `READY_FOR_MUTATION` — it never declares a role mutation or cross-user acceptance from startup reads. Actual signed mutation, target refresh/relogin, allowed/denied operations, cross-session projection, and reversible cleanup must be established separately through independently checked signed runtime evidence.

For the current genuine signed readbacks, the classifier returns `BLOCKED / WORKSPACE`. This is **not** an application failure and **not** evidence of an unauthorized role mutation. The existing `frontend/platform-sync.js` already provides focus/visibility reconciliation of authoritative signed role information; the same-user `BoardCacheChannel` intentionally does not broadcast permissions across unrelated users. No background polling agent or new access policy is added.

## Scope and acceptance boundary

- No new Supabase project, RLS/grant/permission rewrites, bootstrap identity changes or production schema activation.
- No automatic workspace role elevation to manufacture an eligible administrator/employee pair.
- No production test role assignments or cross-user notification payloads.
- To complete genuine acceptance, use an authorized **nonproduction** administrator and employee in one workspace. Verify a reversible assignment, database receipt and target readback, native allowed/denied action, refresh/relogin, cross-user synchronization and exact restoration. A separate authorization is required for material changes to production permissions or role assignments.

**Next if still blocked:** `CP-CRM-URM-INTEGRITY-03H — Same-Workspace Signed QA Administrator Prerequisite, Reversible Four-Native-Role Mutation, and Final Cross-Session Acceptance`.
