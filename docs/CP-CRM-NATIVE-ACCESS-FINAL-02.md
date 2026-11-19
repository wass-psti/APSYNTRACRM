# CP-CRM-NATIVE-ACCESS-FINAL-02 — Scoped Charter and All-User Native Acceptance

**Date:** 2026-11-20 (Asia/Manila)
**Disposition:** PARTIAL — audit and runtime harness implemented; universal signed-user acceptance blocked by unavailable authenticated employee browser sessions and a historical Charter-role mismatch.

## Production reconciliation (read-only)

Existing Supabase project: `jtlusodorfnyzgyuewkz`. No role assignments, RLS, grants, memberships, credentials, policies, application code or production business records were changed.

The legacy module assignment table contains **265 enabled records across 40 distinct accounts**: **227** have currently effective module roles/access; **35** are active but unresolved Charter Navigator `Employee` assignments; **3** are assignments belonging to the same inactive-profile account. This is a **legacy-source inventory**, not the full native entitlement projection.

The authoritative effective-role/access projection across **12 native module IDs** and active workspace members returned **253 effective user–module combinations**. There were **zero** effective-role-without-access and **zero** access-without-role mismatches in this projection.

| Native module        | Effective eligible users |
| -------------------- | -----------------------: |
| APS AIMS             |                        3 |
| Charter Navigator    |                        4 |
| Employee Evaluation  |                        3 |
| FuelTrack+           |                       39 |
| FuelTrans Standalone |                        3 |
| Fund Tracker         |                       39 |
| Material Request Hub |                        3 |
| Order Intake         |                       39 |
| TimeTracker          |                       39 |
| Tool Traceability    |                       39 |
| Toolbox Issues       |                        3 |
| TradeLink            |                       39 |

The earlier canonical Board check remains **153/153** for the four principal native applications represented by enabled legacy assignments; it is not a complete cross-account browser test.

## Charter Navigator source mismatch and non-destructive decision

- **36** enabled legacy Charter `Employee` assignments were created/updated within approximately nine seconds on November 18, 2026, by one legacy assigner.
- Only **one** corresponding enabled workspace-scoped Charter role (`user`) exists. The remaining **35** have no scoped role.
- The 2026-11-18 `CP-URM-SCOPED-02C` migration explicitly states **no historical role backfill or policy relaxation**. The authoritative `apsyntra_charter_current_role` fallback accepts legacy `admin`/`user`, **not** historical `Employee`.
- Three additional eligible accounts have effective Charter access via another role source, not those legacy rows. Thus four effective Charter accounts overall does **not** mean four of the 36 legacy assignments resolve.
- Do **not** convert all 35 into current `user` assignments without an independently verified intended-access list. Doing so would change production roles/permissions and make historical rows authoritative contrary to the scoped policy.

## Per-user runtime acceptance tool

`node scripts/cp-crm-native-access-final02-signed-matrix.mjs --cdp-url=http://127.0.0.1:9222 --expected-modules=time-tracker,fund-released-tracker,fueltrack-plus,tradelink --expected-user-key=<pseudonymous-key-from-SQL-matrix>`

Run once per **genuinely signed employee browser** with that employee’s pseudonymous key from the authoritative SQL matrix and pass only the native modules independently confirmed for that employee. The runner rejects a wrong signed identity even if the visible navigation appears similar. The runner checks visible navigation, cold-reload UI readiness, signed native Board context, exact canonical Board ID and workspace/identity consistency, successful expected domain reads and unexpected errors. It emits pseudonymous identity keys and never reads credentials, tokens or storage, signs in, impersonates another employee, modifies permissions or writes business records. Missing assigned navigation is **BLOCKED**, not silently treated as unassigned. Only an independently confirmed unassigned module is `NOT_APPLICABLE`.

In the available localhost Chromium profile (CDP port 9222), the CRM displayed the **sign-in form**, so the runner stopped with **BLOCKED: no genuinely signed CRM tab** before checking any module. A separately connected ChatGPT browser tab showed an authenticated CRM administrator interface, but that read-only browser connection cannot substitute for 39 independently signed employee sessions or justify identity impersonation. No signed employee runtime result was fabricated.

## Acceptance classification

- **VERIFIED:** Historical assignments, effective assignment projection, Charter source isolation, and existing four-module canonical Board parity.
- **IMPLEMENTED:** Repeatable per-account/12-module read-only SQL matrix and safe signed-user runtime harness.
- **BLOCKED:** Signed employee cold-start verification using the available QA Chromium session; it is not authenticated.
- **PENDING:** Explicit Charter Navigator intended-access reconciliation, genuinely signed per-account runtime matrix, application-specific permitted workflow acceptance, and final universal acceptance certification.

## Next scoped milestone

**CP-CRM-NATIVE-ACCESS-FINAL-03 — Authoritative Charter Intended-Access Confirmation, Genuine Multi-Employee Signed Runtime Matrix, and Native Application Functional Closeout.** Reconcile the 35 historical Charter candidates to approved current workspace-scoped assignments **only after separate production-role-change approval**, then run the read-only signed browser harness for each applicable employee and perform QA-only workflow acceptance. Do not expand access as a shortcut or claim blanket certification from administrator access or simulation.
