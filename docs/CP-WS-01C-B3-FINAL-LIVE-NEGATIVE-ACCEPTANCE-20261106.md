# CP-WS-01C/B3 — Production HTTP, signed-session correlation and safe live denial evidence

## Phase G2 — Existing-user eligibility and signed HTTP denial readiness (November 6, 2026)

**Status: BLOCKED for independent signed-user HTTP denial; prior B2 signed discovery remains VERIFIED.** The review used read-only browser, repository, PostgreSQL catalog, and aggregated membership/session evidence.

- The connected browser still displays the original administrator in Work Management and the verified signed B2 discovery PASS with two authorized workspaces. This is not a second independently authenticated user's session.
- Existing production counts remain at 3 workspaces, 41 active memberships, 1 creation request, and 1 creation audit event; creation is enabled and switching disabled.
- Aggregate existing-user inventory: 39 users have membership in one workspace and 1 has membership in two. All 39 single-workspace users belong to Work Management. Of the two other workspaces, one has zero active members and the other shares a member with Work Management; **no user belongs exclusively to either alternate workspace**.
- Five verified active-profile single-workspace users have unexpired Auth session records. This establishes potential legitimate existing-account availability but does not prove their current browsers, access tokens, willingness, or authorization to participate. No credentials or identifiers were inspected or exported.
- The checked-in disposable PostgreSQL 17 security suite had previously passed; this turn did not execute a new browser HTTP request using a separate genuine user's token. No signed HTTP 403 denial was attributed to a specific existing user.
- Separate shared workspace-lookup authorization and dependency review is required prior to final certification. Detailed vulnerability analysis is intentionally excluded from this publicly readable ledger until safe remediation and review; do not alter the shared API or its grants without compatibility acceptance.

**Minimum safe continuation:** An eligible existing nonadministrator may use their own independently authenticated browser session and the existing read-only B2 test to verify membership-filtered discovery. This alone is not a direct forbidden-workspace RPC denial. Do not create accounts, enroll users in alternate workspaces, impersonate, force sign-out, revoke sessions, modify permissions, issue new creation requests, or claim a direct signed HTTP denial based solely on synthetic PostgreSQL fixtures.

**Phase G2 final gate:** PENDING/BLOCKED until (1) an independent legitimate signed-user read is available, (2) a valid existing read-only forbidden-workspace access path produces a verifiable negative result without changing access policy, and (3) the shared authorization boundary is reviewed. The historical original B3 creation response remains unavailable and original-request idempotent replay remains pending.

---


## Phase G — Independent safe authorization boundary verification (November 6, 2026)

**Disposition: PARTIAL PASS — final signed-user negative-security closure PENDING.** This review did not create or alter production records, memberships, roles, credentials, auth sessions, grants, RLS policies, feature flags or application code. No new user accounts were registered.

- **Browser and signed-session source:** The existing APSYNTRA CRM Security tab remained on Work Management and displayed the prior genuine signed B2 discovery PASS (five checks) and two member workspaces, including the post-refresh B2 result. This was read-only page inspection; no control was clicked by this review.
- **Independent live membership reconciliation:** The production database contains **3 workspaces**, **40 users with active membership**, **39 with exactly one** and **1 with exactly two** active workspaces. The unique two-workspace membership matches the signed browser's reported catalog count of two. Since `public.wm_ws01_list()` filters `workspace_members` by the signed `auth.uid()` and `active IS TRUE`, this supports **VERIFIED current signed-user discovery scope** and omission of the third workspace. It does **not** prove denial of a direct foreign-workspace operation or independent authorization for another user's genuine signed session.
- **Production contracts inspected:** `public.wm_ws01_create(text,text,uuid)` calls `private.ws01_signed_actor_session()`, requires the lifecycle creation flag and active profile, performs atomic owner/membership/privacy/request/audit inserts and returns a nonactivating receipt. The private session helper checks verified nonanonymous GoTrue identity, signed session existence/unexpired status and active workspace membership. `public.wm_ws01_list()` requires active signed session/profile and reads only active memberships. The private session helper has no authenticated/anonymous EXECUTE grant. The public creation/list RPCs are authenticated-only; the prior isolated PostgreSQL 17 test suite covers revoked/expired/borrowed sessions and negative creation contexts.
- **New safe production denials:** In separate **READ ONLY** PostgreSQL transactions using restricted database roles and no forged signed actor, `anon` calling `wm_ws01_list()` returned the expected `insufficient_privilege` denial; so did `authenticated` without a signed actor/session. Each test demanded an error and ended in `ROLLBACK`, with acceptance markers `WS01C_B3_PHASE_G_ANON_DISCOVERY_DENIED_READONLY_PASS` and `WS01C_B3_PHASE_G_UNSIGNED_DISCOVERY_DENIED_READONLY_PASS`. These are **database-layer negative tests**, not independent live signed-user HTTP denials.
- **Read-only Supabase gateway aggregates (recent 24h):** `/rest/v1/rpc/wm_ws01_list` recorded 9 HTTP POST 200 and 1 POST 403; `wm_ws01_create` recorded one POST 200 and its OPTIONS 200. Neither the 403 request identity nor its cause could be independently verified using safe log aggregates. **Do not** count that 403 as a genuine revoked, foreign or nonmember signed-user denial.
- **Post-probe invariant:** 3 workspaces, 41 active memberships, 1 creation request and 1 creation event. Creation enabled, workspace selection disabled. No new B4 switching RPC or production activation action was attempted.
- **CI/build:** Existing disposable PostgreSQL 17 acceptance run `42209636004` previously succeeded. Phase G introduced no code/SQL changes and did not rerun CI or deploy the frontend. No new build, independent signed browser HTTP negative test or end-to-end production regression was claimed.

