# CP-APP-LOAD-02 — Lightweight TimeTracker Retrieval

## Objective

Make the TimeTracker Clock screen retrieve only the signed employee's attendance data and the supporting data needed by Clock. Preserve the existing full retrieval path for Employees, Overview, Log, Reports, Calendar, OT, My Hours, Team, Monitor and GPS.

## Verified baseline defect

The prior `clockOnly` option skipped the OT snapshot RPC, but it still:

- Read `list_module_directory` before every Clock snapshot.
- Read the complete `list_module_state` result, including unrelated TimeTracker state rows.
- Built the full Overview and Log projections.
- Parsed and projected OT rows from the complete state result.
- Repeated the directory read on Clock refresh and clock mutation reconciliation.

The route also needed an explicit exception for global-search record navigation: an Attendance session or Overtime request must load the full snapshot even when the initial TimeTracker view is Clock.

The prior recorded production baseline was approximately 340 ms mean / 407 ms P95 for `list_module_directory` and 504 ms mean / 626 ms P95 for `list_module_state`. These historical values were not remeasured during this implementation.

## Implementation

### 1. Clock-only access context

`TimeTrackerNativeClient.access()` now accepts `includeDirectory`.

When Clock-only mode is selected:

- It uses the already verified native TimeTracker context's module role.
- It validates that role against the existing TimeTracker role set.
- It skips `list_module_directory`.
- It retains the existing signed identity and workspace recheck.
- It does not construct the optional employee or team directory projections.

Full views continue to load and validate the existing directory.

### 2. Dedicated attendance projection RPC

Added `public.timetracker_clock_snapshot(uuid)` with its implementation in the non-exposed `private` schema.

The public wrapper is SECURITY INVOKER. The private implementation is SECURITY DEFINER with an empty search path and uses the existing `public.timetracker_ot_require_scope(uuid)` and `public.module_state_visible_value(...)` helpers.

The function:

- Uses the existing signed session, active workspace, module-role and canonical TimeTracker board scope.
- Reads only `timetracker.attendance.v1` in the shared scope.
- Returns only rows whose `ownerId` matches the current signed actor.
- Removes `clockIn.geo` and `clockOut.geo`, which the Clock view does not consume.
- Preserves the attendance revision and updated timestamp.
- Returns a stable empty revision-0 response when the attendance state row does not exist.
- Does not return the employee directory, OT state, backup state, or GPS payload.

No existing role assignments, RLS policies, module access rules, schema privileges, or function grants were changed. The public wrapper is SECURITY INVOKER and calls the private implementation through the existing schema boundary: authenticated already has private-schema USAGE, while anon does not. The private implementation calls the existing TimeTracker scope helper and returns only the signed actor own Clock projection.

### 3. Client retrieval and staged rollout

Clock-only snapshots call `timetracker_clock_snapshot` instead of `list_module_state`.

Only a genuinely missing function (`PGRST202` / function-not-found) triggers the legacy `list_module_state` fallback. Permission, identity, workspace, schema and data errors do not fall back.

Clock-only mode skips:

- Employee directory retrieval.
- Full state retrieval when the new RPC is deployed.
- Overview and Log projections.
- OT state projection and OT snapshot retrieval.
- Department catalog and employee-department directory retrieval.
- OJT administrator projections.

Clock still retrieves its required supporting data:

- Automatic clock-out snapshot.
- Signed attendance write capability.
- Signed employee department.
- Existing OJT roster only for the designated shared OJT account.

### 4. Navigation and mutation compatibility

The initial Clock route and background refresh use the lightweight mode. Clock mutation reconciliation already requests a Clock-only snapshot and now benefits from the same path.

A matching global-search selection for an Attendance session or Overtime request forces the full snapshot so the selected record remains available. Switching to another TimeTracker view continues to load the full snapshot.

The clock-in/out write RPCs, fresh foreground GPS acquisition, automatic clock-out workflow, attendance revision checks, duplicate-session handling, and persisted attendance state were not changed.

## Files changed

