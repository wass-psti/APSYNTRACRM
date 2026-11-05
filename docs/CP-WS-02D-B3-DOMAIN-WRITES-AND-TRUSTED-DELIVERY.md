# CP-WS-02D/B3 — Remaining Domain-Write Role Ceilings and Trusted Delivery Prerequisites

**Date:** 2026-11-05  
**Classification:** STAGED CONTRACTS AND DISPOSABLE AUTOMATED ACCEPTANCE VERIFIED; GENUINE SIGNED-USER / LIVE DELIVERY / PRODUCTION CUTOVER PENDING.  
**Production:** Existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`. No production SQL/permissions/data mutations, real emails, provider credentials or new Supabase project.

## 1. Domain-write coverage: 30 of 30 staged, 0 of 30 production activated

Baseline: the read-only inventory at `sql/tests/cp-ws02d-b2-domain-permission-catalog.sql` found **30** public `SECURITY DEFINER` routines with possible independent write paths and direct workspace scope but no direct board ACL call. **27** were directly executable by `authenticated`, **3** were not, **0** by `anon`. This is an audit candidate set, not a claim that each routine was vulnerable.

| Scope | Count | Staged candidate / evidence |
| --- | ---: | --- |
| Standard/configured board creation | 2 | `sql/cp-ws02d-b2-board-create-ceiling-candidate.sql` + disposable create/Viewer/CAS tests |
| Shared module state and operation locks | 4 | `sql/cp-ws02d-b3-shared-module-mutation-ceiling-candidate.sql` + Member, Viewer, cross-workspace, expired-session and rollback tests |
| Remaining Employee Evaluation, Order Intake, FuelTrack+, TradeLink, TimeTracker, module activity and role-admin routines | 24 | `sql/cp-ws02d-b3-remaining-domain-ceiling-candidate.sql` + `sql/tests/cp-ws02d-b3-remaining-domain-manifest.json` + `scripts/ws02d-b3-source-check.mjs` + disposable PG17 tests |
| **Total** | **30** | **STAGED ONLY; NO PRODUCTION INSTALL** |

The 24-function candidate was reconstructed from live `pg_get_functiondef` under read-only access. Each source is fingerprint-locked with `md5(pg_get_functiondef(...))` preflight; the source-check program reconstructs and hashes the exact original body after removing only the inserted guard. No original domain role logic, record-level constraints, audit writing, CAS, signature, security-definer declaration or existing grants were intentionally changed. The new signed `private.ws02d_workspace_ceiling` is a maximum permission **AND** existing domain rights, never an override. Role-admin, restricted cleanup, import and administrative archive functions use `manage`; ordinary domain mutations use `edit`.

**Disposable integration evidence:** [PG17 workflow #41994413233](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41994413233) concluded **SUCCESS**, including original-source reconstruction, source fidelity 24/24, registration of all 24 guards, Viewer `edit` denial, Member `manage` denial, revoked/expired signed-session denial, and rollback. Previous six integrations also passed. Source preservation and selected denial tests do **not** prove all 30 domain's positive and negative runtime workflows. The remaining 24 still require deeper signed-user action-level regression before production.

**Pages:** [deployment run #41994412556](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41994412556) concluded **SUCCESS** for the same main commit `97b211d26a9d9cb1389c7b7b12d32e53dc08d234`; a static build is not a domain authorization acceptance result.

## 2. Trusted provider prerequisites staged, not activated

- `server/ws02d-invitation-http-boundary.mjs`: **unmounted and disabled** HTTP boundary, strict origin, POST/JSON limits, bearer syntax, injected genuine GoTrue actor/session verifier, privately authorized issuer, no token in response, no-cache and redacted errors. The `verifySignedActor` and `issueForAuthorizedActor` functions are **interfaces awaiting a real deployed trusted implementation**, not proof of live signed identity validation.
- `server/ws02d-trusted-delivery.mjs`: requires `recordDeliveryOutcome` before activation; provider success only returned after durable receipt callback reports `persisted:true`. Unknown provider outcomes are recorded as uncertain when possible and never automatically resent.
- `server/ws02d-resend-transport.mjs`: optional unselected **disabled** provider adapter. Uses fixed endpoint, server-only credential, pinned sender envelope, HTTP timeout and idempotency key. Mock tests do **not** establish deliverability, sender DNS ownership or real delivery.
- `sql/cp-ws02d-b3-delivery-receipt-candidate.sql`: **private, default-deny, uninstalled** delivery receipts and append-only outcome event ledger. No `anon`/`authenticated` rights. Signed issued-actor/owner authority, idempotent matching receipt, uncertain-to-accepted reconciliation, conflicting-provider denial and session revocation are verified in [PG17 workflow #41994413233](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41994413233).
- Missing external prerequisites: provider selection, approved sender/DNS, secret storage and rotation, deployed signed verification/issuer/receipt adapters, webhook signature validation and bounce/rejection handling, quotas, delivery reconciliation and monitoring strategy, authorized production migration with rollback, genuine signed sender/recipient browser trials and out-of-band approval for role/data/permission changes.

## 3. Live read-only postcheck

Executed `sql/tests/cp-ws02d-b3-production-readonly-preflight.sql` via connected Supabase PostgreSQL query:

`WS02D_B3_PRODUCTION_DEFAULT_DENY_AND_ORIGINAL_DOMAIN_FINGERPRINTS_VERIFIED`

Verified unchanged board ACL and four shared module routine fingerprints; invitation/runtime and delivery receipt objects absent; workspace create/switch gates disabled; **2 workspaces, 40 active memberships**. No live role, membership, token, credential, or board record was changed.

## 4. Acceptance classification and next required gate

| Checkpoint requirement | Classification |
| --- | --- |
| 30/30 named candidate coverage with additive server-side role ceilings | **IMPLEMENTED — staged** |
| Exact source/body preservation, production fingerprint preflight, disposable compilation | **VERIFIED — automated** |
| Representative Member/Viewer/foreign/expired-session and rollback denial | **VERIFIED — synthetic** |
| Per-domain genuine signed-user authorization, business workflow regression, concurrency and RLS acceptance | **PENDING** |
| Private receipt ledger, idempotent/uncertain reconciliation and mock HTTP boundary | **VERIFIED — disposable/mock only** |
| Real provider deliverability, verified sender, webhook reconciliation and signed deployment | **PENDING** |
| Live advanced-role enablement, production ACL/DDL/permission activation | **BLOCKED — separate approval required** |

**Progress:** Staged integration candidates **30/30 (100%)**; production-activated **0/30 (0%)**; overall checkpoint completion **indeterminate** pending signed-user acceptance and provider selection.

**Next required checkpoint:** Continue **CP-WS-02D/B3 — Genuine signed-session domain authorization and trusted delivery operational acceptance**, then seek a separate scoped approval for any production migration/role activation. Do not represent B3 as production-complete from synthetic CI or a successful Pages build.

## 5. CP-WS-02D/B3 genuine-session preflight preparation (2026-11-05)

The user's currently open GitHub Pages site could not be read from this chat's browser connector: the originating browser context was unavailable. **No genuine signed-browser execution was observed.** Privileged SQL with a synthetic JWT is not counted as genuine acceptance.

The **Security → B3 · Signed domain read preflight** is now a user-initiated production-safe read check. The code in `frontend/workspace-b3-signed-read-preflight.js` verifies `auth.getVerifiedUser()`, the authoritative workspace returned by `wm_auth_access_context`, 12 `has_module_access` read-only calls using the signed user's default `auth.uid()` (never an arbitrary `p_user_id`), and fresh identity/context continuity. The UI emits only whitelisted check names/statuses and aggregate counts; the report contains zero identifiers, bearer tokens, writes, provider sends or speculative write-denial PASS statuses. It resets and discards results on logout or session expiry. **A successful run certifies a signed read preflight only; it does not certify the 30 mutation gates or live invitation delivery.**

- [Frontend Validation #41995728202](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41995728202): **SUCCESS** after immutable-report fixture correction.
- [Disposable PG17 Acceptance #41995728086](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41995728086): **SUCCESS**.
- [Pages Deployment #41995726902](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41995726902): **SUCCESS**.
- Read-only 30-function production preflight `sql/tests/cp-ws02d-b3-live-original-source-preflight.sql` was executed on the existing Supabase project and returned **`WS02D_B3_LIVE_30_ORIGINAL_FUNCTIONS_AND_DEFAULT_DENY_VERIFIED`**: 30 expected, 30 exist, 30 original MD5 fingerprints unchanged, no candidate directly executable by `anon`, catalog still 30, board ACL unchanged, signed-read predicate grants intact, invitation / role-ceiling runtime absent, workspace lifecycle disabled; 2 workspaces / 40 active memberships. This result is **LIVE READ ONLY**, not a signed-user test.
- Supabase Edge Function inventory found three active functions (`admin-sync-auth-access`, `toolbox-attachment-maintenance`, `apsyntra-native-issues`). **No `ws02d-invite` trusted delivery function was deployed.** This does not prove anything about external email providers but confirms this planned endpoint is not active.

**Required interactive acceptance:** open [APSYNTRA CRM Security](https://wass-psti.github.io/APSYNTRACRM/#/security) while genuinely signed in; select **Run B3 signed read preflight** then **Copy nonsecret B3 preflight**. Do not share cookies, a JWT, bearer invitation links or raw database responses. The outcome requires review; a PASS does not authorize writes or promotion.

**Outstanding operational acceptance:** separately approved production domain/role/permission cutover, genuine signed Member/Viewer/Admin positive and denied write workflows with reversible fixtures and complete audit evidence, revoked/expired-session and cross-workspace denial, real provider selection and sender DNS, durable deployed issuer/receipt adapters, webhook verification and end-to-end deliverability. Without those, classify genuine signed write and provider delivery **BLOCKED/PENDING**, not PASS.

**Next required gate: CP-WS-02D/B3 — Genuine signed-browser preflight evidence and separately approved domain-write/provider operational activation.**