**Outstanding acceptance requirements:** (a) genuine separate nonadministrator/foreign workspace signed-user direct denial, (b) real revoked/expired-session signed HTTP denial through an approved safe existing-session scenario, (c) exact original-actor idempotent replay (only if safely possible), and (d) historical original creation response body (UNAVAILABLE; do not reconstruct). The signed browser's current-account discovery and post-refresh continuity are verified separately.

**Minimum safe continuation:** When a legitimately controlled second existing user from a distinct workspace is available, run the existing *read-only* eligible signed authorization test(s) and preserve sanitized PASS/FAIL output. Do not create an account, remove membership, impersonate a user, mutate permissions, sign out an active production session to force revocation, or reissue workspace creation. If no such existing user/approved non-destructive revocation test is available, retain **PENDING/BLOCKED**; do not mark final production closure VERIFIED.

---


> **Post-refresh signed acceptance — November 6, 2026:** Following the requested page refresh and repeat B2 probe, the user supplied a new sanitized PASS report. The open CRM Security page was independently inspected and displayed Work Management as the current workspace, B2 signed discovery result PASS, 2 authorized workspaces, and five PASS checks (signed identity, workspace context, server discovery, membership catalog, stable session). The report recorded 0 writes and 0 identifiers disclosed. **Current-session signed discovery VERIFIED; post-refresh continuity SUPPORTED by user-confirmed sequence and independently observed resulting state.** The browser reader did not directly observe the reload event, so this is not an independent instrumentation trace. Historical workspace creation receipt UNAVAILABLE; live foreign-user/revoked HTTP denial and rightful-actor idempotent replay PENDING. No workspace, account, role, permission or data change was made for this evidence.


> **Signed-browser update (November 6, 2026):** The currently opened APSYNTRA CRM Security page independently displayed B2 signed discovery result **PASS**, with **2 authorized workspaces** and five PASS checks: signed-identity, workspace-context, server-discovery, membership-catalog and stable-session. The sanitized result reported zero writes and zero identifiers disclosed. The earlier pending B2 browser check is now VERIFIED for the current session only. The original B3 creation response remains unavailable; live cross-user and revoked-session HTTP denials and original-request idempotent replay remain pending. No production records, permissions or configuration were changed.


> **Phase F update — 2026-11-06 (later than the prior browser-unavailable record).** The originating APSYNTRA CRM browser tab became **readable in Chat mode** at `#/security`. The page displayed an existing `admin_general_manager` session, active workspace **Work Management**, and a **Run B2 signed read checks** control. These are browser **rendered UI facts only**: the read-only browser connector does not execute button actions or expose the actual GoTrue access token, B2 acceptance result or historical creation HTTP response. The B2 test had not been run in the inspected page state. The administrator is ineligible for the page's general nonadministrator board-denial test; this must not be claimed PASS. The original workspace-creation response remains **UNAVAILABLE** (not reconstructed). Live foreign-user and revoked-session HTTP tests and genuine idempotent replay remain **PENDING**. The prior section stating the browser was inaccessible describes its historical checkpoint and is superseded only for **page inspection**, not for the remaining acceptance tests.

### Phase F evidence delta

