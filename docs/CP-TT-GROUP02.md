# CP-TT-GROUP02 — Remove redundant TimeTracker Main Group II from Board Items view

## Verified production read-only evidence (2026-11-04)

Board: \`46bf4ee7-368a-4c35-842c-8593ea1f6ac3\` (active, name \`TimeTracker Attendance\`, description begins \`[APSYNTRA:MODULE:timetracker:v1]\`).

\`public.work_board_groups\` joined to all items (including archived):

| Group | ID | Position | Total items | Active | Archived |
|---|---|---:|---:|---:|---:|
| Main group | \`8d43c020-e50f-4173-a98e-27b6de99bf2f\` | 0 | 2 | 2 | 0 |
| Main Group II | \`d0224e2b-20c0-41a3-90f0-046aad545191\` | 1 | 0 | 0 | 0 |

The attached screenshot showed Main Group II as an empty second group. No source attendance records are part of the second group.

## Root cause

The board renderer correctly loads all signed groups, and displays all by default. It previously omitted a group only if that particular browser's localStorage contained a manually hidden group ID. Because other browsers or users do not share the preference, the unused group reappeared in the normal view.

The existing protected-group permanent deletion RPC is intentionally **not activated** (\`MANAGED_TT_GROUP_DELETE_ENABLED=false\`). Removing records through SQL directly or enabling generic deletion would bypass the signed manager, audit, CAS and production approval boundary.

## Non-destructive fix

- \`frontend/managed-time-tracker-groups.js\`: \`isRedundantEmptyTimeTrackerGroup\` recognizes only the exact verified board UUID, exact group UUID, exact title, active managed module description, nonprimary position, original multiple-group configuration, and **zero current or archived item references**.
- \`frontend/app.js\`: excludes only matching safe redundant groups from rendered \`shownGroups\` on the Items view. This is universal for every signed user; no browser-local preference is required.
- Browser-local hidden group preferences continue independently, with unchanged Restore Hidden Groups behavior and accurate hidden-group counts.
- If the group is renamed, receives any item (including archived), changes position, loses protected board identity, or the board is no longer active, the predicate fails and it becomes visible. Main group and its two existing authorized attendance entries remain unchanged.
- Existing board tables, attendance projection, GPS, TimeTracker navigation, item counts, authenticated APIs, RBAC, RLS, SQL schema, and events are untouched.
- Zero production SQL writes, zero account/permission changes, zero deleted records.

## Acceptance boundaries

Automated tests assert exact identity matching, never suppressing primary or populated groups, including archived records, and preserving the manual hide/restore feature and protected delete gate. Full regression CI, Pages deployment and exact-hosted-asset smoke provide deployment evidence. Production database read-only queries establish snapshot emptiness but not future state.

**Important:** The underlying empty \`work_board_groups\` row remains in PostgreSQL. This milestone removes it from the Items UI, **not permanently from storage**. An actual deletion, if required, must use the separately approved and signed server deletion workflow after independent authorization checks, never a direct SQL delete.

Actual signed browser visual acceptance remains independent: the TimeTracker Items view should display only "Main group" (with its two attendance rows), and other boards must show all their existing groups.
