# CP-FRT-SEC10 — Isolated, genuinely signed role-transition acceptance

**Checkpoint:** October 31, 2026.  
**Scope:** real signed Viewer → Supervisor → Restored operational acceptance, **nonproduction only**. Does not authorize changes to production users, roles, boards, finances, or Supabase projects.

## Verified production audit reconciliation — no mutation

A centralized `assignment.assign` request created on October 31, 2026, at **05:12:29 UTC** produced one `proposed` and one `applied` audit event referencing the **same change ID**. Database checks confirmed matching actor, workspace, request, and current **Viewer board membership for an existing HR member**. The same timestamp appears on the membership creation record. Therefore the change from 75 to 76 memberships and from zero to two audit-event rows reflects **one legitimate board membership assignment**, not two CRM platform-role transitions.

The production platform role override table remains empty. The signed HR member's inherited CRM role `supervisor` is separate from its Viewer board role, and it has **no FRT module grant**. Neither this HR account nor an existing bootstrap administrator is an appropriate target for a destructive production test.

## Current environment blocker

The connected Supabase organization exposes **one hosted project**, the production WatchdogWorkspace/APSYNTRA backend (`jtlusodorfnyzgyuewkz`). A separate hosted project remains unavailable; no cost-bearing infrastructure was created. **This is no longer a blocker for isolated CI role-transition acceptance:** CP-FRT-SEC10-CI02 now runs real Supabase Auth/PostgREST/PostgreSQL services in a disposable GitHub-hosted native runtime, never against the connected production project. Independent acceptance of production financial workflows and real production role mutations remains outside this CI evidence.

## Implemented isolated runner

- `scripts/cp-frt-sec10-live-guards.mjs`: Rejects production project, unexpected Supabase URLs, missing explicit isolated-mutation intent, missing credentials, duplicate identities, and malformed UUIDs **before any network request**.
- `scripts/cp-frt-sec10-live-client.mjs`: Uses actual GoTrue password logins and `/auth/v1/user` validation, caller-scoped self-access RPC, backend board and FRT permissions. JWT session IDs are compared **solely for distinct-session evidence**, never as a source of role authority. Never stores tokens in public reports.
- `scripts/cp-frt-sec10-nonprod-acceptance.mjs`: Verifies the existing bootstrap and target members, matching active workspace, **pre-existing owner** board membership and FRT module entitlement, no prior CRM override, and valid central admin snapshot. It then exercises:
  1. Bootstrap assigns Viewer using null initial CAS revision; target performs a **separate, genuine GoTrue sign-in** and verifies Viewer ceiling and admin snapshot denial.
  2. Bootstrap attempts stale CAS Supervisor revision; must receive HTTP 409 with no role state change. A correct revision-bound Supervisor transition follows.
  3. Target performs a second distinct sign-in, confirms Supervisor board/FRT restrictions, and rechecks workspace identity.
  4. Bootstrap revokes the explicit role overlay using current CAS revision. Target performs a **third distinct login**, confirms current owner and FRT privileges are restored, and the admin snapshot confirms inherited original role.
  5. Script attempts to clean up its last acknowledged override on failure using CAS, but **never overwrites an ambiguous concurrent assignment**. In any uncertain network acknowledgement it returns `MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED` rather than risking further mutation.
- `frontend/tests/cp-frt-sec10-nonprod-runner.test.mjs`: Mocked HTTP fixtures for production rejection, required signed accounts, stale CAS, 3 distinct login flows, missing FRT/owner prerequisites, bootstrap denial, and uncertain recovery. **Mocked credentials and JWTs are not live authentication evidence.**

## Environment contract

The following are intentionally **not** stored in repository secrets, logs, documents, or commit history. They are supplied locally when an independently approved isolated nonproduction project and **two existing real authorized accounts** exist:

