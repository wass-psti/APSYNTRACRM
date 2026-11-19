# CP-NATIVE-APP-ACCESS-01 — Native Application Resolution

**Date:** 2026-11-19
**Status:** Backend migration applied; frontend implementation and regression acceptance complete; release pending pull-request integration.
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** Existing project `jtlusodorfnyzgyuewkz`

## Objective

Allow an active workspace member with an existing enabled application assignment to initialize the corresponding native application without making generic Work Management board discovery or generic board-view permission a prerequisite.

The implementation covers TimeTracker, Fund Tracker, FuelTrack+ and TradeLink. It uses the existing canonical board records; it does not create replacement boards.

## Canonical application mapping

| Module ID | Canonical board | Board ID |
|---|---|---|
| `time-tracker` | TimeTracker Attendance | `46bf4ee7-368a-4c35-842c-8593ea1f6ac3` |
| `fund-released-tracker` | Fund Released Tracker | `f36da8fe-8d9d-4629-9938-12533cb3ca39` |
| `fueltrack-plus` | FuelTrack+ v3 | `7af78b3f-67bf-4600-9aa1-9006d19d486e` |
| `tradelink` | TradeLink | `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` |

## Implementation

### Shared resolver

Migration `20261119024303_cp_native_app_access_01.sql` adds:

- `private.native_application_board_context(text)`
- `public.native_application_board_context(text)`

The resolver validates the signed user, active profile, current workspace, active workspace membership, existing module assignment and effective module role. It resolves the exact canonical board ID, workspace, name, marker and active state. It never searches by a potentially duplicated board name.

The response contains only the canonical board shell. TradeLink additionally receives its existing group and column schema because its native setup and document projection need that metadata. Generic board items, values and membership records are not returned by this resolver.

### Frontend route and data client

- `frontend/native-application-access.js` owns the canonical registry, context normalization and exact route-to-module mapping.
- `DomainApi.nativeApplicationBoardContext()` obtains the signed workspace context and the native resolver response as read operations.
- Native routes pass the resolved context into `loadBoard()`; they do not require `wm_list_boards()`, a generic board snapshot, or generic board-view permission.
- Generic board routes continue to use the existing generic board access path.
- The generic board realtime channel is stopped for native-only routes to prevent stale generic board subscriptions.

### Application-specific changes

**TimeTracker**
- Native initialization uses the shared resolver and the existing TimeTracker module role.
- The overtime scope function retains its live signed-session, workspace, module-role and canonical-board checks.
- Generic board-view membership is no longer required for native overtime operations.

**Fund Tracker**
- Native board resolution uses the shared resolver.
- Existing FRT role, signed-session, company, request and workflow functions remain the authoritative domain path.

**FuelTrack+**
- Native initialization uses the shared resolver.
- `fueltrack_v3_guard` retains the existing module-role and canonical-board checks while removing the generic board-view prerequisite.
- Receipt upload remains Admin-only and retains its path, MIME, size, request-state and duplicate checks.
- A path-specific receipt-read policy permits the request owner or FuelTrack Admin to read an existing receipt. Other Work Management file policies are unchanged.

**TradeLink**
- Assigned-review sessions use the native resolver rather than a generic board snapshot and view check.
- Assigned-document reads continue through the existing assignment-aware domain functions.
- A single-document board projection returns only the assigned document's canonical board/item metadata.
- Application activity uses a bounded, read-only application-scoped RPC.
- Existing board-manager checks for document management operations remain unchanged.

## Permission and data boundaries

This implementation does not:

- Modify `work_board_access()` or `wm_list_boards()`.
- Change generic board role semantics.
- Change application assignments or application role values.
- Add workspace members, board members, editors or owners.
- Create boards or change canonical board IDs.
- Change the Supabase project, authentication provider or workspace-selection model.

The separately approved CP-CRM-CONN-03A viewer-provisioning migration remains an independent deployment. It provisions only its provenance-tracked viewer rows for eligible existing application assignments. CP-NATIVE-APP-ACCESS-01 neither creates nor removes those rows and does not depend on them for native resolution.

## Verification evidence

### Production database

- The migration was applied to the existing Supabase project and recorded as version `20261119024303`.
- Signed-user execution verified native context resolution for all four modules.
- TimeTracker attendance capability and overtime snapshot RPCs executed successfully.
- Fund Tracker request-list RPC executed successfully with the existing REQUESTOR role.
- FuelTrack+ read RPC and native guard executed successfully.
- TradeLink assigned-document and activity RPCs executed successfully.
- A disabled profile with a legacy enabled assignment was denied native resolution.
- The TradeLink single-document projection returned the canonical board and matching document item for an existing assigned document.
- Supabase security/performance advisors reported no new findings matching the functions or policy introduced by this migration.

### Frontend

- Full frontend regression: **2,770 / 2,770 passed**.
- `npm run check`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; existing Vite chunk/startup warnings remain.
- `npm run test:time-tracker:e2e`: PASS.
- `git diff --check`: PASS.
- New tests cover canonical mapping, context identity/workspace validation, schema projection, native route wiring, reviewer access without generic board view, and migration invariants.

## Release state

The production database migration is applied. The frontend changes are not yet deployed to GitHub Pages. Release remains pending PR integration, required repository checks and post-deployment signed-user acceptance for each native application.
