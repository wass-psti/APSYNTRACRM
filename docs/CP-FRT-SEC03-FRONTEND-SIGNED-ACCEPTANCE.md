# CP-FRT-SEC03 — Frontend Reconciliation and Signed-Session Acceptance

**Date:** 2026-10-30  
**Source repository:** wass-psti/APSYNTRACRM  
**Feature branch:** security/cp-frt-sec03-frontend-signed-acceptance  
**Release boundary:** Do not merge this branch into main without explicit approval.

## Confirmed current facts

- The existing APSYNTRA CRM frontend already uses centrally verified bootstrap-only routes for Role Configuration and User Role Management. User-role writes pass through the existing server-authorized RPC rather than direct table mutation.
- Central FRT operational role vocabulary remains exactly GENERAL_MANAGER, FINANCE_MANAGER, FINANCE_APPROVER, REQUESTOR.
- Prior read/write database acceptance independently confirmed that four FRT QA Auth identities were permanently removed and all three legitimate FRT memberships, 121 central module-role assignments, 74 boards and 15,469 board events were preserved.
- A current source-code search of the deployed frontend repository found no hardcoded FRT QA identity selectors. The frontend must rely on signed, server-generated workspace snapshots; do not add string-based filters for valid users.
- Corrected role-configuration text escaping for apostrophes in server-sourced role/user labels.
- This is a distinct frontend repository from the unavailable primary WatchdogWorkspace local repository. It does not prove native board-host or 12-board integration acceptance.
- Historical GitHub PR #5 and PR #7 were already merged into this frontend repository's main before SEC03. SEC03 makes no change to main.

## Implemented in feature branch

1. frontend/frt-sec03-signed-acceptance.js — read-only signed acceptance using the active Supabase Auth session; validates verified user/context, FRT role vocabulary, disabled direct FRT legacy admin read, bootstrap/nonbootstrap scoped snapshots, and an out-of-scope role read. Bootstrap also checks existing FRT operational bootstrap data. It never exports authentication secrets or performs role changes.
2. frontend/tests/frt-sec03-signed-acceptance.test.mjs — isolated unit tests for bootstrap and nonbootstrap scenarios, legacy RPC accidental exposure, missing signed session, and no role writes.
3. frontend/role-configuration-ui.js + its existing regression test — repair text escaping of apostrophes.
4. CI branch coverage — run existing frontend checks and regression suite on SEC03 feature branch.

## Genuine signed-session acceptance (not yet performed)

The acceptance helper MUST be executed in a trusted APSYNTRA CRM tab with an existing genuine login. It is not automatically executed by CI and must not be claimed as complete from synthetic unit tests.

After this source is deployed to an approved **nonproduction test origin**, using the normal sign-in flow:

1. Sign in as an existing authorized bootstrap administrator; open Developer Tools Console.
2. Execute the following in that same trusted tab:

~~~js
const {AuthClient}=await import('/APSYNTRACRM/frontend/session.js');
const {DomainApi}=await import('/APSYNTRACRM/frontend/data.js');
const {runFRTSec03SignedAcceptance}=await import('/APSYNTRACRM/frontend/frt-sec03-signed-acceptance.js');
const auth=new AuthClient();
if(!(await auth.restore()))throw Error('Sign in normally in this tab first');
const report=await runFRTSec03SignedAcceptance({auth,api:new DomainApi(auth)});
console.log(JSON.stringify(report,null,2));
~~~

3. Expect scenario BOOTSTRAP and all checks PASS; rerun after signing out and signing in with an existing authorized nonbootstrap user. Expect scenario NONBOOTSTRAP, with both central read surfaces denied and the legacy FRT user list inaccessible.
4. Keep only the sanitized result object. **Do not share tokens, refresh credentials, account IDs, or passwords.**
5. Independently confirm FRT membership, central role assignment, board and audit counts in the connected backend.
6. Check no production role changed and no unauthorized data was exposed.

The import path above is for a hosted /APSYNTRACRM/ test build. Do not treat a successful GitHub Pages test as proof of the canonical WatchdogWorkspace local http://127.0.0.1:5173/#/ board host; that host and its central /api/v1/boards contracts require separate genuine signed-user acceptance.

## Checks this read-only helper does not certify

- Role assignment mutation/revocation, audit correlation, fresh-session authorization after role changes.
- Revoked access-token rejection by native board host and database.
- Real signed reads and writes across two existing workspaces. The four FRT QA identities formerly used in the secondary workspace were removed during the preceding authorized cleanup; use another genuinely authorized existing account, not mocked or recreated QA identities.
- Native FRT request approval, liquidation, attachment and workspace-isolation workflows.
- Primary WatchdogWorkspace repository state, canonical host, deployment or 12-board acceptance.

## Acceptance classification

| Gate | State |
|---|---|
| QA account retirement | VERIFIED (previous checkpoint) |
| Frontend central-role source reconciliation | IMPLEMENTED-UNVERIFIED until CI |
| SEC03 read-only acceptance implementation | IMPLEMENTED-UNVERIFIED until CI |
| Actual bootstrap/nonbootstrap signed sessions | PENDING |
| Cross-workspace genuine signed read/write | BLOCKED until an eligible existing secondary-workspace session is available |
| Local native board API acceptance | BLOCKED — primary source/host unavailable |
| Merge to main | NOT AUTHORIZED |

No operational data, role assignment or production user mutation is performed by this checkpoint.
