# CP-WS-02D/B3 — Remaining Domain Writes and Trusted Invitation Delivery Prerequisites

**2026-11-05 status:** `STAGED — DISPOSABLE PG17 / NODE22 VERIFICATION PASS — PRODUCTION DOMAIN INTEGRATION AND TRUSTED DELIVERY BLOCKED`.

**Production boundary:** Existing Supabase `jtlusodorfnyzgyuewkz`; no new database, external provider selection, production DDL/RPC changes, email credential, actual invitation, user grant, board write, membership mutation or Edge Function deployment. The GitHub Pages invitation dialog remains a **no-send preview**.

## Verified technical evidence

- [Workspace Lifecycle PG17 / Node22 CI #126](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41994413233): **completed SUCCESS**. Tested private original invitation contract, bounded issuance, replay/expiry/revocation, mock Resend delivery, hardened trusted HTTP adapter, four module-state/lock write ceilings, independent-domain `AND` predicate, and the new provider receipt ledger.
- Existing [B2 board ACL and board-create integration CI #104](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41990746425): **SUCCESS**, using synthetic GoTrue sessions and rollback. Neither B2 nor B3 SQL changed production.
- `sql/tests/cp-ws02d-b3-production-readonly-preflight.sql` executed against the existing Supabase production database and returned `WS02D_B3_PRODUCTION_DEFAULT_DENY_AND_ORIGINAL_DOMAIN_FINGERPRINTS_VERIFIED`. No private WS02D invitation or receipt objects were present. Board ACL, module-state and lock functions retained their original definitions; B3 creation/B4 selection remained disabled. **2 live workspaces / 40 active memberships**. This is a read-only production verification, not invitation acceptance.
- Read-only Edge Function catalog inspection found **three active functions** (admin sync, attachment maintenance, native issues); none was a WS02D invitation-delivery function. This does not reveal whether an external provider exists; no provider account/secret was queried or created.

## Domain RBAC integration boundary

The production SQL inventory `sql/tests/cp-ws02d-b2-domain-authorization-inventory.sql` yielded **30 candidate independent mutation paths** (textually referencing current workspace but not `work_board_access`). The textual classification is *not* evidence that any listed routine lacks its own domain authorization.

| Category | Independently identified paths | Staged and verified in disposable PG17 | Remaining targeted review |
| --- | ---: | ---: | ---: |
| Board creation | 2 | 2 (`wm_create_board`, `wm_create_board_configured`) | 0 |
| Shared module state and operation locks | 4 | 4 (`put_module_state`, `delete_module_state`, `acquire_module_operation_lock`, `release_module_operation_lock`) | 0 |
| FuelTrack/activity/import (nonshared) | 3 | 1 (`import_fueltrack_activity_backup`) | 2 |
| Employee Evaluation | 5 | 0 | 5 |
| Order Intake | 7 | 0 | 7 |
| TradeLink | 6 | 0 | 6 |
| TimeTracker attendance | 1 | 0 | 1 |
| Charter platform/admin role paths | 2 | 0 | 2 |
| **Total** | **30** | **7** | **23** |

The remaining 23 are:

- **FuelTrack:** `append_module_activity`, `commit_fueltrack_requests_with_activity`.
- **Employee Evaluation:** `employee_evaluation_create_employee`, `employee_evaluation_review_transition`, `employee_evaluation_save`, `employee_evaluation_update_employee`, `employee_evaluation_update_settings`.
- **Order Intake:** `order_intake_archive`, `order_intake_create`, `order_intake_create_idempotent`, `order_intake_qa_archive_once`, `order_intake_restore`, `order_intake_update_details`, `order_intake_update_status`.
- **TradeLink:** `tradelink_asset_write`, `tradelink_cleanup_fence_activate`, `tradelink_cleanup_fence_release`, `tradelink_reconciliation_assess`, `tradelink_reconciliation_report`, `tradelink_reconciliation_request_cleanup`.
- **TimeTracker:** `timetracker_commit_attendance_raw_gps03`.
- **Administration:** `charter_admin_set_role`, `wm_admin_set_application_role`.

No bulk rewriting is permitted: each domain has independent record-level RBAC, platform authority, concurrency, audit and privacy constraints. Review each routine against its current role-specific contract; where needed, compose `private.ws02d_workspace_ceiling(ws,auth.uid(),'edit'|'manage')` as a **further AND restriction** before mutation, not as a replacement or an OR grant. Deny Viewer writes even if underlying module access or a legacy board role would allow them. For sensitive financial/employee/attendance transitions, existing domain-specific ceilings remain authoritative.

### Four staged shared-module mutations

`sql/cp-ws02d-b3-shared-module-mutation-ceiling-candidate.sql` is generated from the four **actual read-only production definitions**, with their original MD5 fingerprints and exact existing signatures. It adds an `edit` upper bound after workspace resolution and before any state/lock DML; it preserves native policy, record ownership, CAS revision, lock token, audit and idempotency behavior.

`sql/tests/cp-ws02d-b3-module-mutation-fixture.sql` reproduces those functions using synthetic domain dependencies, not real app records. `sql/tests/cp-ws02d-b3-module-mutation-acceptance.sql` checks Member create/update/CAS conflict/delete, operation lock acquire/release/replay, Viewer denial with advanced flag both off/on, preexisting Viewer-owned record/lock denial, unauthorized module denial, foreign workspace isolation, revoked GoTrue session denial and full rollback.

The four function replacements are **not deployed**. The baseline MD5s are checked again before any authorized production change.

### FuelTrack privileged activity import — seventh staged integration

The live `public.import_fueltrack_activity_backup(jsonb)` function already requires the **FuelTrack+ Admin** module role. The staged `sql/cp-ws02d-b3-fueltrack-import-ceiling-candidate.sql` adds a signed workspace `edit` upper bound immediately before the event inserts, preserving the existing Admin role and import semantics. `sql/tests/cp-ws02d-b3-fueltrack-import-fixture.sql` reproduces the production function using synthetic events and module-role data; `sql/tests/cp-ws02d-b3-fueltrack-import-acceptance.sql` proves Admin-Member import, duplicate suppression, Viewer denial with advanced flag off/on, original module-Admin denial for ordinary users, foreign scope, expired session and rollback.

[PG17 CI Run #131](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41995268080) **completed SUCCESS**, including this seventh review candidate and prior B3 tests. No production FuelTrack function, activity record, module grant or archive was modified.

### Read-only grant inventory of remaining 23 candidates

`sql/tests/cp-ws02d-b3-remaining-domain-grant-inventory.sql` queried production catalog metadata, without reading records or changing permissions. Results: **23** remaining candidate functions; **0** directly executable by `anon`; **20** executable by `authenticated`; **3** not directly executable by the `authenticated` role. Direct source-text checks found `has_module_access` in **21** and `is_platform_admin` in **14**. None contains the literal `wm_board_config_session_active` call, but indirect helpers may enforce the session; this result **does not establish a missing session guard**. Continue reviewing each function's actual transitive authorization and mutation path, rather than treating textual matches as proof of a vulnerability.

## Trusted delivery prerequisites

The optional provider-neutral orchestrator `server/ws02d-trusted-delivery.mjs` and optional Resend HTTP adapter `server/ws02d-resend-transport.mjs` remain default-disabled. They require private signed issuance, a provider response, and a **persisted provider receipt** before claiming a delivery submission. The Resend adapter is *not selected* as the approved provider, and no credentials or sender domain were configured.

A new `server/ws02d-invitation-http-boundary.mjs` is an **unmounted/un-deployed function**. Its test-only activation validates strict HTTPS origin, POST/JSON, bounded request bytes, bearer-JWT shape, and a caller-supplied **real GoTrue JWT/session verifier**. It binds the verified actor to a separately required **server-authorized private issuer** and durable receipt writer; both remain implementation/integration prerequisites, not real connected services. It returns a redacted status and invitation UUID, never the bearer token, provider response, email or JWT. Unit tests assert default-off, denied cross-origin, missing/malformed/expired-session identities, invalid role/input, no token reflection and receipt-writer requirement.

`sql/cp-ws02d-b3-delivery-receipt-candidate.sql` stages *private* default-deny delivery receipt and append-only audit tables and a signed, ungranted `private.ws02d_record_delivery_outcome(uuid,text,uuid)` routine. It stores **provider-accepted** and **delivery-uncertain** states, with no raw invite tokens or message bodies, and supports idempotent retries and an uncertainty-to-accepted reconciliation. It prohibits downgrade, conflicting provider IDs, unauthorized writers and expired sessions. The synthetic acceptance `sql/tests/cp-ws02d-b3-delivery-receipt-acceptance.sql` passed in CI #126. It does **not** yet handle provider-signed webhooks or final delivered/bounced status.

### Provider/platform external prerequisites (PENDING)

1. Approve a provider and prove ownership/control of a sender domain. For optional Resend, verify sending-domain DNS (SPF/DKIM), validate production sender identity, allowed region, rate limits, pricing, and API privileges without placing keys into GitHub Pages or source code.
2. Establish a dedicated trusted backend endpoint in the **existing** Supabase project. Use genuine GoTrue JWT validation, fresh session/role checks and verified workspace ownership. Supabase's current [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth) describes `auth:'user'` and the default `verify_jwt=true`. A service-role or secret key bypassing RLS must never substitute for signed-user authorization.
3. Bind the trusted endpoint to the *private* issuer and receipt writer using a reviewed server-only database execution context. Existing SQL functions intentionally have **no** `authenticated`/browser EXECUTE grants. Do not grant the token-returning issuer directly to the browser to make the UI work.
4. Store any API keys and webhook signing secrets only in authenticated backend/Supabase project secrets. Never expose tokens, provider keys, raw email links or user details in browser responses, telemetry or logs.
5. Implement delivery reconciliation for provider-accepted, delivered, failed, bounced and suppressed events; enforce verified webhook signatures over the **raw** payload, replay idempotency and bounded retention. Provider acceptance is not delivery to the mailbox.
6. Implement an actual signed invitation-acceptance route with secure one-time token handoff, no analytics/referrer leakage, verified recipient email, expired/revoked/replayed token denial and controlled session refresh.
7. Prove genuine signed owner, ordinary member, Viewer, foreign actor and invited recipient acceptance, including stable refresh, role ceiling, audit, concurrent acceptance and an approved external mailbox. Synthetic CI is insufficient.
8. Obtain independently verified backup recovery, provider/Supabase settings review, rollback playbook and separately scoped authorization before production Auth/DB permissions, registrations, invited memberships or provider sends are enabled.

Resend documents a [24-hour idempotency key scope](https://resend.com/changelog/idempotency-keys) and [signed webhook verification](https://resend.com/changelog/managing-webhooks-via-api). These behaviors are reference constraints, not evidence that APSYNTRA has configured or exercised those provider functions.

## Additional activation dependency — invited workspace selection

Production `public.current_workspace_id(uuid)` currently resolves the caller's existing active workspace, and the CP-WS-01C/B4 session-switching feature remains disabled. The staged invitation acceptance returns `switched:false` and does not automatically change the active workspace. **An existing account joining another workspace, or a new account with an independently provisioned personal Main Workspace, therefore cannot assume immediate access to the invited workspace through APIs that require the current authoritative workspace.**

Before enabling real invitations, complete a separately approved and tested B4 signed-session workspace-selection cutover **or** implement an independently authorized explicit-workspace-scoped access route. Preserve personal Main Workspace and other memberships. Do not turn on B4 or replace `current_workspace_id` as an incidental part of email activation. This is an operational usability and authorization dependency, not permission to loosen workspace isolation.

## Verification and delivery decision

| Acceptance criterion | Classification |
| --- | --- |
| Read-only function fingerprints and production default-deny | **VERIFIED** |
| Domain candidate inventory and risk grouping | **VERIFIED** |
| Two B2 board-creation integrations | **VERIFIED — disposable** |
| Four B3 module-state/lock integrations | **VERIFIED — disposable** |
| FuelTrack Admin-only import with Viewer write denial | **VERIFIED — disposable** |
| Synthetic independent domain `AND` permission contract | **VERIFIED — disposable** |
| Default-off HTTP authentication boundary, no secret response | **VERIFIED — Node mocks** |
| Durable provider receipt/audit lifecycle | **VERIFIED — disposable** |
| Remaining 24 individual domain reviews and integrations | **PENDING** |
| Deployed trusted issuer and real provider/webhooks | **PENDING** |
| Genuine signed invitation acceptance and production authorization | **BLOCKED** |

**Gate decision:** `CP-WS-02D/B3` is partially accepted at its isolated development boundary; **not production-ready**. All delivery gates remain off. **Next required checkpoint:** continue `CP-WS-02D/B3` for the 23 remaining independent domain reviews, with priority on TimeTracker/employee data and restricted administrative role changes, followed by provider/domain verification and controlled signed acceptance.
