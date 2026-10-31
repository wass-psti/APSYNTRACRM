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

## CP-FRT-SEC10-CI03 — genuine signed native FRT finance and RLS acceptance (2026-10-31)

**Verified branch run:** [GitHub Actions #41182640369](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41182640369), **COMPLETED / SUCCESS** on commit `14c4e80c92745533411e977554d651162588319e`. The native Supabase CI02 fixture and genuinely signed role-transition/audit sequence are prerequisites and are rerun inside the same isolated CI project.

**Authoritative source contract:** `sql/tests/cp-frt-sec10-ci03-native-finance.sql` contains only **metadata-derived DDL** and unchanged production definitions captured on October 31, 2026 for `frt_create_request`, `frt_request_action`, `frt_submit_liquidation`, `frt_update_request`, `private.frt_has_membership`, and `private.frt_has_role`. It recreates seven actual FRT finance table structures, foreign keys, checks, read policies, and no direct authenticated table grants. It imports **no production finance rows, credentials, user accounts, or financial records**. The existing signed role ceiling and workspace checks remain authoritative.

| Isolated signed finance-domain check | Result |
| --- | --- |
| Existing CI02 role transitions, new signed Auth sessions, and independent audit correlation | PASS prerequisite |
| Real request creation by FRT Finance Manager | PASS |
| Approval by General Manager | PASS |
| General Manager transfer verification | PASS |
| Finance Manager liquidation submission | PASS |
| General Manager liquidation approval | PASS |
| Finance Manager close after approved liquidation | PASS |
| Unauthorized requests across role, workspace, direct-table and finance separation boundaries | **11 correctly denied** |
| Denied finance operations preserve request, item, voucher, liquidation, and finance audit counts | PASS |
| Finance audit events retained after permitted operations | **6** |
| CRM Viewer ceiling applied and revoked without losing original FRT role | PASS |
| FRT finance tables with RLS enabled | **7 of 7** |
| Matching FRT membership-based SELECT policies | **7 of 7** |
| Direct client table INSERT/UPDATE/DELETE privileges | **0** |
| Original authorization restored; no explicit CRM override left | PASS |
| Production DB, production roles, and hosted project touched | **NO** |

**Failure recovery and verification integrity:** An initial CI SQL fixture setup failed because dependent foreign keys were created before the referenced primary keys. The fixture was corrected to create all primary/unique keys before foreign keys, without changing any production DDL. Earlier test syntax and diagnostic shortcomings were also corrected. Only run #41182640369 is cited as successful CI03 acceptance. GitHub Actions destroys the ephemeral native stack after completion.

**Scope limitation:** CI03 checks actual finance RPC implementations and matching metadata-derived table constraints inside **disposable native Supabase Auth/PostgREST/PostgreSQL**. It does not establish production financial transaction success, production credential/token revocation behavior, production data migration, or complete native application/12-board deployment acceptance. Existing live production FRT grants, assignments, and financial rows were not changed. Additional financial workflows and production-specific policies beyond the seven tested tables remain outside this milestone. Do not claim full CP-FRT-SEC10 final certification from this CI milestone alone.

**Disposition:** CI03 **VERIFIED** within its isolated signed finance-domain scope. [PR #24](https://github.com/wass-psti/APSYNTRACRM/pull/24) merged into `main` at `9b98c8727fd2e610e253024ca173a129d9f09fae`. All four workflows completed successfully on the exact merge commit: [CI03 signed finance](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41182748821), [CI02 signed role transitions](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41182748874), [frontend/disposable PostgreSQL/live-pages](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41182748939), and [GitHub Pages deployment](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41182748615). A post-merge **read-only** production check confirmed **0** CRM overrides, **2** existing central role-audit records, **76** board memberships, **121** module-role assignments and **0** FRT request/audit/liquidation records, consistent with the pre-milestone baseline. Broader operational certification remains PENDING.

## CP-FRT-SEC10-CI04 — session revocation, extended RLS and signed authorization regression (2026-10-31)

**Verified branch run:** [GitHub Actions #41194273939](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41194273939), **SUCCESS**. All three CI04 targeted unit tests passed, followed by the genuine native Supabase CI02/CI03 prerequisites and CI04 signed-domain tests. The integrated sanitized machine result is `CP-FRT-SEC10-CI04: PASS`, with separately reported session limitations.

**Scope:** Disposable GitHub-hosted native Supabase Auth, PostgREST and PostgreSQL only. No second hosted project, production account, permission change, finance record, service key, or local database installation. All created test users and test rows are ephemeral. The workflow always destroys the native stack.

**Production source alignment:** `sql/tests/cp-frt-sec10-ci04-remaining-rls.sql` reconstructs the three remaining `frt_attachments`, `frt_comments`, and `frt_memberships` table schemas, constraints, and canonical RLS SELECT policies from production read-only metadata. Combined with CI03's seven finance tables, CI04 verifies **10 of 10 RLS-enabled FRT tables and 10 of 10 SELECT policies**. To test actual policy filtering rather than the absence of SQL grants, the CI-only runner temporarily GRANTs SELECT to `authenticated`, verifies positive same-workspace results, outsider zero-row results for all ten tables, member-only membership visibility, GM roster visibility, and CRM Viewer masking on the **same still-issued JWT**, then **REVOKEs every temporary grant** and independently verifies original no-direct-client-grant posture. Production role grants are untouched.

**Session results and remaining gap:**

| Control | Evidence | Status |
| --- | --- | --- |
| Same issued JWT sees central Viewer role downgrade immediately | All ten FRT SELECT policies returned zero rows; FRT module and finance creation denied | VERIFIED |
| Same JWT sees permissions restored after CAS revocation | Ten FRT table reads recover; zero CRM role overrides remain | VERIFIED |
| New real local GoTrue session persisted in `auth.sessions` | Signed access JWT `session_id` had one matching database session | VERIFIED |
| Scoped local logout revokes refresh token | Refresh grant denied; `auth.sessions` record removed | VERIFIED |
| Invalid bearer JWT rejected | Signed RPC denied | VERIFIED |
| **Immediate invalidation of pre-logout access JWT** | **Old access JWT remained accepted by PostgREST after logout** | **NOT VERIFIED / EXISTING SECURITY GAP** |
| Genuine GoTrue-issued access token expired and rejected after `exp` | Not exercised; no fake or modified tokens substituted as evidence | PENDING |
| Cross-workspace table reads | 10 of 10 filtered to zero for outsider | VERIFIED |
| Source-derived membership SELECT ceiling | Member can see only own legacy membership row, GM can see both | VERIFIED |
| Diagnostic table grants and finance data integrity | All diagnostic grants removed; no direct table writes; original finance request/audit counts preserved | VERIFIED |

**Security interpretation:** Supabase's official Auth documentation states that logout invalidates refresh tokens and removes affected sessions, but previously minted JWT access tokens generally remain accepted until their `exp` time. The current production `private.frt_current_role` helper does not independently check the signed JWT's `session_id` against `auth.sessions`; do not claim immediate revocation for FRT RPCs under the existing deployed schema. A proposed follow-up security hardening would check an active signed session for **sensitive finance actions** (or adopt an equivalent short-lived token and explicit revocation policy), then verify both legitimate operation and immediate post-logout denial with safe rollout controls. This would alter production authorization behavior and must be separately validated before deployment.

**Disposition:** **CI04 isolated verification PASS** for actual RLS filtering, current-role authorization decisions, refresh-token revocation, and invalid-token refusal. **Overall CI04 strict immediate JWT revocation and genuine expiration acceptance remain PENDING.** Broader CP-FRT-SEC10 final production operational certification remains PENDING; no status is upgraded by interpreting an unexpired old JWT as revoked.

### CI04 merge and post-merge verification — 2026-10-31

[PR #26](https://github.com/wass-psti/APSYNTRACRM/pull/26) merged on `main` as commit `0811f4114dc2d9ca4862160760092e600b26c4bd`. Post-merge checks all completed **SUCCESS** on that exact commit: [CI04 native signed security run #41194453425](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41194453425), [frontend/disposable PostgreSQL/live Pages checks #41194453430](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41194453430), and [GitHub Pages deployment #41194453030](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41194453030). CI04's main-run output matches the branch evidence: **10/10** RLS tables/policies and cross-workspace denial, current-role restriction and restoration, logout refresh revocation, removed session record, invalid JWT rejection, and diagnostic privilege cleanup, with **old access JWT still accepted after logout** and **no actual expired Auth JWT test**. The post-merge production read-only snapshot remains **0** explicit CRM overrides, **2** central role-audit records, **76** board memberships, **121** module assignments and **0** FRT request/audit/liquidation rows. No production role or finance mutations performed. Final immediate-access-revocation and genuine JWT-expiry acceptance remain **PENDING**; do not assert completion beyond the verified CI04 scope.

## CP-FRT-SEC10-CI05 — session-aware FRT finance gate and genuine JWT expiration (2026-10-31)

**Verified branch execution:** [GitHub Actions run #41196184155](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41196184155) — completed **SUCCESS**, commit `a131b0827c141058a48f47afe817630952cbf501`. All **3/3** targeted Node security tests passed and the existing CI02/CI03/CI04 genuine native GoTrue, signed role-transition, FRT finance and 10-table RLS acceptance chains passed before CI05.

**Design and constraints:** `sql/tests/cp-frt-sec10-ci05-session-guard-candidate.sql` is an **isolated CI-only hardening candidate**, not a production migration. It preserves the authoritative `private.frt_current_role` workspace, host identity, module-assignment and CRM platform-role ceilings while adding a private, fail-closed `private.frt_signed_session_active()` precondition. The latter verifies the **server-provided signed JWT** `auth.uid()`, well-formed `auth.jwt().session_id`, unexpired `exp` claim and matching `auth.sessions.id` + `user_id` record. It runs as a narrowly scoped `SECURITY DEFINER` function with `search_path=''`, and direct `PUBLIC`/`anon`/`authenticated` execution is revoked. Only the existing role resolver may use it; no parallel login, role framework or user-editable JWT permission claim is introduced.

**Evidence:**

| CI05 security/operational gate | Genuine signed result |
| --- | --- |
| Before installing the candidate, PostgREST admits the still-unexpired JWT whose local GoTrue session has been logged out | VERIFIED baseline — confirms the CI04 risk |
| After installing the candidate, the same revoked JWT cannot execute `frt_create_request`, `frt_update_request`, `frt_request_action` or `frt_submit_liquidation` | **4 of 4 DENIED** |
| Rejected calls do not change FRT request, voucher, liquidation or finance audit counts | VERIFIED |
| New actual GoTrue session for the existing isolated Finance Manager account can create a permitted finance request | VERIFIED; corresponding finance audit retained |
| Signed user from another workspace cannot access the protected FRT finance scope | VERIFIED |
| Real Auth session `session_id` correlated with `auth.sessions`, with production role authority unchanged | VERIFIED |
| Truly expired, **unaltered Auth-issued** JWT is refused by PostgREST, even while its Auth session row remains present | VERIFIED |
| Expiry test accounts for bounded PostgREST clock allowance using read-only RPC polling, never repeated finance mutations | VERIFIED |
| Production hosted Supabase/project, users, roles, finance transactions or hosted JWT expiry affected | **NO** |

**Expiration-test detail:** For this disposable native CI runtime **only**, the generated `supabase/config.toml` sets `auth.jwt_expiry=90` seconds so a genuine GoTrue-issued JWT can expire naturally during CI. This is explicitly **not** an operational setting recommended for the live hosted system (Supabase recommends ordinary Auth JWT lifetimes of at least 5 minutes). The expiry probe performs a read-only RPC until PostgREST actually rejects the token, allowing only a bounded clock-skew interval. It does **not** forge JWTs, change signing keys, modify `exp`, alter system clocks, or claim a logout alone invalidates JWT cryptographic signatures.

**Acceptance decision:** CP-FRT-SEC10-CI05 **VERIFIED within isolated signed-session and finance-boundary acceptance**. The earlier CI04 refresh-token-only revocation gap is demonstrably closed for role-resolver-delegating FRT finance operations **under the CI-only candidate**. It is **not closed in the production database**, which still runs the prior role resolver. Production security change review, migration and rollback planning, deployment, existing-user regression, and real production operational acceptance are **PENDING**. Applying this candidate directly to production would change authorization behavior and requires separate rollout controls. No production modification was performed.

### CI05 source merge and regression follow-up

[PR #27](https://github.com/wass-psti/APSYNTRACRM/pull/27) was merged into `main` at commit `3730d6cee46daa028f6c696b009db18f3b20d65e`. Its first merged frontend-validation workflow exposed a stale **test-source string assertion**: the JWT expiry implementation used bounded multi-probe polling, while one test still looked for the earlier single-delay syntax. The application-facing code and candidate SQL were unchanged by that correction; the isolated signed runtime had already passed on the source branch. The stale test expectation was corrected on `main` in commit `fe53a5f278cab11a955c64c13b59f83e1a85d302`. **Post-merge integration verified:** [CI05 signed session and genuine expiry run #41196595390](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41196595390) completed **SUCCESS** (3/3 focused tests and real CI02–CI05 chain) at fixed source commit `fe53a5f278cab11a955c64c13b59f83e1a85d302`. [Frontend and disposable PostgreSQL validation #41196629966](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41196629966) and [GitHub Pages deployment #41196629292](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41196629292) both completed **SUCCESS** on baseline commit `4de348bbcf3a88ed8ef6d2a026a4558f68d75b53`. The production database's independent read-only post-merge snapshot remains **0** CRM role overrides, **2** role-audit rows, **76** board memberships, **121** module assignments, **0** FRT requests, **0** FRT finance audit rows and **0** FRT liquidations. The production `private.frt_current_role` still does **not** contain the new session check; only the isolated candidate was tested. Source, CI and Pages integration are **VERIFIED**, while actual production security deployment and final operational certification are **PENDING**.


## CP-FRT-SEC10-CI06 — read-only production rollout preflight (2026-10-31)

**Production-readonly preflight: VERIFIED.** The preflight was executed through the connected authoritative Supabase project, using the exact SQL committed in `sql/tests/cp-frt-sec10-ci06-production-readonly-preflight.sql`. Result: `READY_FOR_AUTHORIZED_ROLLOUT_REVIEW`. The query was strictly read-only; it did not create users, change permissions, apply the candidate, alter JWT settings, or touch financial records.

**Preflight SQL source commit:** `ddd32b6c8c1ec2314ea81d57ed3732cdaad5a890` on `main`.

| Read-only production gate | Observed evidence |
| --- | --- |
| FRT base tables with RLS enabled | 10/10 |
| FRT SELECT policies | 9 (voucher counter intentionally has no direct SELECT policy) |
| Direct anonymous/authenticated table data grants | 0 across the 10 FRT tables |
| Existing role resolver hash | `2b518f7be033ea25a6c103184c283a7d` — matches audited CP06 source |
| `private.frt_signed_session_active()` deployed | NO — outstanding session revocation gap remains in hosted backend |
| Legacy `frt_admin_set_role` callable by authenticated role | NO |
| Required `auth.sessions` lookup columns | Both present |
| CRM role override / audit / board / module / FRT request inventory | 0 / 2 / 76 / 121 / 0; no mutations |

**Classification:** CI05 isolation and merged CI acceptance = VERIFIED; CI06 production preflight = VERIFIED; hosted session-guard activation, authenticated legitimate-user postrollout regression, immediate revoked-session finance denial, independent finance transaction acceptance and full SEC10 production sign-off = **PENDING/BLOCKED**. CI05's tested SQL remains a disposable candidate only. The preflight is a change-control readiness check, not a production activation or authorization to perform one.

**Next dependency:** Before production DDL that changes the FRT financial authorization boundary, obtain separate approval for the specific live rollout and a safe recovery window. Retain the existing role resolver and grants as the rollback baseline; repeat the read-only preflight immediately before deployment to detect drift, then perform controlled signed legitimate-user and revoked-session testing without using or modifying real financial data for negative probes. Do not conflate GitHub Pages deployment with backend session-guard activation.


## CP-FRT-SEC10-CI07 — controlled production session-guard activation (2026-10-31)

**Authorizing instruction:** the operator explicitly requested controlled production FRT session-guard activation followed by signed-session and financial authorization verification. Existing Supabase project `jtlusodorfnyzgyuewkz` (project display name WatchdogWorkspace) remains the single APSYNTRA CRM backend.

**Deployed migration:** `cp_frt_sec10_ci07_production_session_guard_activation`, confirmed in the authoritative Supabase migration ledger. The SQL is committed at `sql/cp-frt-sec10-ci07-production-session-guard-activation.sql`. Production deployment was a single preflight-fenced migration: it first required the exact previous `private.frt_current_role(uuid)` function MD5 `2b518f7be033ea25a6c103184c283a7d`, existing ten-table FRT RLS posture, no direct anon/authenticated table grants, the revoked legacy FRT admin setter, and `auth.sessions` schema compatibility. Source installs the **verbatim isolated-CI05-tested candidate** `private.frt_signed_session_active()` and adds it as a fail-closed precondition in the existing FRT role resolver, without a parallel auth framework.

**Emergency resolver-only rollback:** `sql/cp-frt-sec10-ci07-production-session-guard-rollback.sql`, captured from the exact original live `pg_get_functiondef`; includes original MD5 proof, drift precondition, non-cascading removal of the session helper and schema reload. **Rollback has not been executed** because production deployment passed. Rolling back would restore the previously documented immediate-revocation gap.

**Read-only post-deployment verification:** `sql/tests/cp-frt-sec10-ci07-production-readonly-postcheck.sql` returned **`PRODUCTION_SCHEMA_ACTIVATION_VERIFIED`** after a correction solely to the test's PostgreSQL `proconfig` empty-search-path representation; the deployed SQL itself was not altered. Explicitly checked: 10/10 RLS-enabled FRT tables, 0 direct API table grants, `postgres`-owned private `SECURITY DEFINER` helper with empty `search_path`, signed-subject ownership matched to `auth.sessions`, explicit JWT expiration check, original CRM platform ceiling still used, session-guard delegation in FRT resolver, no direct anonymous or authenticated access to helper, and legacy `frt_admin_set_role` still non-callable. The production migration ledger includes exactly one CI07 activation entry.

**Additional live SQL regression (no authenticated client session):** Calls without a signed JWT context returned false/NULL for `private.frt_signed_session_active`, `private.frt_current_role`, `private.frt_has_membership`, and `private.frt_has_role`. The SQL session's `auth.uid()` was NULL; these results are **not** genuine remote unsigned PostgREST calls or signed-user acceptance.

**Production integrity inventory after deployment:** 10 Auth session records; 0 FRT requests, finance audit rows, liquidations or voucher counters; 0 explicit CRM role overrides, 2 existing CRM role audits, 76 board memberships, 121 module assignments. These match the captured pre-deployment counts; no production Auth settings, credentials, user records, role assignments, board memberships or financial data were modified.

**Signed acceptance limitations:** There is no authorized production bearer token/interactive signed session available to the agent for independent positive or immediate post-logout remote RPC acceptance. The live role-assignment inspection found zero active direct FRT module assignees, so a real nonbootstrap Finance Manager write test cannot be run without changing production permission assignments. Do not create or promote production users or create financial test rows solely to force a passing result. The existing isolated CI05 workflow previously verified post-logout denial by all four financial RPCs, fresh GoTrue signed finance access, cross-workspace signed denial, and natural expiry. These isolated results validate candidate behavior, **not** new production-signed execution.

| CI07 acceptance gate | Classification |
| --- | --- |
| Authoritative current-schema and role preflight | VERIFIED |
| Exact previous resolver rollback captured in repository | VERIFIED (not executed) |
| Production session-guard migration installed and ledger reconciled | VERIFIED |
| Independent deployed SQL/RLS/grant postcheck | VERIFIED |
| Live data integrity and unsigned SQL deny regressions | VERIFIED |
| Genuine production signed-user positive FRT RPC | PENDING |
| Same unexpired production access JWT denied immediately after session revocation | PENDING |
| Production authorized financial operation and nonbootstrap boundary | BLOCKED — no direct active FRT role assignee/sign-in available |

**Evidence-based progress for this defined eight-gate CI07 checkpoint:** **5/8 VERIFIED (62.5%)**, with runtime acceptance remaining outstanding. This is not a percentage of the whole APSYNTRA CRM project. Final CP-FRT-SEC10/CI07 signed-user acceptance and operational certification are **not complete**.

**Required next step:** Use an existing legitimate signed FRT-capable user (preferably a bootstrap administrator for permitted read-only `frt_bootstrap`) to run the existing GitHub Pages security acceptance, and independently validate the same unexpired bearer after a confirmed server-side logout against a read-only FRT RPC; report sanitized status only, never the token. Keep authorized finance write checks restricted to approved operational transactions or an isolated nonproduction environment. The production schema may be considered ACTIVATED/VERIFIED, but full signed runtime and finance acceptance remain PENDING.


## CP-FRT-SEC10-CI07 — nonbootstrap Supervisor / Viewer-board signed regression (2026-10-31)

**Sanitized operator-provided signed evidence:** The user ran the existing controlled-transition probe under one genuine nonbootstrap account. The `VIEWER` stage returned `BLOCKED / STAGE_NOT_CONFIRMED_BY_BACKEND` (0 checks); the `SUPERVISOR` stage returned 6/7 checks PASS, with the sole `board-edit-ceiling` check marked FAIL; and the `RESTORED` stage returned `BLOCKED / STAGE_NOT_CONFIRMED_BY_BACKEND` (0 checks). All three reports recorded zero writes or role mutations and `freshSessionIssued: NOT_VERIFIED`. They do not establish actual Viewer/Supervisor/Restored role transitions or production finance transactions.

**Independent production read-only entitlement reconciliation (identity omitted):** Exactly one active profile matched the reported account; it has an underlying host Employee role, an explicit workspace CRM Supervisor override, an enabled `FINANCE_APPROVER` FRT assignment, one active Viewer board membership, one active workspace membership and one active Supabase Auth session. Its CRM Supervisor role does not raise the Viewer board grant to Editor. The installed `public.work_board_access` resolver permits board edits only to existing Owner/Editor memberships, subject to the CRM ceiling. The observed edit denial is therefore **correct authorization**, not evidence of a production security defect. The earlier production snapshot with zero explicit CRM overrides was historical; do not overwrite it or infer who changed these later authorizations.

**Targeted source correction:** `frontend/frt-sec10-signed-ceiling.js` now checks for **pre-existing Owner membership** before evaluating controlled transition capabilities at any selected stage. Where the stage is confirmed but the board is Viewer/Editor rather than Owner, return `BLOCKED / PREEXISTING_BOARD_OWNER_REQUIRED` with no misleading edit FAIL. For Supervisor/Restored stages, current FRT module access remains an independent prerequisite; Viewer-stage module access is intentionally suppressed by the cap and cannot independently establish an earlier grant. The `frontend/board-security-ui.js` explanation now distinguishes board ownership from FRT module grants. New targeted regression tests cover these prerequisite boundaries without changing production authorization rules. Viewer and Restored stage mismatches remain BLOCKED when the backend does not confirm those stages. No artificial role changes were made to satisfy the test.

**Additional safe signed acceptance path:** `frontend/frt-sec10-ci07-signed-runtime.js` supplies a separate read-only `CI07 · Production signed FRT session check` on the existing Security page. It uses the current authenticated user and active workspace, checks current module access, calls the **actual `frt_bootstrap` signed RPC** (which delegates to deployed `private.frt_current_role` and the live session guard), confirms an authorized FRT role and stable identity, and exports only sanitized status/role/check names. It never exports email, user/board/workspace IDs, access tokens or financial record payloads. It never writes, revokes sessions or grants roles. An on-screen PASS establishes the signed positive FRT domain read boundary **only when the operator supplies the actual report**. This addition has not been independently operated through a user's production signed session in this development turn. Immediate post-logout denial, live token expiry, and financial mutations remain separate unaccepted gates.

**Implementation evidence:** committed directly to `main` with new targeted unit/UI tests and security-state invalidation on logout, Auth expiration and workspace change. Prior unrelated security regression assumptions about cleanup source order were preserved; no production database, account, permission, board membership or finance mutation was part of this remediation.

**CI07 checkpoint accounting:** production backend activation, grants and read-only postchecks remain VERIFIED (5 of 8 originally defined acceptance gates, **62.5%**). This user-supplied signed central-role diagnostic and new UI implementation do **not** raise CI07 to 6/8 until a successful genuine signed `frt_bootstrap` production report has been independently reconciled. The report is not the missing revoked-session test. Overall CP-FRT-SEC10 final acceptance remains PENDING.
