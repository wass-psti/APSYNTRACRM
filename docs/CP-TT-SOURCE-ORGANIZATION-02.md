# TimeTracker source organization — Phase 2

**Scope:** refactor TimeTracker JavaScript implementations only. No interface redesign, permissions, database changes, CSS cascade changes, or attendance data migrations.

## Canonical module ownership

All TimeTracker JS implementations now live in `frontend/apps/TimeTracker/`. This includes the existing application route, policy and pending-recovery modules from Phase 1, plus these 19 modules:

- `time-tracker-accounting-reconciliation.js`
- `time-tracker-board-projection.js`
- `time-tracker-calendar.js`
- `time-tracker-clock-recovery.js`
- `time-tracker-gps.js`
- `time-tracker-history.js`
- `time-tracker-log.js`
- `time-tracker-main-group.js`
- `time-tracker-map.js`
- `time-tracker-monitor.js`
- `time-tracker-my-hours.js`
- `time-tracker-native.js`
- `time-tracker-overtime.js`
- `time-tracker-overview.js`
- `time-tracker-pixi-scene.js`
- `time-tracker-record-management.js`
- `time-tracker-reports.js`
- `time-tracker-team.js`
- `time-tracker-ui.js`

`frontend/time-tracker-*.js` files remain as lightweight `export *` compatibility entrypoints so current pages, module imports, browser build paths, and users' existing deep links continue to work.

### Internal module dependencies

- Canonical TimeTracker modules import other TimeTracker modules from the *same directory*.
- The board projection reads the shared session API from `../../session.js` (relative to the new canonical folder).
- The signed backend, board context and role checks remain unchanged.
- Tests asserting TimeTracker source implementation details now inspect the canonical modules; runtime imports continue to test compatibility entrypoints.
- `frontend/tests/feature-module-boundaries.test.mjs` verifies every named export at the legacy path is the exact same object as the canonical export.

### Kept in place for now

- 15 `frontend/time-tracker-*.css` files: these are owned by the existing exact-order CSS bundle, `index.html` provenance comments and browser smoke tests. Move them during the separately validated TimeTracker UI styling stage.
- `frontend/app.js`: the central CRM host and its TimeTracker route orchestration; splitting that shell is a higher-risk refactor with source-contract tests and should be a separate PR.
- `frontend/tests/`, `scripts/`, Supabase migrations, RLS policy logic, Edge Functions and deployment workflow paths stay in their established locations.

### Recommended structure for the later UI stage

```text
frontend/apps/TimeTracker/
  time-tracker-application.js
  time-tracker-policy.js
  time-tracker-*.js
  components/        # Future UI renderer extraction
  styles/            # Move styles only with manifest/bundle/test update
```

### Validation

- `npm ci`
- `npm test`
- `npm run build`
- `node --test frontend/tests/feature-module-boundaries.test.mjs`
- Confirm TimeTracker Overview, Clock, Log, Calendar, Overtime, My Hours, Reports, Team, Monitoring, GPS and page refresh/deep links function as before.
- For human-readable code, apply Prettier formatting in a **separate** commit from the moves, using `npx prettier --write frontend/apps/TimeTracker` and testing again to keep diffs auditable.

**Do not merge this structural refactor unless CI passes.** After merging, adjust TimeTracker UI in a separate reviewable PR.
