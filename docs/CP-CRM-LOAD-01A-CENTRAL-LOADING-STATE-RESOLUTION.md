# CP-CRM-LOAD-01A — Central Loading-State Resolution

## Outcome

Introduced one scope-aware loading-state decision before the main render path can replace or tear down an existing application shell.

## Behavior

- **Ready:** no blocking read is pending; render the current application state normally.
- **Retain shell:** a blocking read is pending, an existing shell is mounted, the signed-in identity and workspace exactly match the shell scope, and no workspace transition is active. The renderer leaves the DOM untouched.
- **Show loader:** no mounted shell exists, the user is signed out, identity/workspace scope differs, scope data is incomplete, or a workspace transition is active. Existing cold-start and scope-transition loading behavior remains in place.

The central read inventory includes initial account-role readiness, application-route reads, board reads, native initial reads, TimeTracker attendance reads, Fund Tracker finance reads, FuelTrack+ backend reads, TalkBox initial reads, and TradeLink first-page reads.

## Preserved behavior

- Existing session restoration and server-authoritative access checks are unchanged.
- Existing board/native read APIs, cache behavior, realtime synchronization, polling, mutations, and data contracts are unchanged.
- No schema, migration, RLS, role, permission, or authorization changes.
- No artificial progress, timeout, or delay was introduced.
- A user/workspace change cannot retain the prior scope's mounted shell.

## Verification

The focused test file `frontend/tests/cp-crm-load-01a.test.mjs` covers the resolver's ready, cold-start, same-scope, signed-out, identity-change, workspace-change, incomplete-scope, and workspace-transition outcomes. It also verifies that the central guard executes before render teardown.

## Deferred checkpoints

- **01B:** background refresh and state/data retention.
- **01C:** native application integration and app-specific loading behavior.
- **01D:** navigation and targeted in-place rendering.
- **01E:** cross-application, responsive, and runtime acceptance.
