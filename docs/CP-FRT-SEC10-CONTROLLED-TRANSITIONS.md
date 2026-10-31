# CP-FRT-SEC10 — Controlled Role Transitions, Revocation and Fresh-Session Acceptance

**Checkpoint:** 2026-10-31 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Starting `main` commit:** `00fd316baa5ebdd83817ef7dbc1902c49a1c7427`.  
**Frontend canonical testing host:** https://wass-psti.github.io/APSYNTRACRM/#/security  
**Backend authority:** the existing centralized Supabase database, approved CRM role setter and FRT domain guards.

## Prior accepted baseline and scope

The operator submitted both CP-FRT-SEC09 genuine signed-user reports on GitHub Pages: BOOTSTRAP 5/5 (SEC03 7/7 + SEC07 5/5) and NONBOOTSTRAP 5/5 (SEC03 5/5 + SEC07 4/4); zero writes. They establish **read-only administrative boundary acceptance**, not live role mutation, real fresh token issuance, or FRT finance write permissions. The previous CP09 GitHub evidence file recorded bootstrap but the write to append nonbootstrap evidence was blocked; the sanitized acceptance fact is therefore recorded here without identifying the user.

The CP08 live backend previously contained 0 explicit CRM role overrides, 121 module role assignments, 75 board memberships, 3 FRT memberships, 2 bootstrap identities and 0 CRM role-change audit records. The milestone must not change those production records or introduce test users. This document does not claim a new post-CP09 database inventory.

## Implemented, zero-production-write acceptance instrumentation

**Disposable PostgreSQL 17:** `sql/tests/cp-frt-sec10-disposable-session-transitions.sql` executes **only in GitHub Actions**, after the existing CP06 setup, schema, domain ceiling, and original acceptance SQL. It uses the three existing synthetic PostgreSQL fixture users and tests separate transactions:

1. Existing bootstrap fixture assigns `viewer` with the expected NULL revision and checks atomic change/audit receipt.
2. Next transaction changes the JWT-subject test GUC to the nonbootstrap fixture and checks Viewer board view-only, denied board edit/manage, denied FRT module and FRT domain, and rejection of unauthorized role changes/admin snapshots.
3. Bootstrap attempts a stale revision; it must fail with SQLSTATE `PT409` **without adding an audit entry**. Then it assigns `supervisor` with the correct revision.
4. A separate nonbootstrap transaction verifies Supervisor permits FRT Finance Manager and board editing but refuses board manage.
5. Bootstrap revokes the explicit override with the new revision; the setter must remove only the CRM overlay and produce one correlated audit entry.
6. Another signed-subject transaction sees inherited FRT and board-owner authority restored. All 6 audit/request correlations and original module, membership, and Auth fixture counts are required.

The 6 separate database transactions **simulate a new authenticated request using `request.jwt.claim.sub`**. They do not issue a new real Supabase JWT, validate token revocation, or represent production Auth sessions. There are no local Docker/DB prerequisites for the user; CI runs disposable PostgreSQL.

**Post-transition real signed read-only probe:** `frontend/frt-sec10-signed-ceiling.js` and the existing `#/security` page add `Check signed role ceilings — read-only`, requiring an existing nonbootstrap signed user, a board accessible to that user, and a separately verified stage:

| Stage selected by operator | Expected FRT module access | Board view | Board edit | Board manage |
| --- | --- | --- | --- | --- |
| `VIEWER` explicit override | Denied | Allowed | Denied | Denied |
| `SUPERVISOR` explicit override | Allowed | Allowed | Allowed | Denied |
| `RESTORED` override revoked (prior owner + FRT grant) | Allowed | Allowed | Allowed | Allowed |

The probe checks real server RPC results and current `auth.getVerifiedUser()`/workspace consistency before and after, including denial of central administrator snapshots. It never invokes `apsyntra_crm_platform_role_set`, changes accounts, or writes financial data. Copied results contain only fixed names, statuses, the selected stage and zero write counters—never UUIDs, JWTs, emails or PII.

