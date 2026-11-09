# Priority 5D — Signed Workspace Authorization Startup Optimization

## Evidence and scope

- User-provided signed Priority 5C observation, 2026-11-09: navigation TTFB 289.4 ms, DOM ready 2088.8 ms, module entry 2075 ms from navigation, signed workspace startup phase 1008.5 ms, session restore 305.8 ms and authorized route 6 ms. The workspace phase includes `db.context()`, `db.boards('active')` and `roleConfig.bootstrapVerified()` plus client scheduling. The report does **not** identify server-only RPC duration or prove that board/role reads account for the whole 1008.5 ms.
- Source inspection: `refreshWorkspace()` previously invoked authoritative `db.context()` first, then `db.boards('active')`, then bootstrap role verification. Both post-context reads use their own signed server-side checks and have no data dependency on one another. They incurred avoidable serial waiting, particularly on initial signed startup.

## Narrow implementation

- Keep `db.context()` as the mandatory fresh authorization gate, merging the authorized workspace context and retaining the original identity-change resets. **Do not** start board or role queries until this gate succeeds.
- After that gate, run signed `wm_list_boards` and `apsyntra_role_is_bootstrap` checks concurrently with `Promise.all`. A rejected/denied board list remains fatal; a role-read error remains `false`, matching the existing fail-closed role semantics. Only the literal server `true` enables bootstrap features.
- Recheck that the session is still signed and the session user/context user/context workspace match the original authorized snapshot **before committing** either result. Do not cache user permissions, skip fresh RLS, alter server payloads, change storage, relax RBAC, or introduce repeated/persistent diagnostics. Existing session expiry and workspace-change invalidation remains intact.
- No schema changes, production writes, new Supabase projects, background monitoring, or credential handling changes.

## Reproducible acceptance

- `frontend/tests/workspace-startup-read.test.mjs` tests simultaneous scheduling, authoritative board denial, failed bootstrap fallback, strict boolean bootstrap value, workspace revocation, signed integration ordering, and a deterministic synthetic 300 ms board / 700 ms role example. The example has a 700 ms parallel scheduling critical path instead of the 1000 ms sequential total; this is **synthetic**, not a promised production reduction.
- Isolated Chromium `scripts/performance-profile-browser.mjs` additionally tests concurrent 100 ms / 250 ms synthetic signed-read durations and scope denial without production credentials. Existing frame, Long Tasks, startup-phase, two-tab/cache, IndexedDB and static-cache regressions remain release gates.
- Real end-user reduction from **1008.5 ms** must be measured by the same user after a full signed reload using Priority 5C diagnostics. Network variance means at least three comparable samples are preferable; signed browser proof is separate from automated functional closure. If the phase stays slow, distinguish the authoritative `db.context()` from the board and role RPC durations before attempting any other change. Never bypass context/RLS or persist role decisions to make a benchmark pass.
