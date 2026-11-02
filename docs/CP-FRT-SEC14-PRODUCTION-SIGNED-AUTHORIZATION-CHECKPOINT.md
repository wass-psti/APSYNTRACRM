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