```text
SEC10_CONFIRM_ISOLATED_MUTATIONS=ISOLATED_NONPRODUCTION_ONLY
SEC10_PROJECT_REF=<nonproduction Supabase 20-char project ref>
SEC10_SUPABASE_URL=https://<nonproduction-ref>.supabase.co
SEC10_PUBLISHABLE_KEY=<nonproduction publishable key>
SEC10_WORKSPACE_ID=<existing nonproduction workspace UUID>
SEC10_BOARD_ID=<board with an existing target-owner membership>
SEC10_BOOTSTRAP_EMAIL=<existing isolated bootstrap admin>
SEC10_BOOTSTRAP_PASSWORD=<private password>
SEC10_MEMBER_EMAIL=<existing isolated nonbootstrap target>
SEC10_MEMBER_PASSWORD=<private password>
```

Run only after prerequisites, migration parity, and recovery authority are verified:

```sh
node scripts/cp-frt-sec10-nonprod-acceptance.mjs
```

A safe dry run with missing configuration performs **zero network calls** and reports a BLOCKED result. The actual live runner requires three authorized changes to the **isolated target's CRM override** plus one deliberately rejected CAS attempt; it does not create users, delete app roles, create boards, or change finance records.

## Final independent acceptance gates

1. Verify at least three **distinct server-verified GoTrue session IDs** were issued by separate target logins. Each phase rechecks the central workspace and server decisions; do not infer permissions from user metadata or selected stage labels.
2. In the isolated database, independently read the **append-only** `apsyntra_role_change_requests` and `apsyntra_role_change_audit` ledgers. Confirm exactly three new applied CRM requests and correlated events (Viewer, Supervisor, revoke), **zero applied event** for the stale CAS denial, the expected change IDs, and the original audit baseline. The runner cannot read the privileged ledger through nonbootstrap RPCs and deliberately returns `CAPABILITY_PASS_AUDIT_PENDING` rather than final certification.
3. Verify initial and final workspace members, board owner membership, FRT assignment, financial records, bootstrap identities and central authorizations are unchanged. The only expected mutations are temporary CRM overrides with correlated append-only audit history.
4. Validate fresh-token denial and allowed operations at actual FRT domain RPC/financial transaction boundaries with safe **nonproduction** records, separately from the capability probe. A passing board/module check alone does not certify finance workflows.
5. If the script reports `MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED`, do not rerun blindly. Resolve the isolated override and audit state with an authorized administrator and preserve evidence.

**Status:** Source implementation and regression fixtures staged. Live role-transition acceptance **BLOCKED** until an isolated project, genuine existing identities, baseline entitlements, credentials, and independent audit verification are available. Production records are not to be modified to satisfy this checkpoint.

## CP-FRT-SEC10-CI-AUTH — disposable native GoTrue acceptance (2026-10-31)

