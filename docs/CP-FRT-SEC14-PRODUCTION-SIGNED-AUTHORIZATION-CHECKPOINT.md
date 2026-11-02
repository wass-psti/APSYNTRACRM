# CP-FRT-SEC14 — Production Activation and Signed Authorization Acceptance

**Checkpoint date:** 2026-11-02 (Asia/Manila)  
**Canonical repository:** `wass-psti/APSYNTRACRM`, direct `main`  
**Production:** existing Supabase project `jtlusodorfnyzgyuewkz`, GitHub Pages `https://wass-psti.github.io/APSYNTRACRM/#/security`

## Verified current state

The **additive** production activation was already completed before this checkpoint, with migration `cp_frt_sec14_additive_restricted_board_reads` (ledger version `20261102001945`). It installed:

- `frt_restricted_request_detail(uuid,uuid)`
- `frt_board_list_safe(uuid,text,text)`
- `frt_board_dashboard_safe(uuid,text)`

Production catalog and grants were re-read on this checkpoint directly from Supabase. All three functions are `SECURITY DEFINER`, owned by `postgres`, callable by `authenticated` but not `anon`, and reference the existing `private.frt_current_role` authorization resolver. The current role resolver delegates to the signed-session guard. The ten FRT tables retain RLS. Authenticated direct FRT table SELECT and write grants are both **zero**.

**Unresolved:** authenticated users can still execute legacy broad `frt_get_request`, `frt_list_requests`, and `frt_dashboard` functions. Those paths return more information than the restricted board requires. They are **NOT revoked**; complete production field-level secrecy is therefore **NOT accepted**. The existing `frt_request_action` retains its prior authenticated RPC grant and server-side role/lifecycle enforcement; the APSYNTRA finance UI has **no financial mutation controls**.

Production read-only snapshot: **0** FRT requests, **2** FRT finance audit records, **0** liquidations, **10** FRT RLS-enabled tables, **0** direct authenticated FRT table read/write grants, and **123** module-role assignments. These are point-in-time counts, not historical immutability assertions. This checkpoint made **no live production data, role, permission or privilege changes**.

## Reproducible production preflight

The authoritative read-only SQL report is:
`sql/tests/cp-frt-sec14-production-cutover-readonly-inventory.sql`

Executed against production through the existing Supabase SQL connection; result confirms the three safe RPCs, the preserved legacy grants, restricted-only anonymous denial, role/session dependency, RLS and financial row counts. This query **does not** establish external API consumer compatibility or furnish a signed-user session.

## Client compatibility inventory

| Consumer | Verified source | Legacy broad Supabase read RPC use | Status |
| --- | --- | --- | --- |
| APSYNTRA CRM finance board | `frontend/frt-finance-readonly.js`, `frontend/frt-finance-workflow.js` | None in its finance read paths: safe dashboard/list and restricted details only | **VERIFIED** by source/CI/Pages |
| APSYNTRA Security SEC14 read-only acceptance | `frontend/frt-sec14-signed-acceptance.js` | Uses the same restricted-only clients; no finance mutation RPC | **VERIFIED** by source/CI |
| Standalone `wass-psti/Fund-Released-Tracker` | `apps/web/src/lib/api.ts`, `apps/api/src/index.ts`, `apps/api/src/auth.ts` | Frontend uses a local `/api` fetch wrapper with standalone JWT; server uses its own Express/PostgreSQL routes, not these Supabase RPC names | **SOURCE INSPECTED, deployment NOT VERIFIED** |
| Historic or external clients / prior WatchdogWorkspace integrations | No comprehensive live consumer inventory available here | Unknown: cannot infer non-use from absence in one repository | **BLOCKED — compatibility evidence missing** |

The standalone FRT repository's separate JWT login and PostgreSQL/API stack also represent a **distinct integration/consolidation dependency** relative to the approved one-backend CRM model. Do not silently treat that separate backend as an accepted central Supabase client.

