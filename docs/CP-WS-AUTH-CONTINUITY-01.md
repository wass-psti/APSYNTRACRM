# CP-WS-AUTH-CONTINUITY-01 — Workspace Persistence and Authentication Continuity

## Status

Implementation and local acceptance are complete on branch `cp-ws-auth-continuity-01`. Production deployment is not claimed; the branch still requires the repository's normal integration and release path.

## Architecture

- The application retains its `AuthClient` API. Browser sessions are managed by the pinned `@supabase/auth-js` `GoTrueClient` (2.119.2), bundled into `frontend/vendor/supabase-auth.js` so GitHub Pages loads a same-origin module without a new runtime CDN dependency.
- Browser auth uses the provider's persistent `localStorage` storage, automatic refresh lifecycle, and built-in cross-tab auth notifications. `detectSessionInUrl` remains disabled because the application already handles confirmation and recovery URLs explicitly.
- Existing `sessionStorage` sessions are imported through `GoTrueClient.setSession`, which verifies the user against Supabase Auth before the new provider session is accepted. Network failures preserve the old recoverable session. A small migration marker prevents an old tab-scoped session from reappearing after an explicit sign-out.
- Workspace preference uses `apsyntra.crm.workspace.preference.v1:{userId}` in `localStorage`. Its value is only a workspace UUID. Preferences are not removed on logout and remain isolated per user.
- Workspace restoration reuses `WorkspaceLifecycleClient.discover()` and `select()` and accepts only the existing signed-member catalog and authoritative selection receipt. Ambiguous selection results receive one context readback; the write is never automatically retried.
- Cross-window workspace storage events are treated as hints. The receiving tab refreshes the signed context and changes its route only if the server confirms the event's workspace.

## Initialization order

1. Restore the provider-managed session.
2. Verify the authenticated user.
3. Read the account-specific workspace preference.
4. Discover signed workspace membership and restore the saved workspace when available.
5. Load the authoritative workspace context and its boards.
6. Reconcile later cross-window auth and workspace events without duplicate boot loops.

The same workspace restoration step runs after a successful password sign-in and before board initialization.

## Compatibility and boundaries

- No database migration, new preference table, new Supabase project, role change, permission change, or authorization-policy change was introduced.
- Existing REST/RPC APIs and the `AuthClient` methods remain available to application modules.
- Explicit workspace switching retains its existing full reload because the current flow relies on a complete workspace-scoped state reset. Both the standard switch action and the post-creation “Open new workspace” action pass the authoritative selection receipt to the preference writer. Cross-window updates reconcile in place.
- Workspace preference is per browser profile, not cross-device roaming. Cross-device preference would require a separate server-side user preference and is outside this scope.
- The auth migration marker is a non-sensitive browser migration flag; it contains no credentials or user profile data.
- No model-training, gradient-descent, backpropagation, retraining, or parameter-update code or dependencies were introduced.

## Verification

- Provider unit tests cover sign-in persistence, new-client restoration, refresh-token rotation, legacy session migration, temporary verification outages, explicit sign-out, and stale legacy-session retirement.
- Workspace preference tests cover per-account isolation, invalid identifiers, blocked storage, storage-event synchronization, signed discovery, authoritative selection, unavailable saved workspaces, ambiguous write readback, and account changes during discovery.
- Browser acceptance uses isolated persistent Chromium profiles and synthetic Auth API responses; it does not modify production users or workspace records. It verifies cross-window sign-in, cross-window sign-out, workspace preference events, page reload restoration, and browser-profile restart restoration.
- `scripts/verify-pages-source.mjs` verifies the static Pages asset graph, HTTPS Supabase endpoint, CSP and public client key.

## Operational note

This change is implemented and tested locally. It is not considered deployed until the branch is integrated through the repository's normal CI and release process.
