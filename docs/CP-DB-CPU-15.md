# CP-DB-CPU-15 — FM1 Stale-Revision Conflict Workload Containment

**Project:** APSYNTRA CRM
**Repository:** `wass-psti/APSYNTRACRM`
**Production branch baseline:** `main` at `e799d824`
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Scope:** Reduce avoidable FM1 revision-conflict RPC traffic without changing database contracts or business data.

## Production evidence

A read-only query of Supabase PostgreSQL logs found repeated occurrences of:

`FM1 ticket revision changed; refresh before retrying`

The log entry carries SQLSTATE `40001`.

| Observation | Result |
|---|---:|
| Occurrences in the queried 24-hour window | 6,651 |
| First observed in that window | 2026-11-17 04:24:33 UTC |
| Last observed in that query | 2026-11-17 06:15:24 UTC |
| Distinct PostgreSQL processes | 1 |
| Distinct PostgreSQL sessions | 1 |
| Separate 15-minute query | 888 occurrences, 06:02:42–06:17:29 UTC |

These counts establish a concentrated conflict workload, not its initiating actor. One process/session does not prove one browser tab or one user. The application API client does not automatically retry this mutation. The frontend did, however, leave the stale ticket detail in place after a conflict and re-enable the form, allowing repeated manual or externally triggered submissions with the same old revision.

The log volume is a credible source of avoidable database work, but PostgreSQL log counts alone do not quantify CPU time. The Supabase CPU metric was not exposed by the connected database tools during this pass; no CPU reduction is claimed here.

## Implementation

1. Added an instance-scoped in-flight mutation guard so duplicate submit events during one pending ticket mutation issue only one RPC.
2. On SQLSTATE `40001`, clear the old form idempotency fingerprint/key and fetch the authoritative latest ticket detail when the same ticket is still open.
3. Show an explicit conflict notice and require the operator to review the refreshed server values before initiating another write.
4. Do not automatically retry a failed mutation.
5. Made `loadTicket` return a boolean so conflict recovery can distinguish a successful refresh from a failed read.

## Compatibility and non-changes

- No database migration, RPC signature, index, setting, RLS policy, role, or workspace rule changed.
- No production business record was created, edited, or deleted.
- Existing optimistic concurrency and server-side revision checks remain authoritative.
- The behavior applies to the FM1 ticket-detail mutation forms that use the shared handler.

## Verification

- Baseline FM1 suite before changes: 43/43 passed.
- Full repository test suite before the final browser-fixture additions: 2,558/2,558 passed.
- Focused FM1 integration suite after implementation: 7/7 passed.
- Browser acceptance against an isolated Vite server on port 5174: passed, including forced SQLSTATE `40001`, authoritative revision refresh, no automatic retry, and two synchronous submit events producing one successful RPC.
- ESLint: passed.
- Prettier check: passed after formatting.
- JavaScript syntax check: passed.
- Production build: passed. Existing Vite warnings remain for the non-module startup-guard script and large chunks.
- `git diff --check`: passed.

## Production acceptance still pending

The implementation is not deployed by this change set. After merge and GitHub Pages deployment:

1. Verify the production asset contains the conflict-recovery behavior.
2. Observe PostgreSQL logs for a sustained reduction in `40001` FM1 conflicts under comparable usage.
3. Capture Supabase CPU and query statistics over a comparable observation window.
4. Recheck `wm_list_boards`, `wm_get_board`, and `apsyntra_crm_my_effective_access` using fresh interval deltas rather than lifetime totals.

A reduction in conflict errors is not, by itself, proof of a database CPU reduction. Keep CPU acceptance pending until the actual Supabase metric is available and comparable.
