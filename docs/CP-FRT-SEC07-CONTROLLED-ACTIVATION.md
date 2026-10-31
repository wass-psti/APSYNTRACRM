# CP-FRT-SEC07 — Controlled CRM Role Backend Activation and Signed Acceptance

**Checkpoint:** October 31, 2026 (Asia/Manila)  
**Implementation branch:** `feature/cp-frt-sec07-signed-activation-gate`  
**Based on:** Draft PR #11 `fix/cp-frt-sec06-rpc-rollout-compatibility` head `e5a0f09e4e89c7af4974f9915b0b51d11b4b161a`.  
**Production change gate:** Production RBAC schema/permission changes are separately authorized actions. **No production migration was applied.**

## Verified baseline before activation

- CP-FRT-SEC06 frontend from PR #10 is merged and GitHub Pages deployed.
- Existing central Role Configuration, User Role Management, module/board storage and FRT domain authorization remain operational as previously implemented.
- Production Supabase is missing `apsyntra_crm_platform_roles`, `apsyntra_crm_platform_role_snapshot`, `apsyntra_crm_platform_role_set` and the CRM effective/explicit role helpers. The deployed frontend therefore cannot certify CRM authorization.
- PR #11 introduces a narrowly scoped **HTTP 404 + PGRST202** compatibility fallback after the **existing signed bootstrap** snapshot succeeds, preserving the old module/board administration page while disabling all new CRM edits. PR #11 is still unmerged at the CP07 start.
- The two CP-FRT-SEC03 read-only signed scenarios were previously submitted by the operator: bootstrap 7/7 PASS, nonbootstrap 5/5 PASS. They do **not** prove the new CRM backend or native host.
- The CP06 migrations passed disposable PostgreSQL 17 contract tests on GitHub Actions. This is not a complete production-schema compatibility copy.

## New CP07 implementation

- A separate `runFRTSec07ActivationGate({auth,api})` executes only read-only RPCs under the existing verified Supabase Auth session. It does not prompt for or return access tokens, user IDs, email addresses, financial records or login credentials.
- For bootstrap accounts, the gate validates the server's bootstrap decision, requires **both** the existing admin snapshot and new CRM snapshot (no fallback accepted as successful activation), checks each active member has one consistent inherited/assigned/effective CRM tier, checks other-workspace CRM snapshot denial, and checks unchanged FRT operational access.
- For nonbootstrap accounts, the gate requires true server authorization denial (HTTP 403) for **both** the new CRM snapshot and the existing central administrator snapshot. HTTP 404, `PGRST202`, expired sessions and network errors are **BLOCKED**, never permission-test PASS.
- The existing `#/security` page renders a one-click signed activation result with PASS, FAIL or BLOCKED and a sanitized-copy action. The result is cleared on logout, session expiry, login and workspace/identity switch.
- `sql/tests/cp-frt-sec07-readonly-live-preflight.sql` records the repeatable live schema/privilege/invariant inventory without any writes.

## Controlled activation sequence — NOT EXECUTED against production

1. Obtain separate explicit approval for the **specific production authorization migration** after change-impact/security review and restoration/rollback planning. No approval is inferred from PR merge or past general development authorization.
2. Verify a production-equivalent nonproduction schema and complete inter-application role guards, dependencies, baseline audit/record counts and protected accounts. Review the 59 legacy nonadministrator board-owner memberships; do not silently reduce their established authority.
3. Record deployment window, rollback behavior for the introduced functions and role table, and service-side snapshot/restore mechanism for the pre-migration schema. Audit role assignments and protect real sessions.
4. Install `sql/cp-frt-sec06-crm-platform-role-cap.sql`, then `sql/cp-frt-sec06-domain-role-ceiling.sql`, through approved migrations **only after authorization**. Verify installation, hardened function execute grants, RLS table isolation, current Auth/workspace context and domain helper integrity. The role table intentionally starts with zero explicit overrides, preserving legacy access.
5. Redeploy the signed acceptance panel after the compatible frontend release. Under genuine existing bootstrap and nonbootstrap logins, run both CP07 read-only scenarios and save only sanitized results. Do not treat a scripted or synthetic session as genuine acceptance.
6. In an explicitly authorized **isolated nonproduction** workspace/user and board, use the central UI to assign CRM Viewer/Supervisor/Employee/Admin levels, read back the revision, exercise the actual FRT request/approve/liquidation and board view/edit/manage checks, use a newly issued session, then revoke/revert and correlate before/after audit. Never mutate legitimate production employee roles just for testing.
7. Verify cross-workspace isolation against a genuine second existing authorized workspace. Current connected production data contains only one workspace with active members; do not create fake accounts to satisfy the test.
8. Verify canonical local host `http://127.0.0.1:5173/#/` and real `/api/v1/boards`, plus all twelve native application-to-board contracts. GitHub Pages frontend verification is not a substitute.
9. Release only after all required tests and mandatory approvals pass, and after separately approved merge into `main`. Maintain original Auth, domain boundaries and database records.

## Security and status interpretation

| Requirement | State |
| --- | --- |
| Existing dual CP03 signed read-only result | VERIFIED from operator-submitted results |
| Source and live backend preflight | VERIFIED from connected GitHub + Supabase |
| CP07 signed gate implementation and test fixtures | IMPLEMENTED-UNVERIFIED until CI |
| Disposable PG17 CP06 role ceiling and FRT contract | VERIFIED in prior Actions run #41066448701 |
| Full production-schema compatibility | PENDING |
| Production migrations / CRM role live activation | BLOCKED — separate authorization required |
| Real bootstrap and nonbootstrap **CP07** signed acceptance | PENDING |
| Real role-change/revocation, fresh signed sessions and FRT operations | PENDING |
| Canonical Mac 5173 board API and native 12-board acceptance | BLOCKED — no host access |
| Cross-workspace acceptance | BLOCKED — one active workspace |
| Main merge of CP07 / PR #11 | NOT AUTHORIZED |

This checkpoint does not claim production readiness, certification, or **ARCHITECTURE ACHIEVED**.

## Security rationale

The CRM role layer is a *ceiling*, not a replacement for WatchdogWorkspace Auth or a grant of module/board membership. It must not be activated based on a missing RPC, an unsigned test fixture, or a user-editable JWT claim. Authorization must remain checked server-side for each sensitive operation using actual active workspace membership. The new acceptance probe never calls role setter RPCs or mutation endpoints.

**Next action:** Validate CP07 branch CI, then collect real signed read-only results only after the separately authorized, verified backend activation is in place. Preserve existing operational state until then.