**New evidence:** [GitHub Actions run #41180302048](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41180302048) completed successfully on `feature/cp-frt-sec10-ci-native-auth`; all steps passed, including native runtime start, signed user checks and ephemeral stack destruction.

- GitHub-hosted Ubuntu runner uses Supabase CLI **v2.121.0** and `SUPABASE_EXPERIMENTAL_STACK=1`, explicitly selecting `--runtime native`. The local stack runs on the CI worker and is destroyed after the job; no user machine installation, Docker requirement or hosted Supabase project.
- `scripts/cp-frt-sec10-ci-auth-smoke.mjs` rejects any non-CI invocation or non-loopback API URL **before network access**. It reads only ephemeral CLI status output, not production keys or cloud URLs.
- Temporary isolated Auth users are created through the local GoTrue administrative API. Real sign-in, verification via `/auth/v1/user`, logout, and distinct JWT session IDs are checked.
- CI result: `CP-FRT-SEC10-CI-AUTH: PASS`. **2** actual local Auth users; **4** verified GoTrue sessions; **3 distinct nonbootstrap sign-ins**; zero CRM role transitions, zero financial operations, zero production access.
- Separate mock-based unit tests verify the loopback guard, remote endpoint rejection, expected Auth HTTP protocol, and sanitized report fields. No identities or session tokens were committed or uploaded as artifacts.

**Next engineering gate:** Integrate the already-tested CP06/SEC10 *database authorization fixture* with the native CI Postgres/PostgREST/Auth runtime so the genuine signed sessions execute central CRM role and FRT access RPCs. Only then may the full Viewer → Supervisor → Restored runner be exercised against the disposable CI workspace. Independently verify the correlated role audit ledger, CAS semantics, restored memberships and FRT-domain constraints. Do **not** infer production acceptance or perform live production role changes from this isolated Auth smoke PASS.

**Status:** CI Auth runtime and fresh signed-session proof VERIFIED; CI signed RBAC transitions and independent FRT operational acceptance PENDING. Existing SEC10 overall operational acceptance remains separate and is not automatically increased to full completion.

## CP-FRT-SEC10-CI02 — real signed transitions and independent CI audit

**Date:** October 31, 2026. **Latest verified run:** [GitHub Actions #41181421406](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41181421406) — **SUCCESS** on commit `7da9ccfa80c32d1c7d39b6a05e317b9fb826c91f`. Earlier first-pass failure was a double-escaped loopback-port regex in the new CI adapter; fixed and covered by a regression test. Both the earlier corrected workflow and the final regression workflow passed.

**Execution design:** The CI02 workflow uses `supabase/setup-cli@v1` pinned to Supabase CLI 2.121.0 and runs the experimental native stack only on the GitHub-hosted Ubuntu runner. It reads local `API_URL`/`DB_URL` from the CLI status output and refuses any non-loopback endpoint, production domain, or execution outside GitHub Actions. Three CI-only GoTrue users are created by the local Auth API, and their *actual Auth-issued IDs* are mapped into the established CP06 disposable authorization fixture. The adapter deliberately removes the mock `auth.users` and `auth.uid()` declarations instead of overwriting the native GoTrue schema. It loads the existing CRM role-cap and FRT domain-ceiling SQL, minimal CI-only signed-context/bootstrap helpers, and the CP11 self-access inspector. It does not modify or clone the hosted production database.

**Acceptance evidence (actual signed HTTP/RPC requests):**

| Check | Result |
| --- | --- |
| Three distinct genuinely issued nonbootstrap Supabase Auth sessions | **PASS** |
| Admin identity and bootstrap-only role setter authorization | **PASS** |
| Viewer stored CRM override, board read-only, FRT denial | **PASS** |
| Stale CAS transition rejected without changing the assigned revision | **PASS** |
| Supervisor stored CRM override, board edit allowed/manage denied, FRT allowed | **PASS** |
| Revocation of the explicit override and inherited original permissions restored | **PASS** |
| Other-workspace board read and admin snapshot both denied | **PASS** |
| Independent PostgreSQL ledger after running the live signed requests | **3 requests + 3 correlated applied audits** |
| Expected application assignments, owner membership, bootstrap roster, user count and no CRM override at end | **UNCHANGED / RESTORED** |
| Production Supabase touched or modified | **NO** |

CI output includes no real user IDs, passwords, sessions or secrets. A dedicated regression test checks cloud-URL rejection and ensures the real native Auth schema is preserved when adapting fixture data. The workflow unconditionally destroys its native stack and transient connection files.

**Verification boundaries:** The fixture intentionally contains the authoritative CP06 CRM role/FRT capability functions and CP11 inspection contract, *not* the full production finance data model. The workflow does **not** prove live production changes, financial transactions, approval workflows, field-level FRT record authorization, token invalidation after logout, production-specific RLS policy parity, or final twelve-board application operations. Such requirements remain PENDING separately. CI02 cannot itself authorize weakening central RBAC or real production role edits.

**Disposition:** CP-FRT-SEC10-CI02 genuine isolated signed RBAC transition and linked audit acceptance **VERIFIED**. The defined CI02 milestone is complete; broader CP-FRT-SEC10 production-operational/final acceptance remains **PENDING**.