**Important non-certification limits:** The stage is explicitly supplied by the operator, not read from a privileged CRM snapshot by the nonbootstrap user. A false-positive could occur if prior board ownership/FRT grant is not independently documented. A new access token or Auth session is **not** independently attested by the probe. Accordingly `freshSessionIssued: NOT_VERIFIED` and `prerequisiteOwnershipVerified: NOT_VERIFIED` appear in every copied report. No report by itself certifies a real transition, revocation or a fresh session.

## Real acceptance prerequisites and sequence — NOT EXECUTED

All live mutations require specific separately approved **isolated nonproduction** workspaces and existing accounts. The only currently connected Supabase branch was the primary production project; creating a Supabase development branch can incur compute charges. Do not create paid branches or modify legitimate production users to satisfy this gate.

1. Establish an approved isolated nonproduction Supabase backend, with a distinct real bootstrap account and existing nonbootstrap member; confirm that no production records are mirrored. No impersonation, fake Auth accounts or production modifications.
2. Capture initial authoritative CRM snapshot and user/module/board assignments; explicitly prove the target has a real FRT module grant and existing OWNER board membership. Preserve the initial revision and audit count.
3. Through the existing centralized administrator UI, assign `VIEWER`; require the returned `effectiveRole`, `currentRevision`, `changeId` and stored snapshot to match, and exactly one applied audit/change request.
4. Sign out the target, **sign in again via Supabase Auth with an actually newly issued session**, and run `VIEWER` signed read-only capability probe. Collect independent evidence of fresh issuance and denial of real FRT financial write operations only on safe nonproduction records.
5. Have the bootstrap admin attempt an incorrect stale CAS revision; require 409 and **no new applied audit**. Then transition Viewer -> Supervisor using the latest revision; require atomic audit.
6. Obtain another genuinely issued nonbootstrap session; run `SUPERVISOR` capability probe and validate FRT approver/finance restrictions separately without production financial writes.
7. Bootstrap revokes only the explicit CRM overlay with correct CAS revision. Confirm the override is gone and a correlated audit exists. Sign out/reissue Auth session and run the `RESTORED` probe. Verify original FRT and board owner permissions are restored.
8. Check authentication and role boundaries after logout, token refresh, session expiry and workspace changes. Do not interpret client-side hidden buttons as backend authorization.
9. Compare pre/post user, module, board, finance and audit inventories. All original entities must remain intact; the authorized role changes/audit records are the only expected additions.
10. Conduct independent FRT financial operations, native twelve-board, and genuine multi-workspace isolation checks as separate acceptance gates.

**Do not run the role setter against production** without specific additional authorization covering the real account, precise role changes, timing, recovery plan and possible security/operational consequences.

## Status classifications

| Acceptance domain | State |
| --- | --- |
| CP09 pair of operator-reported signed read-only scenarios | VERIFIED based on two supplied browser reports |
| CP10 disposable role setter / CAS / revocation / audit / transaction replay | IMPLEMENTED-UNVERIFIED until this branch's CI succeeds |
| CP10 frontend signed capability probe / fail-closed checks | IMPLEMENTED-UNVERIFIED until frontend CI |
| Production role or finance record changes | NOT APPLICABLE — none authorized or attempted |
| Genuine isolated nonproduction role transitions | BLOCKED — approved target environment/session not established |
| Actual fresh Supabase Auth token issuance evidence | PENDING |
| Independent FRT financial operational acceptance | PENDING |
| Native 12-board and cross-workspace authorization acceptance | PENDING |
| Full CP-FRT-SEC10 final acceptance / production certification | PENDING |

**Next development gate:** Run branch CI. If passed, preserve the isolated tests and add real signed evidence only after an approved nonproduction environment and actor/target are available. Do not advance the 100% completion claim solely from disposable SQL or mocked tests.