- **Repository read:** `main` was `0d390f9a383a4290c32d8e02a04b3043ca4d9053` when reconciliation began; TradeLink commits do not change this signed-creation acceptance classification. The checked-in `frontend/workspace-b2-signed-acceptance.js` demonstrates that its user-triggered B2 probe calls `auth.getVerifiedUser()`, authoritative `api.context()`, read-only `wm_ws01_list`, then rechecks identity and context; its exported report suppresses IDs, names and tokens. This **source inspection does not establish that the browser probe executed**.
- **Live catalog and contract:** 3 workspaces, 41 active memberships, 1 creation request, 1 creation event; creation enabled, switching disabled, selection RPC absent. `authenticated` has the controlled creation RPC, `anon` does not; neither client role can invoke the private signed-session helper directly.
- **Live committed test scripts re-executed read-only:** `WS01C_B3_CREATION_ACTIVE_AUTHENTICATED_RPC_ONLY__NO_B4` with eight predicates true; `WS01C_B3_GENUINE_CREATE_PERSISTENCE_AND_AUDIT_INTEGRITY_PASS` with one fully integrated request and zero violations. A separate database read confirmed one authentic-session, verified-user, owner-membership and privacy-policy correlation, zero integrity violations.
- **Direct production negative checks:** `WS01C_B3_LIVE_ANON_CREATE_DENIED_READ_ONLY_PASS` and `WS01C_B3_LIVE_NO_SIGNED_SESSION_DENIED_READ_ONLY_PASS`. Both invoked the real existing creation RPC with a denied context under an explicitly `READ ONLY` transaction, required `insufficient_privilege`, and ended in `ROLLBACK`. They certify only **database-layer anonymous and missing-session denial**, not an HTTP request from a second real user.
- **Nonproduction CI:** Existing isolated PostgreSQL 17 workflow run `42209636004` was independently confirmed successful; no new release/deployment build was executed in Phase F. A security advisor still flags the intended, restricted `authenticated SECURITY DEFINER` creation RPC for review, not proof of a newly discovered regression.
- **Safe next browser evidence:** The existing signed account may run **Run B2 signed read checks** on the Security tab and submit only its sanitized PASS/FAIL/BLOCKED status and check names. This read-only B2 discovery test is not a creation-receipt, revoked-session or cross-user test. Do **not** create a workspace or QA fixture, sign out to manufacture a revocation case, change users/permissions, or replay creation just for acceptance.

**Phase F classification:** **PARTIALLY VERIFIED; FINAL CP-WS-01C/B3 CLOSURE PENDING.** Historical original response body remains unavailable; signed-browser B2 execution, genuine cross-workspace and revoked-session HTTP denial and exact idempotent replay have not been observed. No application source, SQL contract, role, grant, flag, production record or session was changed by this addendum.



**Evidence date:** November 6, 2026 (Asia/Manila)  
**Production:** Existing Supabase project `jtlusodorfnyzgyuewkz` only  
**Classification:** **HTTP creation and persistence VERIFIED; live anonymous and unsigned-database-role denial VERIFIED; originating browser receipt, live cross-user/revoked/replay acceptance PENDING.**  
**Protection:** No workspace, test account, membership, role, grant, feature-flag or production business-record changes were performed during this acceptance attempt.

## 1. Baseline and boundary

The current main branch inspected for this note was `921c67ea3dd5e58864a22fefc93ac89039a7105d`. Independent read-only PostgreSQL checks recorded:

| Control | Verified value |
| --- | --- |
| Total workspaces | 3 |
| Active memberships | 41 |
| Signed creation requests | 1 |
| `workspace.created` audit events | 1 |
| Authenticated EXECUTE on `public.wm_ws01_create(text,text,uuid)` | Granted |
| Anonymous EXECUTE | Denied |
| `creation_enabled` | true |
| `selection_enabled` | false |
| `public.wm_ws01_select(uuid,uuid)` | Absent |

The separate, prior signed creation integrity audit returned `WS01C_B3_GENUINE_CREATE_PERSISTENCE_AND_AUDIT_INTEGRITY_PASS`. Production is already activated; repeating activation or creating an additional workspace is unnecessary.

## 2. HTTP gateway evidence — VERIFIED (not a returned browser receipt)

