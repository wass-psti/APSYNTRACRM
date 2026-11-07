# CP-WS-01 Lifecycle Phase H2 — Delegated authorization and source compatibility

**Date:** November 7, 2026  
**Decision:** **NONPRODUCTION PROGRESS VERIFIED; PRODUCTION ACTIVATION NO-GO.**

## Evidence baseline

The public repository contains only fingerprinted function metadata, not the legacy SQL security implementation. The latest read-only production catalog verification reported:

| Source boundary | Live source count | Fingerprint result |
| --- | ---: | --- |
| `current_workspace_id` direct callers | 63 | 63/63 matched existing G4B inventory |
| `has_module_access` / `module_role_for` direct downstream consumers | 54 | 54/54 matched existing G4C inventory |
| Intersecting source definitions | 44 | 44 shared hashes matched |
| **Unique routines in the audited union** | **73** | **0 observed source drift** |

A source fingerprint is a **source identity/compatibility preflight**, not evidence that a security function or all its callers will run safely after a migration. The 54-role manifest and `scripts/ws01c-g4c-verify-dependents.mjs` are now CI inputs; the latter enforces uniqueness, two role source hashes, exact overlap hashes, and role-caller category counts.

## Executable isolated authorization preview

`sql/tests/cp-ws01-phase-h2-scoped-delegation-disposable.sql` is invoked from the existing `sql/tests/cp-ws01-phase-h-cross-contract-hardening-disposable.sql`, **inside** its single PostgreSQL 17 `workspace_disposable` transaction. The session-choice guard from Phase H remains installed for the whole H2 preview. It uses synthetic fixture identities and rolls back all functions, role data, claims and state.

The H2 private scope helper authorizes the verified signed actor's selected workspace; cross-user inspection requires a server-recorded owner relation on that **selected** workspace plus active target membership and profile. Its public test wrapper returns only scoped role information.

Acceptance includes:
- Valid owner self-role, selected-workspace delegated member and nonowner self-role.
- Denial of foreign workspace target and same-workspace nonowner inspection of another member.
- Denial of a borrowed GoTrue session, anonymous role inspection and direct client access to the privileged helper.
- Current workspace, authorized selection, read-only board scoping, stale CAS, owner configuration, invitation authorization, expiry and complete rollback preserved by Phase H.

**Explicit limitation:** The H2 helper is a deliberately minimal **authorization contract preview**. It is NOT a source-faithful copy or replacement of the live `has_module_access` and `module_role_for` SQL bodies. Existing full module and role suites pass in the surrounding disposable workflow **before** the temporary H2 guard, not against all 73 patched source-identical functions. Never classify the 73 as full hardened-runtime acceptance.

## Outstanding gates

1. **Source-faithful role resolution:** A security-reviewed execution environment must stage exactly reviewed definitions of both production delegated role helpers, protecting the source bundle outside the public repository. Reconcile their live function hashes, signatures, ownership, `SECURITY DEFINER` privileges, search path and ACLs, and authorize legitimate server-side role-management delegation. The earlier attempt to publish source-derived SQL to the public repository was blocked; do not circumvent that control.
2. **Full 73-routine regression under the patched lookup:** Recompile/execute affected real caller definitions with the hardened authoritative session lookup active throughout. Include positive authorization, foreign/other-user/anon/expired/revoked denial, RLS, cross-workspace boards/modules, TimeTracker and TradeLink, configuration CAS, invitation idempotency, concurrency and rollback. A metadata validator or wrapper cannot substitute.
3. **Genuine HTTP acceptance:** The deployed Security tab exposes a read-only two-session foreign-workspace table RLS workflow, but at the last observation no authorized row reference had been captured. A genuinely distinct existing signed user in a different workspace is required for an independent negative HTTPS result. No user impersonation, credential export, synthetic identity or forced sign-out.
4. **Reversible production change:** Capture live source/owner/ACL/policy/extension versions and backup/restore guarantees in an access-controlled rollback bundle; reconcile 73 fingerprints at activation time; approve scoped SQL, grants, feature flags and trusted backend separately.
5. **Trusted invitation delivery:** The provider requires protected server-only credentials, authorized delivery logs and retries, and genuine signed recipient acceptance. No live mail is sent by Phase H2.

**Activation authorization:** None. No production SQL, membership, role, session, invitation, configuration, switching flag or provider configuration changes are permitted under this Phase H2 test-only approval.

## Classification

- **VERIFIED:** 73-function metadata provenance; H2 role-boundary disposable preview after independent CI success; prior Phase H lifecycle integration.
- **PENDING:** Source-identical delegated role-function execution and full 73-caller runtime test with hardened lookup installed.
- **BLOCKED:** Independent second-user signed HTTPS denial in absence of a second live session and a captured authorized row.
- **NOT ACTIVATED:** Production database hardening, workspace switching, configuration RPCs and trusted invitation delivery.

Overall production readiness is **indeterminate** until security and deployment acceptance gates are closed.
