# CP-WS-02D/B3 — Genuine deployed signed-user HTTPS read acceptance

**Evidence date:** 2026-11-06 (Asia/Manila).  
**Source of positive signed evidence:** An existing signed APSYNTRA CRM operator submitted the **sanitized output** of the production-deployed Security → **B3 · Deployed signed HTTPS acceptance** control. The raw JWT, identities, workspace IDs and server response were **not** submitted or stored.  
**Disposition:** **SIGNED HTTPS READ SUBGATE — PASS (operator-submitted real-session report); INDEPENDENT CROSS-WORKSPACE RLS / REVOKED SESSION DENIAL — PENDING.**

## Submitted production signed-user report

This report is recorded verbatim from the operator-supplied sanitized acceptance output; this assistant **did not** replay the signed browser session, inspect the user's bearer token, impersonate an actor or perform domain writes.

```json
{
  "checkpoint": "CP-WS-02D-B3-DEPLOYED-SIGNED-HTTPS",
  "status": "PASS",
  "stage": "signed-https-complete",
  "genuineDeployedReadVerified": true,
  "moduleProbeCount": 12,
  "authorizedModuleCount": 12,
  "independentTableRlsVerified": false,
  "crossWorkspaceDenialVerified": false,
  "revokedSessionDenialVerified": false,
  "writesAttempted": 0,
  "identifiersDisclosed": 0,
  "acceptanceBoundary": "SIGNED_READ_ONLY_NO_RLS_ISOLATION_OR_REVOCATION_ATTESTATION"
}
```

## Why this is stronger than earlier preflights

The existing frontend signed acceptance client (`frontend/workspace-b3-deployed-https-acceptance.js`, shipped in main commit `a2b5532ccbacee508814e064e1d5b7bfa55b5791`) accepts a `PASS` only after:

1. Caller identity verification with the existing browser `AuthClient.getVerifiedUser()`, with user identity consistent before the request;
2. A genuine HTTPS `GET` to the **pinned** existing-project Edge function, using that user's in-memory bearer token and the public publishable key only;
3. A successful HTTP 200 response with JSON and `no-store` headers, the specific server checkpoint and exactly the four server checks `signed-identity`, `authoritative-workspace`, `module-access-read` and `stable-signed-context`;
4. Exactly twelve module-access predicates and valid numeric Boolean counters, with no writes, deliveries or identifiers in the server response;
5. A **second** verified browser Auth user read with the same actor, before exporting a strict whitelist-only sanitized report.

The Edge host independently revalidates a real GoTrue user, authorized session context, and caller-scoped module access using the production read path; its code is separately pinned in the existing draft source/security PR. A client-side report **does not** directly attest arbitrary table RLS policies, a second user, revoked/expired session denial, 45 downstream consumers or a privacy migration.

## Additional independently checked evidence

- Existing project `jtlusodorfnyzgyuewkz`: `apsyntra-ws02d-b3-read` remains **ACTIVE**, function version **5**, with platform `verify_jwt=true`. This was checked via the Supabase control plane **after** the operator submitted the report.
- The [credential-free public HTTPS activation run 42167086872, attempt 2](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42167086872) **PASSED**: approved-origin OPTIONS 200 with exact CORS; foreign-origin OPTIONS 403 without CORS; anonymous/malformed bearer GET 401.
- Main-branch [frontend/integration validation run 42170222229](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42170222229) **SUCCESS**, **1068/1068** frontend tests and disposable PostgreSQL fixture jobs, plus live Pages smoke. The [Pages deploy run 42170221067](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42170221067) **SUCCESS**.
- Reexecuted **read-only** production SQL metadata file `sql/tests/cp-ws02d-b3-live-auth-rls-readonly-inventory.sql`, returning `WS02D_B3_LIVE_AUTH_RLS_GRANTS_BOUNDARY_VERIFIED`: **17 watched public domain tables, 17 RLS-enabled, 0 missing, 0 anonymous/direct authenticated table-write grants, 0 writable tables without RLS, 12 default-deny tables**. SQL result is metadata only, not signed runtime row-level denial.

## Open authorization acceptance

| Acceptance item | Classification |
| --- | --- |
| Public CA HTTPS, exact-origin preflight, JWT gateway anonymous/malformed denial | **VERIFIED** (live external network) |
| Existing signed user, production deployed read-only HTTPS route, 4 validated server checks and 12/12 module reads | **PASS — user-submitted genuine-browser acceptance report** |
| Live RLS enabled/grant metadata for watched tables | **VERIFIED — catalog only** |
| Negative read against another workspace using a legitimately distinct signed user | **PENDING** |
| Independent user-scoped **table-level** RLS foreign-row denial (not `SECURITY DEFINER` inference) | **PENDING** |
| Real revoked/expired `auth.sessions` behavior after session invalidation | **PENDING** |
| Cross-actor entitlement privacy `has_module_access(text,uuid)` and 45-consumer privacy cutover | **PENDING** separate review |
| Production domain writes, provider delivery, B4 workspace switching | **NOT APPLICABLE** to signed-read subgate |

**No JWTs, passwords, account identifiers, external provider actions, production rows, RLS/role/membership/grant changes, new accounts or new projects were created for this report.** Do not attempt to revoke or modify a real production session, data or membership solely to manufacture missing acceptance evidence. The source/privacy PR #34 remains **draft and unmerged**.

**Next required gate:** `CP-WS-02D/B3 — Genuine Foreign-Workspace Denial, Independent Table-RLS and Revoked-Session Acceptance`. Existing disposable CI fixtures can support controlled negative tests, but no synthetic result can stand in for a production signed-user denial.