**Safety decision:** Do **not** run either `sql/cp-frt-sec14-restricted-details-action-access.sql` or `sql/cp-frt-sec14-legacy-summary-list-cutover.sql` directly in production. The first includes an EXECUTE revoke in the same transaction as a CREATE function and its preconditions do not match the already-installed additive state. The second can break any unexamined legacy consumer and is separately gated. Emergency rollback scripts would reopen sensitive field exposure and are not security-equivalent.

## Signed acceptance improvements

The `frontend/frt-sec14-signed-acceptance.js` runner now:
- Revalidates real signed identity/workspace using the existing auth and context clients.
- Probes the restricted dashboard and request list across authorized companies (bounded to 12 company reads) rather than incorrectly inferring an empty domain from the first company's results.
- Rejects a claimed nonempty dashboard paired with an empty request list, and fails closed on changed membership, scoped company access, malformed contracts or stale sessions.
- Reads a request's restricted detail and server-derived workflow preview **only when an existing, granted request appears**.
- Returns `PENDING / NO_EXISTING_FRT_REQUEST` if the checked authorized companies have no operational records; `NO_AUTHORIZED_FRT_COMPANY` if none are granted; `COMPANY_SCAN_INCOMPLETE` if the bounded scan cannot cover all authorized companies.
- Never creates QA finance data, mutates financial state, changes roles or claims the preview proves financial action execution.

The tests in `frontend/tests/frt-sec14-signed-acceptance.test.mjs` cover a request in a secondary company, partial company denial, no companies and summary/list inconsistency.

**Source testing is not equivalent to a genuine Auth-issued browser session.** No real signed-user output from the production Security page was obtained in this checkpoint; the Browser connector could not access an originating authenticated browser context. There are zero production FRT request rows, so request-detail acceptance is inherently pending until a legitimate operational record exists.

## Required release sequence and evidence

1. Complete an inventory of **all** active legacy clients and integrations, including source versions deployed outside this repo, and confirm that revocation has no incompatible consumer.
2. Obtain the separately required authorization for any **material production EXECUTE revocations** and define a controlled change window. Preserve exact prechange function-grant evidence and security-conscious rollback.
3. Apply only a specifically scoped, idempotent legacy grant-revocation migration after compatibility sign-off; do **not** rerun already-applied additive activation.
4. Verify the three legacy grants are denied, the three restricted grants remain authenticated-only, current FRT RLS/session/role ceilings remain intact, and finance rows/audit counts were not altered by the change.
5. Use a genuine FRT-authorized account at `https://wass-psti.github.io/APSYNTRACRM/#/security` → **Verify SEC14 signed reads — read-only** → **Copy nonsecret SEC14 report**. Preserve role/workspace-positive, nonbootstrap-negative, cross-workspace and expired/revoked-session results; do not export raw tokens. An empty domain remains PENDING for detail acceptance.
6. Verify **financial authorization actions in the isolated signed CI harness**; production finance writes and role changes require their own explicit operational authorization and legitimate business requests, never manufactured records.

## Acceptance ledger

| Gate | State |
| --- | --- |
| Live FRT resolver, RLS, direct table grants and RPC drift | **VERIFIED** |
| Additive restricted-read production migration and catalog | **VERIFIED** |
| New restricted grants; legacy/finance grants preserved | **VERIFIED** |
| Unsigned/no-session denial on installed safe RPCs (earlier controlled SQL check) | **VERIFIED** |
| Production restricted-only APSYNTRA finance UI / Pages | **VERIFIED** |
| Disposable SQL + signed-runner regression suite | **VERIFIED** |
| Genuine signed positive/negative operator session, real request details | **PENDING** |
| Complete compatibility and approved legacy read revocation, actual finance authorization acceptance | **BLOCKED** |

**Checkpoint: 6/8 VERIFIED (75%).** Do not count historical CI07 waivers as SEC14 runtime acceptance. Preserve the installed additive functions, current production records and role boundaries while the last two gates remain unresolved.


## Latest verification evidence — 2026-11-02

