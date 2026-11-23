# CP-NATIVE-APP-AUTOSYNC-02 — Signed snapshot application discovery

## Evidence and contract

The existing `apsyntra_role_user_management_snapshot(p_workspace_id)` returns a `modules` array, alongside `moduleAssignments`. The currently installed migration source constructs that list from twelve explicit module identifiers, so **it is not an independently extensible registration registry**. The separate `native_application_board_catalog()` also enumerates four canonical boards and requires signed module access, so it cannot serve as the complete administrator assignment catalog.

The frontend now uses the signed snapshot's `modules` as its displayed list for Native Application Access. The static `BOARD_MODULES` blueprint remains unchanged for other views and the existing module role vocabularies and write RPCs remain unchanged. The UI lists unsupported newly reported module identifiers without enabling assignment, rather than silently granting privileges.

## Modified components

- `frontend/native-application-catalog.js`: normalize the signed module identifiers, preserve ID/name association and deduplicate.
- `frontend/user-role-management.js`: share snapshot-driven options across Native Application Access individual and bulk workflows, count and results; expose explicit refresh.
- `frontend/app.js`: reject late snapshots after session/workspace change; revalidate on window focus with a 60-second throttle and no continuous polling.
- `frontend/tests/cp-native-app-autosync-02.test.mjs`: synthetic discovery, deduplication, rename and rendering coverage.
- `frontend/tests/role-configuration-experience.test.mjs`: update test fixture to use the actual signed module list contract.

## Verification

Local full frontend suite: 3,315 tests passed, zero failed. Vite build passed (with existing chunk-size warnings). JavaScript syntax and diff checks passed.

## Pending production acceptance

1. Confirm an authoritative, extensible **application registration** API; the current snapshot's SQL still uses a static list.
2. Ensure registry changes are reflected by the signed snapshot without editing frontend/SQL lists.
3. Define or reuse each new application's assignment role contract; do not infer roles from display metadata.
4. Run genuine two-session signed nonproduction acceptance for register, rename, deactivate, remove, individual/bulk writes and readback, and reconnection.
5. Submit through required review/CI/deployment workflow. No production data or permissions were changed in this phase.
