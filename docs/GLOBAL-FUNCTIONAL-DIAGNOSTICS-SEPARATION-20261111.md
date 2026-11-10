# APSYNTRA CRM — Global Functional UI / Engineering Diagnostics Separation

Date: 2026-11-11.

## Implemented across the shared workspace shell
- Normal navigation now contains everyday Overview, My boards, existing administrator Role Configuration/User Role Management where authorized, Settings, and recent authorized boards. The engineering-oriented **Access acceptance**, **12-board foundation**, and **Pages acceptance** navigation entries are no longer displayed during ordinary use.
- Shared board headers hide **Profile board rendering (5 seconds)** except in an explicit engineering view.
- Ordinary editable board toolbars hide manual **Verify signed bulk access** and its technical probe report. Users directly start Bulk actions / Bulk status / Archive; these already trigger `ensureSignedBulkReady` automatically, enforcing the current signed backend contract before any mutation.
- Engineering diagnostics can be displayed by an already server-verified bootstrap administrator using `?diagnostics=1` on the existing application URL. The query parameter merely changes visibility of existing controls, not permissions or authentication.
- The same global code applies to all boards and workspace views, not only Material Request Hub. Existing direct routes remain governed by their established authorization; no previously inaccessible data is exposed by the toggle.

## Preserved security and functionality
- No change to Supabase schema, data, grants, RBAC/RLS, platform roles, signed workspace isolation, session revocation, or module-specific protected fields.
- No automatic background probes or monitoring. Existing signed bulk mutation preflight remains fail-closed and is invoked by genuine user actions.
- Destructive actions still require their original confirmations, CAS/rollback behavior, and server-side authorization.
- No fictional claim of improving every module's policy semantics; the work is the **shared UI diagnostic-friction layer**.

## Verified
- Full frontend `node --test frontend/tests/*.test.mjs`: **1,608 / 1,608 PASS**.
- Syntax check `node --check frontend/app.js`: PASS.
- CSS build hash `node scripts/build-priority5-styles.mjs --check`: PASS.
- New tests check opt-in/verified bootstrap requirement, ordinary navigation and board visibility, preservation of automatic signed bulk probe, and no direct data mutation.

## Next material problem, if any
Any remaining **specific** workflow blocked despite valid permissions should be analyzed against its server RPC contract and concrete signed error. Do not remove server security to make a frontend test pass; diagnose functional blockers at the smallest domain boundary.