- `frontend/frt-sec14-signed-acceptance.js` additionally fails closed with `SUMMARY_LIST_INCONSISTENT` if a signed restricted dashboard reports positive request count while the corresponding authorized list returns no records. Targeted regression in `frontend/tests/frt-sec14-signed-acceptance.test.mjs`.
- [Frontend Validation #41381962043](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41381962043) at implementation commit `4193f5b5f42fb7ec8f50e4fab762945af3c7dc36` completed **SUCCESS**: **234/234 frontend tests PASS**, disposable PostgreSQL SUCCESS, exact-source live GitHub Pages smoke SUCCESS. [Pages deployment #41381961821](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41381961821) also completed SUCCESS at the same source commit.
- The new source-controlled production inventory `sql/tests/cp-frt-sec14-production-cutover-readonly-inventory.sql` was **actually executed** on the existing Supabase project and returned all three signed-only safe RPCs installed, legacy detail/list/dashboard still executable by authenticated, signed-session guard installed, 10 RLS FRT tables and 0 direct authenticated table reads or writes. No live data/permission change was made in this run.
- A single, read-only Supabase log aggregation over the tool's default **last-24-hour** window inspected 1,071 returned events across 11 sources and found **zero occurrences of the three legacy RPC names** in the exposed `log_attributes` representation. The `postgrest_logs` subset contained **14** events. **This is not evidence that there are no deployed legacy consumers:** logging may omit RPC identifiers, usage can be intermittent, and the window is limited. Consumer compatibility remains **BLOCKED**.
- No authentic Supabase user token/session, permission to impersonate a user, or genuine existing FRT request was available to complete the signed detail and authorization acceptance. The Security-page runner is deployed and prepared for a real operator session but no real operator result is claimed.

**Latest milestone status remains 6/8 VERIFIED = 75%.** The two pending/blocked gates are unchanged.


## Operator-submitted SEC14 read-only acceptance — 2026-11-02

**Evidence source:** user-submitted sanitized JSON output from the deployed `#/security` SEC14 signed-read checker. This is **operator-reported application execution**, not an independently captured database-signed test, and it contains no user ID, workspace ID, raw token or monetary data.

```json
{
  "checkpoint": "CP-FRT-SEC14",
  "status": "PENDING",
  "role": "GENERAL_MANAGER",
  "checks": [
    { "name": "signed-context", "status": "PASS" },
    { "name": "restricted-summary-list", "status": "PASS" },
    { "name": "restricted-detail", "status": "PENDING" },
    { "name": "stable-context", "status": "PASS" }
  ],
  "reason": "NO_EXISTING_FRT_REQUEST",
  "writesAttempted": 0,
  "financialWritesVerified": "NOT_VERIFIED"
}
```

**Interpretation:** three of four application-reported signed read checks passed for the reported effective `GENERAL_MANAGER` role: signed context, safe summary/list, and stable session/workspace. The detail check was not executed because the app found no existing eligible FRT request; this agrees with the most recent independently read production inventory showing zero `frt_requests`. No financial mutation was attempted. The report does **not** prove any completed detail response, financial action execution authority, nonbootstrap denial, revoked/expired JWT denial or isolation of unrelated workspaces.

**Gate accounting:** The signed-operator gate has **partial positive evidence**, but its complete acceptance criteria are **PENDING**. The production legacy RPC retirement/financial-authority gate remains **BLOCKED**. SEC14 remains **6/8 fully VERIFIED (75%)**, not 7/8 or 100%. Avoid creating synthetic production FRT requests to force the pending detail check. Next steps are independent valid-user denial coverage, eventual genuine operational request detail when one exists, and separately approved legacy contract retirement after all actual consumers are reconciled.


## Next priority — Independent nonbootstrap and cross-workspace signed denial — 2026-11-02

**Scope:** no test accounts, production finance records, grants, roles, or deploy targets may be modified merely to obtain acceptance. The existing `GENERAL_MANAGER` report remains partial signed positive evidence. It **does not** count as independent nonbootstrap/cross-workspace negative evidence.

### Implemented on `main`

1. `frontend/frt-sec14-signed-denials.js` performs a new read-only, same-session negative authorization probe, separate from the SEC14 positive read runner. The existing authoritative `apsyntra_role_is_bootstrap` must return **false** before continuing. A genuine nonbootstrap active module grant and the corresponding signed `frt_bootstrap` own-workspace membership must also be positively proved. The test calls both safe `frt_board_dashboard_safe` and `frt_board_list_safe` against a distinct operator-supplied foreign workspace and accepts only explicit PostgreSQL insufficient-privilege code `42501`. A successful response is a **FAIL**. A missing, identical, unsigned, stale or syntactically invalid workspace, or a signed/grant mismatch, cannot PASS.
2. The `#/security` UI renders **SEC14 · Independent nonbootstrap / foreign-workspace denial**, a non-secret other-workspace UUID input, run/copy controls, sanitized reason and an allowlisted check matrix. It never exports user IDs, workspace UUIDs, JWTs, secret fields or finance data. The result is invalidated on login, logout, session expiry and workspace transition.
3. `frontend/tests/frt-sec14-signed-denials.test.mjs` covers nonbootstrap two-RPC `42501` denials, bootstrap exclusion, absent module grants, missing/same workspace, accidental cross-scope read success, token failure, stale identity, HTML escaping and evidence filtering. No RPC capable of finance or role mutation is invoked.
4. `sql/tests/cp-frt-sec14-safe-board-disposable.sql` now proves the **same** nonbootstrap Finance Manager has access to one fixture workspace but is denied list/dashboard/detail access in a **second existing fixture workspace**, instead of relying only on a user with no FRT grant or a nonexistent workspace UUID.
5. `sql/cp-frt-sec14-legacy-read-grant-retirement-candidate.sql` is an **unapplied** guarded and transactional legacy migration. It checks all seven relevant FRT RPCs, signed resolver and session guard, signed-only restricted read privileges and finance authorization invariants; revokes authenticated/PUBLIC/anon EXECUTE on the *three* broad read RPCs atomically, and checks postconditions before COMMIT. `sql/tests/cp-frt-sec14-retirement-disposable-preflight.sql` supplies a **disposable-only** session predicate / preserved CRM role-ceiling resolver to execute this candidate in CI. The candidate is exercised **twice** after the previous isolated migration sequence to demonstrate grant-level idempotency. The dummy session predicate is not an Auth-issued session test and must never be installed in production.

### Evidence and acceptance boundaries

- [GitHub Actions run #41384370209](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41384370209) at `216641056633d318ce673994ff5123e0c892a059`: **240/240 frontend tests passed**, disposable PostgreSQL **SUCCESS**, exact-source live Pages **SUCCESS**. This includes the new two-real-fixture-workspace negative SQL assertions and twice-applied guarded revocation candidate.
- A read-only current production inventory returned **2 workspaces**, **2 active nonbootstrap FRT module assignments**, **0 FRT requests**, and all three broad read RPCs **still callable by authenticated**. These counts establish the presence of possible genuine signed actors and distinct workspaces, not the outcome of signed nonbootstrap testing.
- The deployed Security test requires an existing nonbootstrap FRT-granted user session and an **independently verified real other-workspace UUID**. The browser cannot establish that target's existence without an authoritative independent inventory, so its exported `foreignWorkspaceExistence` remains `NOT_VERIFIED` and overall status cannot be `PASS` on denials alone. This is intentional: a denial against an invented or nonexistent UUID must never count as conclusive cross-workspace acceptance.
- **No new genuine nonbootstrap signed-user report was obtained in this checkpoint.** No server-side revocation/session transition, finance mutation or independent real-request detail was exercised.
- The standalone `wass-psti/Fund-Released-Tracker` source uses its own Express `/api` and JWT mechanism; it does not reference these three Supabase RPC names in the inspected web/API source. Its deployed version and every possible external legacy consumer remain **unverified**. Limited logs with no observed calls are insufficient to certify compatibility.
- The production legacy EXECUTE grants are **UNCHANGED**. Running the staged grant-retirement migration remains **BLOCKED** until all active legacy clients are reconciled and the required explicit permission-change authorization is satisfied; do not run the old canonical detail CREATE/REVOKE SQL in a production database with the restricted function already installed.

### Next precise actions

1. Under an existing **nonbootstrap FRT grantee**, visit `https://wass-psti.github.io/APSYNTRACRM/#/security`, enter an existing separately verified foreign workspace ID in **SEC14 · Independent nonbootstrap / foreign-workspace denial**, and run the read-only test. Copy and submit the **nonsecret** report; never submit a user token, raw RPC result, email or workspace UUID.
2. Independently substantiate the target workspace exists and differs from the signed actor's active workspace, then complete paired nonbootstrap positive/negative cases and check expiry/revocation in a controlled signed setting.
3. Inventory **all deployed** consumers (not simply GitHub code or 24-hour logs), migrate any legacy callers, obtain specific production permission-change approval, execute the staged grant-only retirement in a controlled change window and record read-only postactivation grants/denial evidence.
4. Retain SEC14 request-detail and financial execution acceptance as PENDING until legitimate operational records and independently authorized action tests exist; do not create dummy production finance data.

**Overall SEC14 remains 6/8 VERIFIED = 75%**. The new browser probe and CI verify implementation and isolated authorization behavior; they are not evidence of actual nonbootstrap production signed denial or retired production legacy grants.


## Operator-submitted paired bootstrap reports — 2026-11-02

**Evidence type:** operator-submitted, sanitized browser acceptance results; not independently captured Supabase network proof. Both reports are read-only and include no user IDs, workspace IDs or tokens.

| Submitted result | Operator-reported outcome | Interpretation |
| --- | --- | --- |
| `CP-FRT-SEC14` | `PENDING`, FRT role `GENERAL_MANAGER`; `signed-context` PASS; `restricted-summary-list` PASS; `restricted-detail` PENDING; `stable-context` PASS; reason `NO_EXISTING_FRT_REQUEST` | Repeat of previously recorded partial positive signed-read result. No existing request means restricted detail was not exercised. |
| `CP-FRT-SEC14-DENIAL` | `BLOCKED`, scenario `BOOTSTRAP`; `signed-context` PASS only; role `UNVERIFIED`; reason `NONBOOTSTRAP_SESSION_REQUIRED` | **Expected eligibility block**, not proof of actual cross-workspace RPC denial. Negative test stopped before own-FRT membership and foreign-workspace calls. |

Both reports explicitly show `writesAttempted: 0`, and the denial report shows `roleChangesAttempted: 0`; neither verifies financial actions. The two statuses are compatible: `GENERAL_MANAGER` is an FRT domain role, whereas `BOOTSTRAP` is the independent administrator classification of the account. The denial probe is intentionally ineligible for a bootstrap session to avoid claiming independent nonbootstrap authorization evidence from the same privileged actor.

**Acceptance impact:** no additional SEC14 gate becomes fully verified. Overall remains **6/8 VERIFIED (75%)**. Real nonbootstrap / other-existing-workspace denial remains **PENDING**, request-detail acceptance remains **PENDING**, and legacy broad RPC retirement remains **BLOCKED** pending verified consumer compatibility and the required production grant-change authorization. Do not repeat either probe with this bootstrap session. Next genuine acceptance requires a previously authorized **nonbootstrap** FRT-granted user and an independently verified existing **other** workspace ID; run the isolated negative probe with that actor, then preserve only the nonsecret report. Do not create new accounts, finance records or grant permissions solely for testing.


## Automatic foreign-workspace selection implementation — 2026-11-02

**User requirement:** remove the manually entered "Other existing workspace UUID" field in SEC14 acceptance and select a genuine foreign workspace automatically. User is not required to locate a workspace UUID.

**Implemented source on main:**
- `sql/cp-frt-sec14-auto-foreign-denials.sql` stages the additive `public.frt_sec14_auto_foreign_denials(uuid)` RPC. The SECURITY DEFINER function requires the existing signed, nonbootstrap FRT role resolver and chooses a real `public.workspaces` row distinct from the signed user's workspace, excluding active memberships. It runs both existing safe-read RPCs under the signed caller context, accepts only SQLSTATE `42501` as a denial and returns only `status`, `reason`, `foreignWorkspaceExistence`, `dashboard`, and `list`, never the selected UUID. It does not alter legacy EXECUTE grants, financial records or roles.
- `frontend/frt-sec14-signed-denials.js` now calls that one fixed-shape RPC rather than constructing foreign workspace arguments from client input. It treats absent/malformed backend replies as BLOCKED and cannot certify a nonexistent workspace.
- `frontend/board-security-ui.js` no longer renders a foreign-workspace input; `frontend/app.js` uses the automatic client without any workspace ID parameter.
- `frontend/tests/frt-sec14-signed-denials.test.mjs` was updated to test the fixed-shape backend response, rejected bootstrap or ungranted sessions, fail-closed response semantics and removal of the manual field.

**Verification:** [GitHub Actions #41386565824](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41386565824) completed SUCCESS on commit `611061aa5042fae246145cd6a6cce27e00f3e117`: **240/240 frontend tests PASS**, existing disposable PostgreSQL suite SUCCESS and exact-source Pages smoke SUCCESS. [Pages deployment #41386565373](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41386565373) completed SUCCESS at the same implementation SHA. Intermediate CI failures on obsolete/manual-workspace test assertions were corrected before this green run.

**Critical unfinished dependency:** The new SQL file is **staged in GitHub, NOT applied to production Supabase**. The current disposable PostgreSQL job does **not** yet execute/test this newly staged SQL function. No real signed nonbootstrap caller has tested the automated backend contract. Until controlled activation, the new button fails closed with `AUTO_FOREIGN_WORKSPACE_RPC_NOT_ACTIVE` (backend's `PGRST202`) rather than reverting to an unverified random/manual workspace.

**Security and authorization:** Adding a privileged database RPC requires isolated SQL validation, a production review and deployment postchecks. This change is not authority to revoke the three existing broad legacy RPC grants or to write finance data. The current bootstrap `GENERAL_MANAGER` session remains ineligible to certify independent nonbootstrap denial. Overall scoped SEC14 acceptance remains **6/8 VERIFIED (75%)**. Mark auto-selection client/UI **VERIFIED**, new server RPC **IMPLEMENTED-UNVERIFIED**, production activation **PENDING** and genuine nonbootstrap negative acceptance **PENDING**.


## FINANCE_APPROVER nonbootstrap operator evidence — 2026-11-02

User submitted two **sanitized, operator-reported** read-only acceptance results:

| Report | Status | Verified by the reporter | Not established |
| --- | --- | --- | --- |
| `CP-FRT-SEC14`, FRT role `FINANCE_APPROVER` | `PENDING` | Signed context PASS; restricted summary/list PASS; stable context PASS | Request detail PENDING because `NO_EXISTING_FRT_REQUEST`; finance writes `NOT_VERIFIED` |
| `CP-FRT-SEC14-DENIAL`, scenario `NONBOOTSTRAP`, FRT role `FINANCE_APPROVER` | `PENDING` | Signed context PASS; nonbootstrap classification PASS; active FRT module grant PASS; signed own-workspace FRT scope PASS | `EXISTING_FOREIGN_WORKSPACE_ID_REQUIRED`; no foreign-RPC denial was attempted; foreign-workspace existence `NOT_VERIFIED` |

Both reports say `writesAttempted:0` and the second also `roleChangesAttempted:0`. These are submitted browser outputs, not independently captured Supabase requests.

**Version analysis:** The `EXISTING_FOREIGN_WORKSPACE_ID_REQUIRED` reason exists only in the earlier **manual foreign-workspace** frontend contract; the current committed `frontend/frt-sec14-signed-denials.js` does not emit it. The tested browser session therefore supplied an earlier report, not evidence of the new automated API. The SEC14 automatic SQL RPC was independently inspected and confirmed **absent from production** at the time of this checkpoint. A new automated report should not be requested until backend activation passes its isolated tests and controlled deployment.

**Acceptance status:** The nonbootstrap actor's *prerequisites* have now been demonstrated by user-submitted evidence, but full positive detail, genuine cross-workspace negative denial, and legacy RPC retirement are still open. Overall SEC14 remains **6/8 verified (75%)**, preserving prior gate definitions. Do not invent a foreign UUID, create test finance data, or infer backend privilege revocation from these reports.


## Automatic foreign-workspace RPC isolated authorization — 2026-11-02

**New live baseline observation:** Supabase read-only metadata check confirmed `public.frt_sec14_auto_foreign_denials(uuid)` **is not installed**, with **2** existing production workspaces and **0** FRT request rows. The user's nonbootstrap `FINANCE_APPROVER` browser evidence (reported above) has passed four prerequisites but was generated by the older manual-input runner. Neither that report nor the earlier `GENERAL_MANAGER` report establishes a genuine cross-workspace denial.

**Isolated implementation verification:** The SQL source `sql/cp-frt-sec14-auto-foreign-denials.sql` was added to the existing GitHub Actions disposable PostgreSQL run, after an explicitly **CI-only** bootstrap classifier fixture `sql/tests/cp-frt-sec14-auto-foreign-ci-bootstrap.sql`. `sql/tests/cp-frt-sec14-auto-foreign-disposable.sql` exercises a nonbootstrap FRT Finance Manager with an existing membership in workspace A and a verified actual workspace B, and proves a fixed-shape `PASS / FOREIGN_WORKSPACE_DENIAL_VERIFIED` from the backend. It also checks spoofed own-workspace UUID, bootstrap exclusion, ungranted user and unsigned caller. An in-transaction additional membership checks that no independent foreign workspace produces **PENDING**, never PASS. The entire test is disposable and rolled back; no genuine Supabase Auth session or production financial record is used.

**Corrective security hardening:** The probe verifies both restricted own-workspace reads and the caller role's authenticated EXECUTE grants *before* counting foreign `42501` responses, preventing permission breakage from masquerading as isolation. Separate `sql/tests/cp-frt-sec14-auto-foreign-grant-drift.sql` revokes the safe list grant temporarily in a disposable transaction and asserts `42501`; the transaction rolls back. Initial CI failed because the fixture invoked a private resolver without private schema USAGE. The test was corrected to use the public safe list RPC, not by broadening private grants.

**Latest successful CI:** [Frontend Validation #41387561065](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41387561065), source `cc4c733b63d96124ca7bd8a986570e7e887f4669`, completed **SUCCESS** with frontend **240/240 PASS**, disposable PostgreSQL **SUCCESS** (including new automatic-denial and grant-drift SQL), and live Pages source smoke **SUCCESS**. The newly staged SQL has **not** been applied to production by this CI run.

**Release classification:**
- Automatic frontend field removal, RPC invocation, evidence sanitization: **VERIFIED**, deployed via Pages.
- Automatic backend function source and isolated SQL acceptance: **VERIFIED in disposable PostgreSQL**.
- Genuine production automatic RPC activation and granted permission: **PENDING**, requires a separately controlled production authorization/security change.
- Genuine signed nonbootstrap automatic denial against a real second production workspace: **PENDING** until backend activation and real operator rerun.
- Legacy broad `frt_get_request`, `frt_list_requests`, `frt_dashboard` retirement: **BLOCKED** on independent consumer compatibility, separate from this additive RPC.
- Financial actions / nonempty request-detail: **PENDING**, no artificial finance writes permitted.

**SEC14 overall remains 6/8 verified = 75%**, unchanged by completed isolated implementation tests. Do not portray CI-only checks as live role/workspace or financial acceptance.
