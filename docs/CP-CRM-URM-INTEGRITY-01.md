# CP-CRM-URM-INTEGRITY-01 — User Role Management and Role Configuration Functional Integrity Audit

**Date:** 2026-11-20 (Asia/Manila)
**Disposition:** Scope-limited functionality remediation delivered; universal signed multi-account runtime acceptance PENDING.

## Baseline and production evidence

Source inspection covered `frontend/app.js`, `frontend/user-role-management.js`, `frontend/role-configuration-client.js`, `frontend/data.js`, `frontend/board/cache-channel.js`, related tests and production PostgreSQL RPC metadata. Production queries were strictly **read-only**. All 14 reviewed central role/authorization RPC names were present. The eight reviewed role snapshots are STABLE server functions; five scoped role setters are VOLATILE.

Production aggregate inventory (no credentials or individual user data exposed): 44 active workspace memberships; 265 legacy module assignment records; 250 role-change requests (2 proposed, 248 applied); 498 role audit events. Charter Navigator has 36 enabled legacy `Employee` entries, one scoped-role record and 35 unmatched legacy accounts. These counts indicate configuration inventory and a historical role-mapping discrepancy; they do **not** independently certify effective-user capabilities or explain the intent of previous grants.

**No live role change, revocation, permission grant, RLS change, migration, schema change, or production data mutation was performed.**

## Architectural distinction

**User Role Management** makes real, audited workspace/module/Board assignment changes through signed backend RPCs. **Role Configuration** is staged-only: the eight create/edit/activate/deactivate, assignment, permission and workspace controls submit **proposals**. A staged proposal is not an operational role grant. Both surfaces require appropriate server-verified workspace context.

## Findings and implemented corrections

| ID | Root cause | Functional remediation | Evidence |
| --- | --- | --- | --- |
| URM-01 | Stage proposal UI discarded its returned UUID and displayed confirmation after a generic reload. The *particular* persisted record was never checked. | Verify exact ID, operation, canonical payload, workspace, `staged_only` mode and `proposed` state in refreshed authoritative proposal snapshot before success. Missing/mismatched record yields a verification error. | Unit regression; production creation untested |
| URM-02 | Eight known STABLE role snapshots were classified as unknown RPCs, evicting unrelated Board caches and precluding appropriate concurrent read handling. | Explicitly classify only the eight reviewed snapshots as signed read-only RPCs. Existing transport sharing applies only to overlapping reads, not completed role decisions. | Production function volatility metadata; mock RPC/cache tests |
| URM-03 | Five scoped-role setter RPCs lacked explicit mutation classification. Successful writes therefore omitted post-commit cache/synchronization hints. | Classify only the five reviewed setters as mutations. Existing commit-only invalidation emits same-origin, same-signed-user hints; denied writes emit nothing. | Mock RPC and BroadcastChannel regression tests |
| URM-04 | Partial batch failure displayed the count of acknowledged RPCs as “changes applied,” without checking the successful prefix's authoritative persistence. | Reconcile only the acknowledged prefix with a fresh signed assignment snapshot and distinguish confirmed records from unverified outcomes; avoid blind retry guidance. | Unit regression; production batch writes untested |
| URM-05 | Historical Charter Navigator `Employee` assignments do not all have current scoped-role mappings. | No automatic role backfill. Preserve 35 unresolved mappings for separately approved intended-role review. | Production read-only aggregate counts |

## End-to-end operation coverage

| Operation | Authoritative write path | Persistence check | Effective runtime check |
| --- | --- | --- | --- |
| CRM platform role assign/revert | `apsyntra_crm_platform_role_set` | Existing `apsyntra_crm_platform_role_snapshot` readback | PENDING signed target-session allow/deny after refresh/re-login |
| Generic module assign/revoke | `apsyntra_role_manage_user_access` | Existing module assignment snapshot readback | PENDING target native/Board execution or denied action |
| Board viewer/editor assign/revoke | `apsyntra_role_manage_user_access` | Existing Board membership readback, including absence on revoke | PENDING target Board action allow/deny |
| Charter role changes | `apsyntra_role_charter_workspace_set` | Existing scoped Charter snapshot | PENDING signed native functionality; role intent unresolved for legacy group |
| Six scoped app roles | `apsyntra_role_scoped_six_set` | Scoped six-app snapshot | PENDING signed per-app allowed/denied action |
| Fund Tracker role changes | `apsyntra_role_frt_workspace_set` | Scoped FRT snapshot | PENDING native FRT workflow capability |
| Tool Traceability role changes | `apsyntra_role_tooltrace_workspace_set` | Scoped Tool Trace snapshot | PENDING domain execution |
| FuelTrans role changes | `apsyntra_role_fueltrans_workspace_set` | Scoped FuelTrans snapshot | PENDING domain execution, respecting client-managed memberships |
| Multi-user batch mutation | Existing per-account RPCs | Refreshed assignment checks, including partial prefix | PENDING nonproduction concurrency and signed targets |
| Eight staged Role Configuration proposal operations | `apsyntra_role_configuration_propose` | Exact UUID/operation/payload signed snapshot verification | NOT APPLICABLE: proposed state intentionally has no live permission effect |

Existing concurrency controls include expected `updatedAt` compare-and-set parameters for scoped edits, signed workspace verification and stale-route/session guards. A multi-account batch is **not atomic**: a partial failure requires per-operation readback and cannot certify whole-batch success. The same-user cross-tab hint cannot by itself prove a *different employee* session has recalculated access.

## Acceptance boundary

**IMPLEMENTED:** focused source/role client corrections and regression assertions.

**VERIFIED:** read-only production RPC inventory; existing persistence/schema contracts, production Charter mismatch counts; focused mock-backed behavior (subject to final CI report).

**PENDING:** genuine per-operation database mutation and readback on a disposable workspace; positive and negative signed capability execution; refresh/re-login persistence; multiple employee sessions; cross-application invalidation; concurrent edit/CAS conflict and partial-batch reconciliation; production runtime verification.

No stage is declared fully accepted based solely on UI success, a mock, an HTTP 200 acknowledgement, or a completed build.

## Next milestone

**CP-CRM-URM-INTEGRITY-02 — Disposable-Workspace Role Mutation and Readback Matrix, Signed Multi-Account Capability Execution, and Cross-Session Propagation Acceptance.**

Use nonproduction test users and existing workspace infrastructure; avoid creating a new Supabase project. Exercise each exact write/readback pair with separately authenticated target users, workspace isolation, denied actions, repeat reads after refresh/re-login and concurrent edits. Do not grant production roles or retroactively map Charter users without a separately reviewed decision.