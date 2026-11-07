# CP-WS-01 Lifecycle Phase H — Source compatibility and controlled activation decision

**Date:** November 7, 2026  
**Decision:** **NO-GO for production activation.** This document provides nonproduction regression evidence and a concrete list of unresolved gates; it is not permission to change live SQL, grants, roles, sessions, flags or data.

## Source provenance and scope

The single approved Supabase production project remains the existing WatchdogWorkspace instance. Read-only inspection found **63 live routines** calling `current_workspace_id`, including two delegated role resolvers (`has_module_access`, `module_role_for`). The downstream role-dependency inventory contains **54 additional direct callers**, of which 44 also call the workspace lookup. These groups overlap. The read-only source SHA-256 comparisons on November 7 matched the prior inventories (**63/63** workspace callers and **54/54** role consumers, zero drift).

Repository source:
- `sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json` — live 63-caller signatures and fingerprints, on `main`.
- G4C's 54 role-dependent fingerprints remain on its preparation branch pending separate source-faithful replay acceptance. They are evidence of source identity and the dependency surface, not behavioral certification.
- `sql/tests/cp-ws01c-g3-disposable-lookup-candidate.sql` and G4 delegated preview have passing isolated negative authorization tests. Their synthetic helpers are **not** a production authorization replacement.

## New Phase H end-to-end disposable acceptance

`sql/tests/cp-ws01-phase-h-cross-contract-hardening-disposable.sql` executes only against PostgreSQL 17 `workspace_disposable`, after the existing staged lifecycle and domain acceptance. The whole Phase H test is wrapped in a rollback-bound transaction and has no dependency on real user credentials or an email provider.

It temporarily installs a caller-bound workspace lookup preview that requires a verified, active signed GoTrue session, returns the session-selected workspace for the same actor and rejects arbitrary other user IDs. **The guard is an isolated compatibility preview, not the source-identical replay of the two deployed role-resolution routines or the entire 63-caller graph.**

Under that active guard, the test covers:

1. Multi-member user's signed catalog (two authorized memberships), correct initial current workspace, and existing board read isolation.
2. Authoritative selection to a second authorized workspace, subsequent verified current context, matching board scope and stale-revision selection denial across statements.
3. Foreign user-ID lookup denial and independence of another signed user's selected scope.
4. Synthetic recorded-owner configuration read, name/privacy update, revision CAS and audit; denied stale update and unauthorized edit of another workspace.
5. Signed selected-owner private invitation issuance with replay suppression; no direct `authenticated`/`anon` issuer EXECUTE and no email provider dispatch.
6. Expired-session selection/configuration denial and anonymous lookup/configuration denial.
7. Full transaction rollback and restoration of the original staged lookup source, no persisted synthetic workspace changes, no changes to membership counts, invitation events or config feature flags.

**Evidence markers:** `CP_WS01_PHASE_H_CROSS_CONTRACT_HARDENED_DISPOSABLE_PASS` and `CP_WS01_PHASE_H_CROSS_CONTRACT_ROLLBACK_PASS`, plus the previous lifecycle, invite, configuration, board, TimeTracker, TradeLink and domain tests. Successful CI proves the **test's coverage only**, not suitability of the source-identical live migration.

## Production readiness gates

| Gate | Current outcome |
| --- | --- |
| Dormant selection, configuration and invitation backend candidates | Implemented and previously verified in disposable PG17 |
| G3/G4 self-scope, delegated-manager and denial previews | Verified in disposable PG17 |
| Phase H signed selection + configuration + invitation + board integration under temporary guard | Verified in disposable PG17, when its workflow succeeds |
| Existing production source fingerprint integrity | Verified 63/63 and 54/54 (read only) |
| **Source-identical protected replay of `has_module_access` and `module_role_for`** | **PENDING / previously blocked by repository tool safety gate** |
| **Source-faithful dependent-module runtime checks with hardening active** | **PENDING — not proven by the Phase H preview** |
| Genuine independent existing-user signed HTTPS foreign-workspace denial | BLOCKED pending independently controlled session |
| Source/ACL/ownership faithful reversible production migration bundle | PENDING security review |
| Trusted email provider configuration, deployment and delivery acceptance | PENDING; no provider message sent |
| Production SQL installation, grants, feature flags or workspace switching | **NOT AUTHORIZED / NOT ACTIVATED** |

## Required controlled production sequence (approval separately required)

1. Resolve the G4C source-replay safety restriction through approved review rather than bypass. Reconcile source hashes and authorization boundaries for both delegated role routines and all affected board/module callers, preserving legitimate same-workspace administrator operations while rejecting ordinary cross-user introspection.
2. Execute the **source-faithful** migration candidate against a disposable PostgreSQL 17 environment with the patched lookup installed throughout real caller regression. Prove positive and denied actions, RLS, session expiry/revocation, stale CAS, concurrency and complete rollback.
3. Capture current production function definitions, owners, ACLs, dependent policies and versioned schema state in secured rollback materials (not a public repo); compare current hashes with the reviewed baseline. Obtain restore/backup evidence.
4. Arrange separate express authorization for any live migration, grants, activation flags, trusted provider deployment or production-role changes; do not infer authorization from green CI or prior frontend work.
5. When approved, stage the smallest reversible production change under explicit preflight predicates, assert exact postconditions and roll back before commit on failure. Independently establish existing-user signed HTTPS acceptance. Never generate fake test accounts or invalidate active sessions to manufacture an acceptance result.

**Closure classification:** Phase H adds integrated disposable acceptance; **final security compatibility and controlled production activation remain BLOCKED**. Overall completion percentage is indeterminate until the source-faithful and genuine signed-user gates are resolved.
