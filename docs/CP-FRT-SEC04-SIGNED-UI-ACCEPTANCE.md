# CP-FRT-SEC04 — One-Click Genuine Signed-Session Acceptance Entry Point

**Date:** October 30, 2026  
**Scope:** APSYNTRA CRM frontend, existing signed session and existing authorized Supabase RPC.  
**Branch:** feature/cp-frt-sec04-signed-ui-acceptance  
**Release:** feature branch only — DO NOT MERGE without explicit user approval.

## Implemented

- Extended the existing Access acceptance page (\`#/security\`) to expose **Run FRT read-only signed acceptance** to existing signed users, including nonbootstrap members.
- Wired the new action directly into the existing CP-FRT-SEC03 session-verification runner: restores no fake identity, tests the current Supabase Auth user and workspace context, then calls existing authorized RPCs only.
- Displays the bootstrap/nonbootstrap result, named checks, and PASS/FAIL/BLOCKED without printing tokens, user IDs or emails.
- Copies only the known nonsecret result fields. Clears prior report on logout, expired session or an identity/workspace switch.
- Preserves the separate 12-board negative-access flow and does not alter permissions, roles, FRT workflow, finance data, bootstrap identities or PostgreSQL schema.

## Automated verification

- Existing APSYNTRA CRM frontend GitHub Actions workflow on this branch runs \`node --check\`, frontend source verification and \`node --test frontend/tests/*.test.mjs\` (including \`frontend/tests/frt-sec04-security-ui.test.mjs\`).
- Synthetic unit clients verify render controls and data sanitization; **they do not establish genuine signed-user runtime acceptance**.
- Independent backend reads on October 30: 41 Auth accounts, 0 retired FRT-QA Auth accounts, 3 preserved FRT memberships, 2 immutable bootstrap identity rows, 121 module assignments, 74 boards, 15,469 board events and 1 workspace with an active member.
- Direct \`authenticated\` and \`anon\` EXECUTE remains revoked from legacy \`frt_admin_users\`, \`frt_admin_set_role\`, and \`wm_admin_set_application_role\`.

## Genuine signed-user acceptance still required

The new one-click button is **feature branch only** and is not live until a separately approved release. The already-merged SEC03 runner is present in the current main branch, so a signed acceptance can be run without deploying SEC04 by using this self-contained console call on the existing trusted Pages app:

1. Open https://wass-psti.github.io/APSYNTRACRM/#/security and sign in normally as one of the two existing bootstrap administrators.
2. Open Developer Tools Console **in the same logged-in tab** and run:

~~~js
(async () => {
  if (location.origin !== 'https://wass-psti.github.io' ||
      !location.pathname.startsWith('/APSYNTRACRM/'))
    throw Error('Use only the official APSYNTRA CRM page');
  const {AuthClient} = await import('/APSYNTRACRM/frontend/session.js');
  const {DomainApi} = await import('/APSYNTRACRM/frontend/data.js');
  const {runFRTSec03SignedAcceptance} =
    await import('/APSYNTRACRM/frontend/frt-sec03-signed-acceptance.js');
  const auth = new AuthClient();
  if (!(await auth.restore())) throw Error('Sign in normally first');
  const report = await runFRTSec03SignedAcceptance({
    auth, api: new DomainApi(auth)
  });
  const {checkpoint,status,scenario,checks,writesAttempted,reason} = report;
  const safe = {checkpoint,status,scenario,checks,writesAttempted,reason};
  console.log(JSON.stringify(safe,null,2));
  return safe;
})()
~~~

3. Record only the sanitized result. After signing out, repeat under an existing nonbootstrap account with legitimate workspace access. Do not create new QA identities or copy any tokens.
4. Expected results: \`scenario=BOOTSTRAP\` and all PASS; \`scenario=NONBOOTSTRAP\` and all PASS including both central read denials. Any other outcome is **not accepted**.
5. Independently corroborate role assignments, FRT memberships and audit counts before claiming any acceptance. This test performs no mutations and does not establish role-change/revocation or new-session acceptance.

## Explicit blockers

- The connected browser tool cannot access the origin browser context in this chat; it cannot use the user's active Supabase session or click the UI on their behalf.
- Current backend has only one workspace with active memberships, so genuine two-workspace read/write denials cannot be established without a different existing authorized workspace account.
- The canonical \`http://127.0.0.1:5173/#/\` host and its \`/api/v1/boards\` API are not reachable through this GitHub/Supabase integration. GitHub Pages signed acceptance is not sufficient proof of the native canonical board runtime.
- Full FRT finance workflow, role-change audit and fresh post-revocation signed-user certification remain pending.

## Existing source-control exception

Earlier draft PR #8 was merged into \`main\` at 2026-10-30 12:36:27 UTC by external action before this checkpoint. The corresponding GitHub Pages build and frontend CI succeeded. This fact does **not** waive the standing requirement of explicit user approval for future merges. No source merge or deployment is part of SEC04.

**Classification:** Signed UI entry point IMPLEMENTED-UNVERIFIED until CI and browser acceptance; genuine signed-session acceptance PENDING; cross-workspace and local native-host acceptance BLOCKED.
