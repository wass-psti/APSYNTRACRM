# CP-WS-02D/B3 — Controlled trusted HTTPS staging and live RPC privacy compatibility

**Checkpoint date:** 2026-11-06  
**Decision:** `IN PROGRESS — LIVE RPC CATALOG VERIFIED; DISPOSABLE PRIVACY TEST PASS; PUBLIC TRUSTED HTTPS STAGING NOT DEPLOYED`  
**Boundary:** Repository `wass-psti/APSYNTRACRM`, existing Supabase project `jtlusodorfnyzgyuewkz`. No second Supabase project or production change is authorized by this report.

## 1. Current signed and automated evidence

- Operator-supplied deployed Security-page `CP-WS-02D-B3-SIGNED-READ-PREFLIGHT`: four PASS checks; all 12 module access predicates returned Boolean `true`; 0 domain writes, 0 provider deliveries, 0 identifiers disclosed. This is an **operator-supplied client-side read-preflight result**; not a signed backend attestation, foreign-principal denial or publicly hosted staging test.
- [Real disposable GoTrue + TLS + PostgREST + RLS workflow 42141011359](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42141011359): completed success. Local certificate trust was configured explicitly on the disposable runner; it is **not evidence of a publicly trusted staging certificate**.
- [Cross-principal RPC privacy PG17 workflow 42147708170](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42147708170): completed success on PR #34 at `9b0bf1a91cce89bd776c29fd6c81ff35589102d6`. Existing exposed behavior is reproduced on synthetic data; same-actor results and reciprocal foreign denial pass for a **disposable-only** candidate. This does not exercise the production function under actual browser bearer tokens.

## 2. Reproducible production-safe function catalog check

New read-only file: `sql/tests/cp-ws02d-b3-live-rpc-privacy-catalog-preflight.sql`. It reads only `pg_proc` and `pg_namespace` metadata and effective function grants, without selecting user rows, touching `auth.sessions`, issuing requests, or changing privileges.

**Executed using the connected project's read-only SQL interface on 2026-11-06.** Result:

| Catalog contract | Observed |
| --- | --- |
| Function | `public.has_module_access(p_module_id text, p_user_id uuid)` |
| Function source MD5 | `3d44e27eed8d67ac223a9c4353d6003a` |
| Owner / security | `postgres` / `SECURITY DEFINER` |
| `authenticated` / `anon` EXECUTE | `true` / `false` |
| Stored function definitions that refer to helper | **45** |
| Read-only preflight result | `INVENTORY_MATCH__PRODUCTION_PRIVACY_GUARD_NOT_DEPLOYED` |

This fingerprint must be checked again immediately before an independently authorized production change, since existing repository and database definitions may advance separately.

### Consumer scope: 45 live stored functions

| Group | Count | Validation priority |
| --- | ---: | --- |
| TradeLink | 11 | Signed operator and manager valid/denied asset, reconciliation, cleanup and audit paths |
| Order Intake | 8 | Create/update/status/archive/restore, idempotency and QA-only restrictions |
| Employee Evaluation | 7 | Self/management reads, create/save/review and role boundaries |
| APS AIMS | 4 | Workflow, custody, transfer and service operations |
| TimeTracker | 2 | Attendance clock transactions and board-scoped OT |
| Module-state helpers | 2 | `module_state_write_allowed` and `module_state_delete_allowed` receive explicit `p_user_id` |
| Core/other | 11 | Board permission, effective-access, directory, module state/activity and locks |
| **Total** | **45** | **All consumers require compatibility screening before production cutover** |

The two module-state helpers were separately inspected: direct `authenticated` and `anon` EXECUTE were **both false**; they are internal `SECURITY DEFINER` helpers. Internal callers may supply a user argument and must not be silently broken by a caller-identity guard. `apsyntra_crm_my_effective_access` assigns its actor from `auth.uid()`; `wm_board_permission_allowed` likewise derives `v_actor` from `auth.uid()`. These are structural observations, not full execution-level authorization acceptance.

**Compatibility risk:** A blanket `p_user_id = auth.uid()` restriction prevents direct cross-principal entitlement inspection, but may change behavior of authorized internal/delegated call paths. Prior to production migration, confirm each caller passes the signed actor for ordinary operations, and provide an explicitly governed alternate internal authorization contract if cross-actor evaluation is truly required. Do not weaken the public RPC to preserve an unsafe delegated path. Test positive and negative module operations, role ceilings, inactive/removed membership, revoked session, concurrency, default-deny and rollback under realistic fixtures.

## 3. Controlled publicly trusted HTTPS staging contract

