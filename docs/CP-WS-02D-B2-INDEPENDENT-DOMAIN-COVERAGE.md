# CP-WS-02D/B2 — Independent Domain Permission Coverage and Trusted Delivery

**Date:** 2026-11-05  
**Classification:** Read-only production authorization catalog VERIFIED; staged independent-domain synthetic denial and trusted receipt reconciliation IMPLEMENTED; live per-domain ceiling integration and trusted external delivery NOT ACCEPTED.  
**Production:** Existing project `jtlusodorfnyzgyuewkz`. **No production SQL writes, roles, permissions, records, invitations, or outgoing emails in this increment.**

## Evidence and inventory accuracy

- Read-only SQL: `sql/tests/cp-ws02d-b2-domain-permission-catalog.sql` executed against the actual PostgreSQL catalog, producing **30** independent workspace-scoped possible-write candidates.
- **27** have `authenticated` EXECUTE, **3** do not, and **0** have `anon` EXECUTE. The three without direct `authenticated` EXECUTE are `order_intake_qa_archive_once`, `timetracker_commit_attendance_raw_gps03` and `wm_admin_set_application_role`; audit their privileged callers independently.
- **30/30** reference `auth.uid()` and current workspace in their source bodies. **0/30** have a *direct textual* live-GoTrue-session guard marker. **0/30** directly reference the not-yet-installed `private.ws02d_workspace_ceiling`. These are source-text observations, not proof that every call lacks an inherited or external guard.
- The new board ACL ceiling stage covers **53** referenced board ACL calls only when installed. It does not automatically protect these 30 independent domain candidates.
- The existing `public.has_module_access` helper validates membership, active profile, module role and current workspace, but does **not itself** distinguish workspace Viewer edit/manage privileges. Retain those domain rules; apply the new ceiling as an additional **AND**, never a replacement or OR.
- Example confirmed existing domain controls: Employee Evaluation review requires an evaluation admin actor, Order Intake archive requires platform admin plus module access and revision CAS, and TradeLink reconciliation is workspace-key-scoped. These controls do not substitute for a future workspace Viewer write ceiling.

## Review queue — all 30 named candidates

| Family | Routines | Count | Ceiling / acceptance boundary |
| --- | --- | ---: | --- |
| Board catalog | `wm_create_board`, `wm_create_board_configured` | 2 | Staged separate signed-`edit` guard candidate and disposable create/Viewer denial tests; **not** production installed |
| Employee Evaluation | `employee_evaluation_create_employee`, `employee_evaluation_review_transition`, `employee_evaluation_save`, `employee_evaluation_update_employee`, `employee_evaluation_update_settings` | 5 | Preserve evaluation actor-role and transition/revision controls; add signed workspace-`edit` AND guard |
| FuelTrack+ | `commit_fueltrack_requests_with_activity`, `import_fueltrack_activity_backup` | 2 | Preserve state invariants, event idempotency, admin import restrictions; determine import/manage ceiling before writing |
| Module activity | `append_module_activity` | 1 | Preserve module access, event identity and audit payload policy; add edit ceiling |
| Module operation locks | `acquire_module_operation_lock`, `release_module_operation_lock` | 2 | Preserve module role, lock token/owner/expiry semantics; add edit ceiling |
| Module state | `put_module_state`, `delete_module_state` | 2 | Preserve state-key policy, restricted attendance ownership, CAS, payload validation; add edit ceiling |
| Order Intake | `order_intake_archive`, `order_intake_create`, `order_intake_create_idempotent`, `order_intake_qa_archive_once`, `order_intake_restore`, `order_intake_update_details`, `order_intake_update_status` | 7 | Preserve existing platform-admin and module-specific gates, order state transitions, revision CAS and audit; add signed workspace ceiling; QA function not client granted |
| Role administration | `charter_admin_set_role`, `wm_admin_set_application_role` | 2 | Preserve platform-admin/role ceiling/delegation protections; require stricter signed workspace-`manage` gate, review caller reachability |
| TimeTracker | `timetracker_commit_attendance_raw_gps03` | 1 | Restricted internal clock writer; no direct client EXECUTE; preserve native GPS, attendance, OT, field privacy, idempotence and full domain authorization |
| TradeLink | `tradelink_asset_write`, `tradelink_cleanup_fence_activate`, `tradelink_cleanup_fence_release`, `tradelink_reconciliation_assess`, `tradelink_reconciliation_report`, `tradelink_reconciliation_request_cleanup` | 6 | Preserve platform/module roles, workspace-key fencing and reconciliation rules; add edit/manage ceiling based on each operation's existing policy |
| **Total** | | **30** | **Not production activated** |

The table is an **integration queue**. Full per-domain code-diff, grants/dependencies, active/expired/revoked real-session, Viewer/Member/Admin, domain-owner denial, cross-workspace, refresh persistence and audit acceptance are still required. A textual function match alone is not a vulnerability finding.

## Independent domain AND integration regression

`sql/tests/cp-ws02d-b3-independent-domain-ceiling-disposable.sql` creates disposable-only synthetic domain entitlements and event rows, then composes `private.ws02d_workspace_ceiling` with a separate domain permission grant.

Expected checks: Member with domain edit authorization succeeds; workspace admin without domain authorization is denied; disabled and enabled Viewer writes are denied; foreign workspace writes are denied; expired signed session writes are denied; rollback restores all prior fixtures. **This test validates the reusable integration invariant, not each real application endpoint.** CI must pass before it is classified VERIFIED.

The board-create candidates and PG17 tests were already added in the parallel CP-WS-02D/B2 implementation; do not duplicate or activate them.

## Trusted provider — receipt reconciliation increment

The disabled optional `server/ws02d-resend-transport.mjs` now returns a provider-issued message identifier **only to the trusted server caller**, not the Pages browser. `server/ws02d-trusted-delivery.mjs` requires a `recordDeliveryOutcome` callback before sending, records `provider-accepted` with IDs only and requires `persisted:true` before reporting submission. On ambiguous network/provider outcomes it attempts `delivery-uncertain` bookkeeping without the token, email body or provider key, then fails closed. A failed audit receipt is a reconciliation event, **not permission to reissue or resend**.

Mock tests cover positive acknowledgment, missing audit callback, failed receipt persistence, delivery uncertainty, single-send boundaries, redacted errors, and no bearer token in return values or callback arguments. These tests use injected mock transports and synthetic identifiers, not a deployed provider or durable production audit store.

**External Resend remains an unselected adapter candidate.** Its published idempotency contract includes 24-hour key lifetime; do not confuse that with indefinite exactly-once delivery. Sender-domain DNS, approved secret management, signed trusted issuer, durable outcome store, reconciliation, webhooks/bounces, provider choice, quotas, controlled resends and genuine signed sessions are still pending. No network send, secret, or billing action was authorized or performed.

## Progress and next gate

- **Inventory enumeration:** 30/30 reviewed by read-only catalog (**100% of inventory**, not 100% domain acceptance).
- **Per-domain production ceiling integration:** **0/30** (staged board-create candidates are not installed).
- **Provider mock audit contract:** staged and tested; no external sender acceptance.
- **Full checkpoint completion:** **indeterminate**, because domain-specific runtime acceptance and provider deployment denominators require approved scope and real signed evidence.

**Next required gate: CP-WS-02D/B3 — verify remaining independent domain writer ceilings and trusted delivery activation prerequisites.** No production migration or external sends until separately scoped approvals, rollback and genuine signed-session evidence.
