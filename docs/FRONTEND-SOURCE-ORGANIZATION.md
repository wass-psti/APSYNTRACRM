# APSYNTRA CRM — source organization by feature

> **Status:** first compatibility-preserving refactor, not the completion of the entire repository reorganization.

## Ownership and intended layout

| Feature | Canonical location | Notes |
|---|---|---|
| TimeTracker | `frontend/apps/TimeTracker/` | Attendance, clocks, GPS, policies, reports |
| Fund Tracker | `frontend/apps/FundTracker/` | Finance requests, approvals, native UI |
| TradeLink | `frontend/apps/TradeLink/` | Documents, drafts, workflow, routes |
| FuelTrack+ | `frontend/apps/FuelTrack/` | Requests, analytics, approvals |
| FuelTrans | `frontend/fueltrans/` | **Existing** dedicated feature folder |
| FM1 Ticketing | `frontend/fm1/` | **Existing** dedicated feature folder |
| Boards | `frontend/board/` | **Existing** generic board infrastructure; never mix application-specific board projections |
| Authentication | `frontend/auth/` | **Existing** authentication folder |
| Workspace | `frontend/Workspace/` (later) | Lifecycle, members, invitations |
| Dashboard | `frontend/Dashboard/` (later) | Overview, navigation, presentation |
| Shared | `frontend/` until ownership review | Shell, API, authorization, sync, shared components |

Do not reorganize SQL migration history, deployment scripts, Edge Functions or generated CSS/PDF assets merely because their names mention an application. Paths are part of the delivery and test contracts.

## Implemented in this first PR

Canonical implementations were moved (not duplicated) to application folders. Legacy entry files now contain only a documented `export *` compatibility re-export:

- `frontend/time-tracker-application.js` → `frontend/apps/TimeTracker/time-tracker-application.js`
- `frontend/time-tracker-policy.js` → `frontend/apps/TimeTracker/time-tracker-policy.js`
- `frontend/time-tracker-pending-recovery.js` → `frontend/apps/TimeTracker/time-tracker-pending-recovery.js`
- `frontend/fund-tracker-application.js` → `frontend/apps/FundTracker/fund-tracker-application.js`
- `frontend/tradelink-application-route.js` → `frontend/apps/TradeLink/tradelink-application-route.js`
- `frontend/fueltrack-v3-application-route.js` → `frontend/apps/FuelTrack/fueltrack-v3-application-route.js`

All existing imports retain their paths and exported object identities. New code should import from the canonical application module; change the new files rather than editing compatibility wrappers.

## Formatting convention

Use the already-installed Prettier developer dependency on **one feature at a time**:

```powershell
npx prettier --write frontend/apps/TimeTracker
npx prettier --check frontend/apps/TimeTracker
```

Run formatting in a separate commit from file relocation. Formatting the 749-file frontend in a single commit would hide security-sensitive functional changes among large whitespace diffs. Avoid formatting generated bundles or historical Supabase migrations.

## Required checks after each migration batch

1. Run `npm test`, including `frontend/tests/feature-module-boundaries.test.mjs`.
2. Run `npm run build` and verify bundling, source references, CSP, routes and deployed paths.
3. When migrating CSS, update `scripts/priority5-style-manifest.mjs`, `index.html` source provenance and regenerate `frontend/apsyntra-styles.bundle.css`.
4. Preserve the existing signed session, RLS, workspace authorization and backend API boundaries.
5. Inspect tests which assert the *source text* of a former root file; migrate those expectations without weakening their security guarantees.

## Remaining work

This is the **first slice**, not a blanket rename. Migrate each application's remaining domain, presentation and service modules in independent reviewed PRs. Keep existing `frontend/board/`, `frontend/fm1/`, `frontend/fueltrans/` and `frontend/auth/` in place until all importers, tests and delivery manifests are accounted for.
