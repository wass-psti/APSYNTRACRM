# Material Request Hub — Remove Redundant Frontend Authorization Friction

Date: November 11, 2026. Applies only to the signed Material Request Hub frontend.

## User-facing improvement
- Engineering-only Verify signed sourcing readiness action and its outdated production-write / role-denial checkpoint display are removed from the normal Material Tracker and Board items toolbar.
- The non-mutating readiness inspection remains an exported engineering function and its unit tests remain. It is not a prerequisite for normal use.
- Material creation, Details, Tasks, Activity, and existing board views remain available according to current permissions.

## Request lifecycle optimization
- Prior task and protected-field requests performed complete client-side signed-user, context, board-permission and domain-role checks both before and after the server RPC.
- Each request now performs the complete signed preflight once before the RPC. After the response, focused revalidation confirms the original verified user, live session, active profile and unchanged workspace.
- Server RPCs remain the authoritative enforcement point for board/item scope, module ADMIN, and edit permission. No database authorization, EXECUTE grants or field-access policies have changed.
- Task revision CAS, audit, foreign-item isolation and commercial data privacy remain intact.

## Verification
- New regression coverage: 7/7 PASS for single role preflight, session revocation after RPC, workspace switching, non-ADMIN denial, revision preservation, and routine diagnostic removal.
- Full frontend suite: 1,605/1,605 PASS.
- CSS bundle verification PASS.

## Scope limits
This does not change role assignments, grant employee access to private commercial information, or refactor unrelated application modules. No production data, Supabase roles, schema, or policies were changed.