**No publicly reachable B3 staging host has been deployed.** The existing `server/ws02d-b3-signed-read-staging.mjs` and scoped RPC adapters remain unmounted/default-disabled. The tested local TLS proxy is ephemeral and not an internet-facing host.

The host selection remains a separate approval boundary because adding an Edge Function to the *existing live Supabase project*, making a network endpoint reachable, provisioning a database role for `auth.sessions`, or configuring credentials can introduce operational and security risk. Reuse the existing project; **do not create another Supabase project**. A standalone isolated host would still need approved operator/secret/certificate controls. Do not treat the pre-existing GitHub Pages frontend as a backend hosting environment.

### Minimum safe topology

1. **TLS and origin:** Public CA-trusted HTTPS endpoint, no insecure redirect/fallback, no wildcard credentialed CORS; exact allowed GitHub Pages origin, bounded GET/OPTIONS route, no cache of bearer data and no sensitive access logging.
2. **Identity:** Verify the incoming real GoTrue bearer token server-side for the pinned project, check fresh identity and active non-revoked session from a separately authorized least-privileged session authority. Reject anonymous, malformed, expired, mismatched, removed and revoked identities.
3. **Workspace:** Resolve authoritative active workspace and active membership server-side, never from browser-supplied actor/workspace IDs. Revalidate identity/session/context after scoped reads.
4. **RLS:** Send the **caller's** bearer token and a publishable key to the project's user-scoped PostgREST endpoint. Never silently substitute a service-role client. Only allow the existing read RPCs `wm_auth_access_context` and `has_module_access` with `p_module_id`, **never `p_user_id`**.
5. **Data minimization:** Return sanitized statuses/counts only. No token/session/user/workspace IDs, raw profiles, secret keys, account addresses, private domain records or diagnostic stack traces.
6. **Platform-specific gateway configuration:** If an Edge Function is later selected, verify the project's actual JWT signing/key configuration and current [Supabase Authorization headers](https://supabase.com/docs/guides/functions/auth-headers) guidance. Do not assume that `verify_jwt=true` alone fully verifies a modern publishable-key request or substitutes for `getUser()` and session checks. An `apikey` publishable key is not the user's bearer JWT.
7. **Default-off and rollback:** Keep the route disabled until a security-reviewed staging deployment. Record immutable tested revision, exact endpoint, TLS chain, allowed origins, configured identity scope and teardown plan. On failure disable the route and revoke only explicitly approved staging credentials; do not mutate real members to manufacture negative tests.

### Acceptance matrix

| Test | Required evidence | Current status |
| --- | --- | --- |
| Client genuine signed read | Operator-supplied sanitized B3 preflight, 12 predicates | **VERIFIED — operator report** |
| Current production source, grants and consumers | Read-only catalog preflight, source MD5 and 45 callers | **VERIFIED — metadata** |
| Synthetic foreign-actor privacy denial | Disposable PostgreSQL test + CI | **VERIFIED — nonproduction** |
| Consumer-path preservation | Distinct authorized and denied calls across all 45 dependent functions | **PENDING** |
| Public trust and route confinement | Real public CA TLS chain, exact CORS/origin, no plaintext route | **BLOCKED — host not approved/deployed** |
| Real signed-user user-scoped backend read | Trusted HTTPS -> GoTrue/session -> PostgREST; sanitized outcome | **BLOCKED — host not deployed** |
| Real anonymous, cross-principal, revoked/expired and workspace-denied cases | Safe negative evidence; never change live identities/roles just for tests | **PENDING / environment-dependent** |
| Live production privacy change | Separate source-locked migration, reviewed grants, migration rollback and production acceptance | **NOT AUTHORIZED** |

The overall **CP-WS-02D/B3 ledger remains 6/10** because catalog verification and disposable privacy testing strengthen readiness but do not themselves satisfy trusted mounted backend, new-ceiling signed writes, provider delivery or B4 active-workspace switching.

## 4. Exit criteria and next required gate

**Current subgate:** `CP-WS-02D/B3 — Controlled Trusted HTTPS Staging Host and RPC Privacy Acceptance`: `IN PROGRESS / HOST ACTIVATION BLOCKED`.

Before activating any service: select and approve the trusted host and least-privileged session authority; review the 45 caller paths and prove compatible allow/deny behavior; then run real trusted HTTPS signed-user and denial acceptance. Capture sanitized results and immutable revision/CI evidence. A disposable test PASS never approves a live function replacement.

**Next required gate:** `CP-WS-02D/B3 — Signed HTTPS Host Approval, 45-Consumer Compatibility Regression and Production-Source-Locked Privacy Cutover Review`. Production SQL migration, provider sending and B4 workspace selection remain distinct gates.
