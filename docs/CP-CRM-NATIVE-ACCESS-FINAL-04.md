# CP-CRM-NATIVE-ACCESS-FINAL-04 — Twelve-Application Assignment and Browser Read Contracts

**Date:** 2026-11-20 (Asia/Manila)
**Disposition:** PARTIAL. The complete Board inventory and eight additional read-only signed Board contracts are implemented and tested. Neither Charter production role changes nor all-account application workflow acceptance are certified.

## Verified production facts

Production project: existing `jtlusodorfnyzgyuewkz` only. The authoritative effective-access/role projection covers **253** eligible user–module combinations across twelve application module IDs. It is not a count of successful browser sessions.

Four principal native modules (TimeTracker, Fund Tracker, FuelTrack+, TradeLink) use `native_application_board_context` and had existing browser acceptance scaffolding. The eight other applications use existing workspace Board routes and domain services; incorrectly requiring a principal native-context RPC for those eight would create false access failures.

The read-only production join on effective user, module role, active workspace membership and active Board name confirms:

| Board-linked module  | Effective assignments | Matching active Board | Missing |
| -------------------- | --------------------: | --------------------: | ------: |
| APS AIMS             |                     3 |                     3 |       0 |
| Charter Navigator    |                     4 |                     4 |       0 |
| Employee Evaluation  |                     3 |                     3 |       0 |
| FuelTrans Standalone |                     3 |                     3 |       0 |
| Material Request Hub |                     3 |                     3 |       0 |
| Order Intake         |                    39 |                    39 |       0 |
| Tool Traceability    |                    39 |                    39 |       0 |
| Toolbox Issues       |                     3 |                     3 |       0 |
| **Total**            |                **97** |                **97** |   **0** |

Combined with the four principal native modules' effective matches (156), Board-level configuration coverage is **253/253**. This is **database configuration verification only**, not runtime or module-workflow acceptance.

## Charter intended-access reconciliation

The previous milestones established **36** enabled legacy Charter `Employee` grants; only **one** corresponds to a scoped `user` assignment. The remaining **35** are `INTENT_NOT_CONFIRMED`. Read-only Charter audit records show 36 legacy events and one later scoped event, but do not justify silently converting 35 historical grants into active roles. The existing CRM User Role Management workflow already supports reviewed, auditable scoped assignment. No new role editor, bulk activation, role mapping, access bypass, or production permission change is included in this milestone.

## Delivered signed Board-read contract

- `scripts/cp-crm-native-access-final04-board-inventory.sql` generates per-account pseudonymous, read-only authoritative expected Board assignments for eight Board-linked modules; missing active Boards are explicitly counted.
- `scripts/cp-crm-native-access-final04-board-linked.mjs` accepts an existing local Chromium CDP endpoint, one account's expected SHA-256 key and exact authorized Board IDs from the inventory; never logs into an account, reads tokens/storage, impersonates a user or writes application records.
- It performs an existing signed `wm_auth_access_context` read, checks that the authenticated identity hash matches the expected account, and observes the signed `wm_get_board_shell` HTTP response for the exact requested Board ID. Its classification checks active Board status, Board name, matching workspace ID, signed UI, and unexpected browser/RPC errors.
- It reports **`BOARD_READ_VERIFIED`**, not `VERIFIED` or workflow acceptance. This prevents Board read evidence from being misreported as complete native application initialization or permitted workflow execution. Existing FINAL-03 aggregation intentionally leaves the eight uninstrumented domain workflows pending.
- The four principal applications keep their separate native-context and signed-domain browser acceptance contracts. The new runner does not dilute or replace those.

Example for one _independently signed_ employee with authoritative assignment JSON exported to a protected local path:

`node scripts/cp-crm-native-access-final04-board-linked.mjs --cdp-url=http://127.0.0.1:9222 --expected-user-key=<account-key> --assigned-boards=<account-board-inventory.json>`

The currently connected local Chromium profile is **signed out**, so the runner cannot complete an employee runtime acceptance. A separate signed administrator browser is not a substitute for independently signed employee sessions. No credential or production role writes were made.

## Acceptance gates

| Requirement                                                         | Status                                            |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| All 12 effective module assignments and active Board coverage       | VERIFIED (253/253)                                |
| Eight Board-linked canonical Board contracts                        | IMPLEMENTED and locally tested                    |
| Principal four native-context contracts                             | Existing; not re-certified for all users          |
| Charter 35 intended scoped role mappings                            | PENDING independently confirmed intent            |
| Production Charter role changes                                     | NOT STARTED (requires exact target/role approval) |
| Genuine independent employee browser Board reads                    | BLOCKED (current QA session signed out)           |
| Eight Board-linked native domain startup/workflow contracts         | PENDING separate application-specific acceptance  |
| All 253 signed employee–module combinations and permitted workflows | NOT VERIFIED                                      |

## Next solid implementation

**CP-CRM-NATIVE-ACCESS-FINAL-05 — Charter Intended-Role Decisions, Genuine Signed Employee Session Enrollment, Eight Domain Startup Contracts, and Full 253-Combination Acceptance.** Confirm the exact scoped Charter role for each intended recipient, obtain separate approval for production role changes, and reconcile write/readback individually. Gather genuine independently signed employee sessions, execute the principal native-context checks and Board-linked Board read checks, then add each of the eight domain-specific authorized read/workflow checks before any universal certification. Do not claim a passing build or administrator session is evidence of employee-level access.