- `frontend/app.js`
- `frontend/data.js`
- `frontend/time-tracker-native.js`
- `frontend/tests/time-tracker-native.test.mjs`
- `frontend/tests/time-tracker-map.test.mjs`
- `supabase/migrations/20261124180000_cp_app_load_02_lightweight_timetracker_retrieval.sql`
- `supabase/migration-source-manifest.json`
- `sql/tests/cp-app-load-02-disposable-setup.sql`
- `sql/tests/cp-app-load-02-disposable-acceptance.sql`
- `.github/workflows/cp-app-load-02.yml`

## Verification

### Frontend

- Targeted TimeTracker, GPS, Clock recovery, map, native-access and Clock feedback regression suite: 77 passed, 0 failed.
- Full repository test suite: 3,708 passed, 0 failed.
- Repository syntax/check: PASS.
- Repository lint and changed-file ESLint: PASS.
- Repository formatting check: PASS.
- Production Vite build: PASS (existing large-chunk warning remains).
- Migration source manifest: 222 recovered baseline and 98 forward migration files verified by SHA-256.

### Disposable PostgreSQL 17 acceptance

Applied the fixture and candidate migration to an isolated, temporary PostgreSQL 17 container.

Verified:

- Existing authenticated private-schema access permits the signed application path.
- Anonymous callers cannot enter the private schema through the public SECURITY INVOKER wrapper.
- Public wrapper SECURITY INVOKER and private implementation SECURITY DEFINER.
- Current signed session and existing TimeTracker scope checks.
- Correct actor, workspace and board binding.
- Actor A receives only 20 of 1,000 records.
- Actor B receives only their 980 records.
- GPS removed from Clock payload.
- Active attendance session preserved.
- OT and backup rows excluded.
- Foreign-workspace, unassigned-user and expired-session denial.
- Stable empty-state response.

Synthetic payload measurement for 1,000 records:

| Payload                                |   Bytes |
| -------------------------------------- | ------: |
| Full attendance state                  | 410,798 |
| Clock projection (20 actor-owned rows) |   4,810 |
| Reduction                              |  98.83% |

This is a deterministic disposable fixture result, not a production payload or latency measurement.

### Production activation and current status

The migration was deployed to the existing APSYNTRA Supabase project using an isolated official-CLI workdir. The dry-run showed exactly one migration (20261124180000); the separate pending 20261124193000_cp_tt_default_server_auto_clockout_9h.sql was excluded.

Production post-deployment verification confirmed:

- Migration version 20261124180000 is recorded in supabase_migrations.schema_migrations.
- public.timetracker_clock_snapshot(uuid) exists.
- private.timetracker_clock_snapshot(uuid) exists.
- Public wrapper is SECURITY INVOKER and private implementation is SECURITY DEFINER.
- Both functions are VOLATILE, preserving the current signed-session expiry check.
- Authenticated has existing private-schema USAGE; anon does not.
- Authenticated still has no direct SELECT privilege on module_state_entries.
- An anonymous invocation was denied at the existing private-schema boundary.
- No production attendance rows, roles, grants, schema privileges or RLS policies were changed.

The eight previously applied remote migration sources missing from the local repository were fetched from the production migration history and restored to the forward migration manifest. All 319 applied remote versions now have matching local source files. The only remaining local pending migration is the separate 20261124193000_cp_tt_default_server_auto_clockout_9h.sql; it was not deployed as part of CP-APP-LOAD-02.

The new database RPC is live. The GitHub Pages frontend has not yet been updated with the client retrieval changes. Until that frontend release is deployed, users continue to use the existing retrieval path. The new Clock projection becomes active when the frontend release is published.

Production signed-browser acceptance, P50/P95 retrieval timing, request-count comparison and Supabase CPU comparison remain pending the frontend deployment. The 98.83% payload reduction is a deterministic disposable-fixture result, not a production payload or latency measurement.

## Scope preservation

- No new Supabase project.
- No production data writes.
- No existing role, RLS, workspace or authorization policy changes.
- No clock-in/out mutation or GPS behavior changes.
- No new polling, background worker, telemetry or dependencies.
- No gradient descent, backpropagation, training, retraining, fine-tuning or model-parameter update logic.
