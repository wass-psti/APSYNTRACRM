# CP-WS-01C/B3 — Production HTTP, signed-session correlation and safe live denial evidence

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
