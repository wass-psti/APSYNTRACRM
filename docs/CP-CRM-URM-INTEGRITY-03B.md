# CP-CRM-URM-INTEGRITY-03B — Effective-Role and Native-Access Reconciliation

## Verified production boundary (read-only)

- Two genuinely signed browser accounts are in **different workspaces**. They cannot establish administrator-to-employee same-workspace propagation. No browser tokens, user accounts or workspace roles were changed.
- A signed workspace-owner account's `apsyntra_crm_my_effective_access()` response reports all 12 modules allowed, yet `native_application_board_context('time-tracker')` fails with HTTP 403, SQLSTATE 42501, `Native application assignment is not active`.
- The deployed `apsyntra_crm_my_effective_access()` sets `v_is_admin := v_effective_role = 'admin'`, then synthesizes module roles for all modules when that flag is true. The deployed `has_module_access()` and `module_role_for()` make a distinct signed-module decision involving `is_platform_admin()`, scoped role assignments and explicit CRM ceilings. The native resolver relies on those existing authoritative functions. **The projection and the native role source differ; the 403 precedes Board resolution.**
- Production function definitions were inspected read-only. No live grants, role data, permissions or schema were modified.

## Candidate correction (not production activation)

`sql/cp-crm-urm-integrity-03b-projection-candidate.sql` changes *only* the four existing native application entries in the effective-access **response projection** to use `public.has_module_access()` and `public.module_role_for()` for their displayed `allowed` and `role` values. The other eight Board-linked applications and all native backend checks remain unchanged.

The candidate is guarded by exact expected current source fragments and fails on schema/source drift. It does not create any role assignments, change authorization policies, modify the native resolver or bypass HTTP 403. It is intentionally not a deployable Supabase migration. Do not run it against production without a separate activation review and authorization.

## Acceptance matrix

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing five workspace-scoped role setters: write, readback, stale revision, revoke and denial | CP-CRM-URM-INTEGRITY-03 disposable PG17 CI | VERIFIED (previous milestone) |
| Reproduce workspace owner reporting native module allowed despite backend module denial | New isolated synthetic PG17 acceptance | PENDING CI |
| After candidate, four native response entries equal authoritative signed module permission and role | New isolated synthetic PG17 acceptance | PENDING CI |
| Non-native application projection unchanged | New isolated synthetic PG17 acceptance | PENDING CI |
| Genuine employee account four-native-app signed initial read | Previous signed employee browser evidence | VERIFIED (previous milestone) |
| Genuine owner account native TimeTracker 403 | Previous signed account/read-only evidence | VERIFIED (previous milestone) |
| Same-workspace two-account runtime role-change and revocation, refresh, reopen, reauth and propagation | Requires two genuinely signed nonproduction users in same workspace and scoped reversible role fixtures | BLOCKED |
| Production activation of the projection candidate | Requires explicit separate production function-change authorization after disposable CI and review | PENDING |

## Remaining functional closeout

The candidate fixes **representation of native availability**, not the policy decision about whether a workspace owner ought to receive a native module assignment. The latter is a production authorization and role-policy question, and this work deliberately preserves existing roles and guards. Native access stays denied unless the authoritative server already allows it. Do not infer that an unavailable native Board is missing based on the module 403.

**Next implementation if blocked:** `CP-CRM-URM-INTEGRITY-03C — Controlled Effective-Access Projection Activation, Same-Workspace Two-Account Runtime Readback, and Native Capability Closeout`. First verify approved intended role semantics, then production activation separately if authorized; use independent nonproduction signed accounts for cross-user mutation and readback. No new Supabase project is required.
