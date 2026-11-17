# CP-URM-SIDEBAR-NATIVE-01 — Role-Synchronized Administration and Native Navigation

## Production symptom and root causes

Following the Monday-inspired UI shell integration, CRM role assignments correctly
exposed the assigned boards, but the sidebar presented only Dashboard, a heading
for Administration, and the board list. The host still rendered signed native
application and administration links; the separate presentation layer in
frontend/monday-inspired-ui.js removed every primary link except Overview.
This visual-only removal suppressed authorized controls after every render.

Separately, workspace-specific CRM role changes do not change the inherited
profiles.platform_role identity. The signed CRM role presentation was refreshed,
but the adminVerified capability flag could remain stale after reassignment until
an unrelated sensitive/profile-role refresh. That caused administration controls
to be hidden despite an authoritative new CRM Admin role.

## Implementation

- Preserve all host-generated navigation links in the Monday-inspired sidebar
  presenter. Rename Overview to Dashboard without removing sibling links or
  Administration/Account section labels.
- Keep existing registered standalone routes: FM1, TimeTracker, Fund Tracker,
  FuelTrack+, and TradeLink.
- Add the board-backed native application modules listed in BOARD_MODULES
  to the Applications section only when the current signed board catalog
  contains a matching accessible board. Do not fabricate missing applications,
  bypass board access checks, or replace their existing host routes.
- Retain all existing authorized board navigation, board count, and
  workspace-specific role assignments.
- Revalidate the existing server-side admin verification RPC only when the
  authoritative signed effective CRM tier actually changes. Handle role
  downgrade by hiding Administration and leaving an unauthorized management
  route, without changing permissions.
- Recheck signed CRM role on focus/visibility/cross-tab reconciliation with
  a bounded 10-second minimum to avoid unbounded PostgREST retry load.
  Ordinary board polls retain the existing role-cache interval.
- Preserve bootstrap-only diagnostics, real TimeTracker authorization, and
  all server-side workspace guards.

## Acceptance

- Unit/source tests validate registration from the signed board catalog,
  12-module blueprint, conditional admin links, no presentation pruning,
  identity/workspace revalidation, bounded role refresh, and existing routes.
- Isolated genuine Chromium visual DOM fixture verifies that navigation
  survives the presentation layer and subsequent host re-render; after host
  revocation removes administration links, the presenter does not recreate them.
- Full frontend regression, production build, changed-source lint and
  GitHub CI are required before merged delivery.
- Live signed-browser readback must confirm the deployed navigation for the
  authenticated role. Actual production role writes are not part of this fix.

## Boundaries

No Supabase migration, production role change, board mutation, grants, RLS
changes, credential changes, or new authentication framework.
