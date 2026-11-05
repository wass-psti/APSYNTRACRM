# CP-WS-02D/B3 — Priority Domain Valid-Write and Record-Authorization Acceptance

**Checkpoint date:** 2026-11-05. **Status:** `VERIFIED — DISPOSABLE PG17 / PRODUCTION ACCEPTANCE PENDING`.

**Scope:** TimeTracker Attendance, Employee Evaluation and Order Intake. Real domain RPC bodies from the production read-only source snapshot were installed and tested with synthetic GoTrue claims, synthesized domain schemas and permission doubles in disposable PostgreSQL 17. Existing private workspace-role ceiling guards are staged in source only. No live attendance, employee, financial or workspace record was created or changed.

## Evidence

[GitHub Actions Workspace Lifecycle run #152](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42000295939) **completed SUCCESS** on main commit `4f918e1b805d4bec7b80a864cd9e08b0e2bbed88`. Named CI steps for all three priority domains passed and existing B1/B2/B3/WS02B, invitation, permission, and FuelTrack regression tests remained green.

| Domain | Source entrypoints individually executed | Positive/negative synthetic checks | Classification |
| --- | --- | --- | --- |
| TimeTracker Attendance | `timetracker_commit_attendance_raw_gps03` | Successful clock-in and clock-out; *separate* GPS evidence for each; revision increments and previous-state recovery copy; duplicate clock-in, stale record ID, repeated clock-out, workspace Viewer and expired session denied; foreign workspace state remains isolated | **VERIFIED — disposable internal-RPC acceptance** |
| Employee Evaluation | `employee_evaluation_create_employee`, `employee_evaluation_update_employee`, `employee_evaluation_update_settings`, `employee_evaluation_save`, `employee_evaluation_review_transition` | Domain Admin employee create/update, revision conflicts, scoped workspace Admin settings update, evaluation Draft → Submitted → Reviewed → Finalized, scoring, stale/terminal transition denial, audit events; Viewer/domain-Admin distinction and foreign-workspace denial | **VERIFIED — disposable domain transaction acceptance** |
| Order Intake | `order_intake_create`, `order_intake_create_idempotent`, `order_intake_update_details`, `order_intake_update_status`, `order_intake_archive`, `order_intake_restore`, `order_intake_qa_archive_once` | Authorized platform/module Admin PO creation; VAT/exclusive amount/profit recomputation; idempotent request key; status revision/terminal denial; archive/restore; restricted QA single-use archive; audit, foreign workspace and expired session denial; Member cannot perform manage actions and Viewer cannot bypass via platform Admin | **VERIFIED — disposable domain transaction acceptance** |

### Source and acceptance artifacts

- `sql/tests/cp-ws02d-b3-timetracker-positive-fixture.sql` and `sql/tests/cp-ws02d-b3-timetracker-valid-write-acceptance.sql`
- `sql/tests/cp-ws02d-b3-employee-eval-positive-fixture.sql` and `sql/tests/cp-ws02d-b3-employee-eval-valid-write-acceptance.sql`
- `sql/tests/cp-ws02d-b3-order-intake-positive-fixture.sql` and `sql/tests/cp-ws02d-b3-order-intake-valid-write-acceptance.sql`
- `.github/workflows/cp-ws01b-disposable-postgres.yml` stages the schema/permission doubles **after** the existing unchanged-source and signed denial checks, never against production.
- The previous [all-domain denial report](./CP-WS-02D-B3-ALL-DOMAIN-DENIAL-ACCEPTANCE.md) establishes source-preserving upper-bound denial for all 24 remaining manifest functions; **denial-only** tests do not count as valid-write acceptance.

### Verified coverage and remaining domain work

The original domain inventory contains **30 distinct mutation entrypoints**. Seven had earlier individually tested business transactions (two board creation, four module-state/lock, one FuelTrack privileged import). This checkpoint adds **13 distinct paths**: one TimeTracker, five Employee Evaluation, and seven Order Intake. The total is now **20/30 (66.7%) individually exercised** in disposable positive/negative acceptance. The remaining **10** are:

- FuelTrack: `append_module_activity`, `commit_fueltrack_requests_with_activity` (2)
- TradeLink: `tradelink_asset_write`, `tradelink_cleanup_fence_activate`, `tradelink_cleanup_fence_release`, `tradelink_reconciliation_assess`, `tradelink_reconciliation_report`, `tradelink_reconciliation_request_cleanup` (6)
- Administration: `charter_admin_set_role`, `wm_admin_set_application_role` (2)

**Caveat:** This denominator measures **identified code paths with transaction tests using simulated dependent schemas and permissions**, not verified production business rules. It excludes unscanned future or transitive functions, actual RLS as deployed, actual GoTrue network sessions, concurrency under parallel requests, provider delivery, and each feature's complete frontend UX acceptance.

### Live production read-only integrity

The checked-in `sql/tests/cp-ws02d-b3-24-live-original-preflight.sql` returned `CP_WS_02D_B3_24_LIVE_ORIGINALS_VERIFIED_DEFAULT_OFF` after this checkpoint:

- **24/24 original production function definitions unchanged**, 0 missing or changed.
- Invitation private runtime and related delivery table absent; signed workspace selection/creation RPCs absent.
- **2 existing workspaces, 40 active memberships**, unchanged in this inspection.

TimeTracker's original domain function is **not granted directly to authenticated clients**; its positive internal-RPC test executes in the disposable privileged fixture with synthetic signed claims. Neither this positive test nor the other domain tests is equivalent to a genuine signed browser acceptance. The fixture visibility helper tests stored clock events; it does not prove final production attendance calculations, location accuracy, session tracking, or payroll correctness. Evaluation and Order Intake fixtures represent their referenced schema/authorization behavior, not every live constraint or downstream integration.

### Production and release gate

**Do not** install any staged SECURITY DEFINER replacement, modify employee or order records, change platform/board roles, bypass repository rules, or enable the invitation provider. The existing delivery adapter and HTTP boundary remain default-disabled, without credentials or trusted Auth/backend integration; B4 workspace selection remains separate and disabled.

**Next required checkpoint:** **Continue CP-WS-02D/B3 — Remaining FuelTrack/TradeLink/Admin Valid-Write Acceptance (10 domain paths)**, then run controlled parallel concurrency/record-level security checks and genuine GoTrue signed-session acceptance before requesting separately scoped production permissions and provider activation.
