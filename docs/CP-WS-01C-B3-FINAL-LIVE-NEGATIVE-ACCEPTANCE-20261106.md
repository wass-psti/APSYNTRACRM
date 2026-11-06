# CP-WS-01C/B3 — Production HTTP, signed-session correlation and safe live denial evidence

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
