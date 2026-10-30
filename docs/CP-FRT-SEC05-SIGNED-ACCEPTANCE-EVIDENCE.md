# CP-FRT-SEC05 — Signed Bootstrap/Nonbootstrap Acceptance Evidence

**Date:** October 30, 2026 (Asia/Manila)  
**Project:** APSYNTRA CRM / WatchdogWorkspace  
**Evidence branch:** `evidence/cp-frt-sec05-signed-scenario-results`  
**Base commit:** `e121d3fad6725b011409c70d2ac3eb58a7026208`  
**Release boundary:** Evidence only. Do not merge into `main` or deploy without separate authorization.

## Two genuine-session browser results submitted by the operator

The operator supplied the following sanitized output from the deployed **CP-FRT-SEC03** read-only runner. Neither output contains a JWT, account UUID, email or refresh credential. The reports do not contain cryptographic signatures or independent session identifiers; they establish **user-submitted runtime acceptance evidence**, corroborated separately by a read-only PostgreSQL inventory, but **not independently replayed** by the engineer.

| Scenario | Report status | Checks passed | Role/source | Mutating operations |
| --- | --- | ---: | --- | ---: |
| BOOTSTRAP | PASS | 7/7 | Existing authorized bootstrap administrator | 0 |
| NONBOOTSTRAP | PASS | 5/5 | Existing HR nonbootstrap session (operator-described) | 0 |

The operator provided the HR user's name in the conversation; this document intentionally **does not reproduce personal identity details** in the public source repository.

### BOOTSTRAP checks (all PASS)

- `verified-signed-identity`
- `frt-operational-role-vocabulary`
- `legacy-frt-admin-list-unavailable`
- `bootstrap-role-configuration-snapshot`
- `bootstrap-user-management-snapshot`
- `other-workspace-role-snapshot-denied`
- `existing-frt-operational-context`

### NONBOOTSTRAP checks (all PASS)

- `verified-signed-identity`
- `frt-operational-role-vocabulary`
- `legacy-frt-admin-list-unavailable`
- `nonbootstrap-role-configuration-denied`
- `nonbootstrap-user-management-denied`

The combined result satisfies the *two required read-only signed-session governance scenarios*: **2/2**. It does not certify any write path, fresh-session role transition, board-host runtime, or finance workflow.

## Independent connected PostgreSQL inventory

Read-only SQL executed against the connected WatchdogWorkspace Supabase project on October 30, 2026 returned:

| Backend invariant | Readback |
| --- | ---: |
| Retired FRT QA accounts | 0 |
| Legitimate FRT memberships | 3 |
| Central module role assignments | 121 |
| Bootstrap identity records | 2 |
| Work boards | 74 |
| Work board events | 15,469 |
| Central applied role-change audit events | 0 |
| FRT domain audit events | 0 |
| Distinct workspaces with active memberships | 1 |

Static database function inspection established:

- `apsyntra_role_configuration_snapshot` and `apsyntra_role_user_management_snapshot` reference the existing `apsyntra_role_require_scope` guard and are unavailable to `anon`.
- Direct `authenticated` and `anon` function EXECUTE privileges remain revoked on `frt_admin_users` and `frt_admin_set_role`.
- The central snapshot functions are executable by authenticated database role **only** behind server-side scope/identity enforcement. This is not evidence that a nonbootstrap call was replayed from SQL; the nonbootstrap actual denial is established by the operator's submitted signed runner report.
- No database writes were issued while corroborating this evidence.

## Classification and acceptance boundaries

| Requirement | Classification | Basis |
| --- | --- | --- |
| Bootstrap signed governance **read-only** scenario | VERIFIED FROM SUBMITTED RUNTIME EVIDENCE | 7/7 reported PASS; zero writes |
| Nonbootstrap signed governance **read-only** scenario | VERIFIED FROM SUBMITTED RUNTIME EVIDENCE | 5/5 reported PASS; zero writes |
| Independent database invariants and function guards | VERIFIED | Read-only live PostgreSQL inventory |
| Independent replay by connected browser | BLOCKED | This chat cannot access the originating browser session |
| Signed role assignment/revocation and fresh-session denial | PENDING | Not exercised by this read-only runner |
| Cross-workspace signed read/write on both workspaces | BLOCKED | Only one workspace has active memberships in current project |
| Canonical local host `http://127.0.0.1:5173/#/` / `/api/v1/boards` | BLOCKED | User's local host cannot be accessed here |
| Native FRT request, approvals, liquidation, attachments and domain RBAC | PENDING | No operational live acceptance recorded |
| Production-wide 12-board integration acceptance | PENDING | Not implied by governance checks |
| Merge to `main` | NOT AUTHORIZED | No merge performed for this checkpoint |

**Next development priority:** CP-FRT-SEC06 — native signed `/api/v1/boards` integration and FRT domain-operation acceptance against the approved local 5173 host, followed by explicitly authorized nonproduction role transitions, fresh-session access proofs, and independently audited authorization. Preserve the established one-backend/one-database/12-board architecture and existing legitimate users.

## Record integrity

This document records sanitized PASS/FAIL labels and aggregate database figures. No PII, credentials, JWT, access token, profile UUID, or operational finance data was added to the repository. The branch is intentionally unmerged, and no PR was opened because prior PRs had been merged externally before explicit final authorization.
