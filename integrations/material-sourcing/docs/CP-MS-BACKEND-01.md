# CP-MS-BACKEND-01 — Backend foundation

## Environment and scope

Standalone project: material-sourcing-local (Supabase CLI 2.121.0, PostgreSQL 17.11, Docker).
Local database port: 55322. Existing unrelated Supabase stack on 54322 is not modified.
No linked project, production credentials, hosted migration, or historical data import.
The application still renders its approved browser-local data. The private PostgreSQL schema
and read repository are deliberately not wired into the frontend yet.

## Data contract

| Relation | Purpose |
|---|---|
| material_groups | Stable legacy group codes new_group and topics, name and position |
| fx_snapshots | Immutable USD and EUR rate stamps, provider, observation date and demo marker |
| materials | Stable string IDs, all current material fields, group and FX references, archive marker, raw legacy identity and JSON payload |
| tasks | Ordered material subtasks and three existing status values |
| activity | Events and comment replies, mentions, edited timestamp, deletion tombstone |
| starred_materials | Actor-specific starred record references |
| saved_views | Actor-specific named JSON table settings |
| user_preferences | Actor-specific JSON preferences |
| material_costs | Invoker-rights view calculating exact PHP costs from a material's FX stamp |

Text identity keys accommodate the existing demo identifiers and future source identifiers;
new database records default to UUID strings. Part numbers are not unique: repeated RFQs
and duplicate materials are legitimate. External legacy identity is unique per source.
Historical negative lead times and Unknown sourcing can be represented; missing or invalid
historical quantities/prices must be staged and reconciled in the migration phase, not invented.
Account and supplier PO references are text for now; future linked CRM identities must be mapped
against the actual source contracts. Actor references are not authorization claims.

PostgreSQL numeric columns retain six decimal places for input prices/quantities and eight for
FX rates. Conversion and markup round to cents in the same sequence as the reference. The
frontend calculation utility now uses decimal.js (10.6.0) with half-up rounding; the original
Math.round implementation returned 10.07 for 10.075 whereas PostgreSQL returns 10.08.
All seven existing fixtures agree with the database. Exact computed database values travel
as decimal strings; the legacy UI material model still uses JS numbers. Very large values beyond
safe JS precision are not certified for client calculations; server-derived costs will be the
integration authority. Unknown source returns null selling/VAT values, not fabricated zero markup.

## Repository

src/api/materialRepository.ts defines the typed read contract and snake_case-to-domain adapter.
server/materialRepository.ts provides a parameterized SQL read repository with stable pagination,
literal case-insensitive search, nested tasks/comments and actor-specific stars. Archived items
are excluded. The executor is injected and no database credentials are included in the browser.
The pg 8.23.1 development dependency is used only by the real local integration tests.
Offset pagination is correct on a stable dataset; concurrent write consistency, write RPCs,
transactional bulk operations, server-side revision tracking and live synchronization are later
milestones. Substring search is a literal scan at this checkpoint; indexes support group/date,
source, due date, exact part lookup and foreign keys. Production query plans are not certified.

The schema is outside the exposed API schemas. No application user roles, policies, grants or
authentication changes were made. A future API must use the agreed access model; never expose
the privileged SQL connection to the browser.

FX snapshots cannot be silently modified; a deliberate restamp creates a new snapshot and updates
a material reference. Thread identities and reply links are immutable; circular replies are rejected
while text edits and deletion tombstones remain valid.

## Reproduce

From the local project directory, using the dedicated project only:

```sh
supabase db start
supabase migration list --local
npm run test:migrations
npm run test:backend
supabase db lint --local --schema material_sourcing --fail-on error
supabase db advisors --local --level warn --fail-on error
npm test
npm run build
```

Run compiled preview on 4173 and use APP_URL=http://127.0.0.1:4173/ for npm run test:browser
and npm run test:advanced. Never run the rollback scripts on user or production data.
The migration verification script creates and drops a uniquely named scratch database inside
the dedicated local container; the development fixture database is preserved. Test SQL changes
are transactional and rolled back. Seed SQL is synthetic and meant for fresh local databases.

## Next milestone

CP-MS-BACKEND-02: transactional material CRUD (including duplicate, archive/undo and restamp
where applicable), a bounded development API or equivalent integration transport, and frontend
read/write switching in a nonproduction environment. Verify persistence after browser reload,
failure recovery, no accidental local-demo fallback, and preserve the approved UI. Actual
multi-user authorization, remote project selection and historical migration remain separate
decisions. No machine learning or training dependencies or processes were introduced.