Read-only Supabase `edge_logs` aggregates over November 5–6, 2026 recorded exactly one `OPTIONS 200` and one `POST 200` at `/rest/v1/rpc/wm_ws01_create`. Their UTC timestamps span `2026-11-06 10:53:34.065` through `10:53:34.410`. The POST matched a browser-style user-agent pattern; no Origin header was exposed in the queried gateway attributes and no GitHub Pages referrer match was recorded. These metadata points are **not proof of a particular browser**.

An independent production read-only query showed exactly one signed creation request and one matching lifecycle event, both created within the same UTC minute as that successful HTTP POST. The request matched its workspace, active owner membership, owner relation, privacy policy and audit event with **zero** integrity violations.

A separate aggregate correlated the event with exactly one existing, unexpired `auth.sessions` row belonging to the same actor, a verified nonanonymous `auth.users` row, and an active workspace membership. Zero event session identifiers were missing. This supports actual server-side session provenance; it does **not** expose the RPC response JSON or demonstrate the message displayed in the originating browser.

No token, session ID, user ID, workspace ID, request UUID, email, IP address or raw request header was copied into this report.

## 3. Controlled live negative database probes — VERIFIED

Two database-role denial probes ran against the live project **inside explicit `READ ONLY` transactions**. Each probe enforced `current_user` and `transaction_read_only='on'`, called the existing creation RPC with a test-only request UUID, required the expected PostgreSQL `insufficient_privilege` error, and rolled back the transaction. A failure to deny the call would have failed the probe.

- `anon` database role: `WS01C_B3_LIVE_ANON_DB_ROLE_DENIED_READ_ONLY_PASS`
- `authenticated` database role with **no valid signed actor/session context**: `WS01C_B3_LIVE_AUTH_ROLE_WITHOUT_SIGNED_SESSION_DENIED_IN_READ_ONLY_TX_PASS`

These are **real production database authorization checks**, but **not** signed-user browser HTTP requests. No live session token was impersonated or extracted. The production workspace, membership, request, event and flags counts remained unchanged.

## 4. Nonproduction negative-suite evidence — VERIFIED

PR #43 was merged into `main` as `4193a85c342c347f3be52a1ade830d439d35728e`. GitHub Actions disposable PostgreSQL 17 run `42209636004` completed successfully. Its captured markers included:

- `CP_WS01C_B3_FINAL_SIGNED_NEGATIVE_DISPOSABLE_PASS`
- `CP-WS-01C/B3 isolated creation, denial, audit and rollback PASS`
- `CP_WS01C_B3_CONTROLLED_DISPOSABLE_ACTIVATION_AND_ROLLBACK_PASS`

The disposable suite covered anonymous, missing, malformed, cross-identity, expired and revoked sessions; nonmember, inactive profile, revoked memberships; replay under a disabled flag; and unchanged request/audit/workspace counts. **Synthetic PG17 cases do not certify live browser denial cases**.

## 5. Unresolved genuine-browser acceptance gate

The connected browser integration returned `Browser access requires the originating browser context`, so this session could not read the existing logged-in CRM tab or view the original UI receipt. The following remain **PENDING/BLOCKED** until authorized access exists:

1. Observe the original authenticated browser's `wm_ws01_create` response JSON and UI success state without exposing a token or credentials.
2. Verify refresh persistence and that creation did not silently switch the selected workspace through that ordinary signed UI.
3. Verify live revoked, expired, unauthorized/foreign user behavior using legitimately controlled existing sessions and approved non-destructive test conditions; do not revoke a real production session, mutate memberships, or create test users merely for evidence.
4. Verify idempotent retransmission with the original actor, request ID, name and privacy if a safe authorized genuine-session replay mechanism exists; **never** start a new creation request just to test replay.

**Minimum safe continuation:** Resume from ChatGPT in the original connected browser where APSYNTRA CRM remains signed in. Review the existing creation confirmation/response and authorize only non-destructive acceptance actions. Do not paste JWTs, session IDs, request UUIDs or authentication headers into chat. If the original response is no longer available, mark receipt observation as **UNAVAILABLE**, not fabricated.

## 6. Final decision

**Verified now:** Existing database integrity, successful production HTTP POST, real session-row correlation, live anonymous and missing-session database denials, and disposable PG17 security regression.  
**Not yet verified:** Original signed-browser receipt, live separate-user/revoked negative HTTP outcomes, and genuine idempotent replay.  
**Final B3 production certification:** **PENDING**. Do not enable B4 switching or broaden grants on the basis of this evidence.

Supabase security advisor still flags the intentionally granted authenticated `SECURITY DEFINER` creation RPC; preserve its review boundary: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
