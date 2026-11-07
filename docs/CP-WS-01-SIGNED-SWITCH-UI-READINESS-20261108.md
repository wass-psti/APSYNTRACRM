# CP-WS-01 — Signed Workspace Switching UI and Configuration Activation Readiness

**Date:** 2026-11-08 (Asia/Manila)

**Scope:** Workspace details dialog for an authorized, non-active workspace, as shown in the supplied UI reference.

## Implementation

The existing workspace selection lifecycle (`WorkspaceLifecycleClient.select`) already checks the live GoTrue user and workspace context, invokes the typed `wm_ws01_select` RPC with the expected current workspace (CAS), validates its receipt, and reads the authoritative server context again. The workspace details dialog now has a **default-off** selection UI handoff to this lifecycle. No duplicate backend contract or client-side workspace preference was introduced.

The handoff:

1. Requires the deployed `WS01_SWITCHING_ENABLED` gate, a member row from signed discovery, lifecycle `discover` and `select` functions, and an application reload callback.
2. Rechecks the server-signed membership catalog immediately before invoking the selection RPC. The current and target IDs must both appear as expected, with one active workspace and the target inactive.
3. Disables the button on the first click and prevents repeated requests. On errors, shows a bounded user-readable message without leaking server responses, identifiers, credentials, or SQL.
4. Accepts only the typed server receipt with the expected target, previous workspace, and `switched=true`. The typed lifecycle additionally requires an authoritative context read showing the new workspace and unchanged user.
5. Navigates to Overview and reloads the application **only after** a verified switch. Reloading clears all in-memory board, role, module and workspace-specific state rather than trusting stale scopes.
6. Does not retry after an uncertain result. The user must reload and recheck signed scope.

The live UI remains unchanged while `WS01_SWITCHING_ENABLED=false`: the nonactive workspace still states that switching is unavailable. The signed owner configuration dialog continues to validate drafts without saving while `WS01_CONFIGURATION_ENABLED=false`.

## Production activation boundary

**Do not change production flags, role grants or RPC definitions under this UI implementation.** The latest read-only live database inventory confirms `selection_enabled=false`, with `wm_ws01_select`, `wm_ws01_config_read` and `wm_ws01_config_update` absent. The existing session-cutover and configuration SQL are *dormant candidates* tested in disposable PostgreSQL, not deployed production authorization.

Before activation, the separately authorized security change must complete the outstanding CP-WS-01 H3 source-faithful role/lookup dependency review, protect delegated user operations across the 73 affected routines, validate genuine signed cross-workspace denial (independent existing users), verify single-session persistence, concurrent CAS, expired/revoked session and membership denials, and install a reversible audited backend contract. Supabase `SECURITY DEFINER` routines must retain pinned search paths, least-privilege EXECUTE grants, session validation and workspace isolation.

Owner configuration requires its distinct reviewed read/update functions, server-supplied revision checks, owner permissions and verified persistence. Showing the Configuration button does not imply a successful database update.

## Tests

`frontend/tests/workspace-switch-handoff.test.mjs` covers the production default-off state, positive signed discovery-to-select order in an isolated mock, invalid/stale/foreign membership, unexpected receipts, missing prerequisites and server denial. The existing workspace UI and lifecycle tests remain in place. Full frontend and PostgreSQL disposable CI should pass before merge. Test-only mocked receipts do **not** establish genuine signed HTTPS acceptance.

**Decision:** Frontend switch handoff implemented and gated. **Production switching and configuration remain NOT ACTIVATED.** No production data, memberships, roles, sessions, RLS, permissions or audit records were modified by this PR.
