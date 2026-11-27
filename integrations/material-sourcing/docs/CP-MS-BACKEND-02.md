# CP-MS-BACKEND-02 — Material CRUD and permanent persistence

## Use the application

- Database mode: http://127.0.0.1:5173/?mode=database
- Original demo mode: http://127.0.0.1:5173/?mode=demo

The mode switch deliberately keeps the approved demo dataset and draft namespace independent
of PostgreSQL. The default URL remains the existing demo mode. Database mode never silently
falls back to demo records. Saved records are committed to the dedicated local database;
the current view is refreshed from the committed transaction response.

Local runtime: Vite 5173; compiled preview 4173; Node API 5181; PostgreSQL 55322.
API and PostgreSQL are loopback-only. No production connection, hosted migration, user role,
authentication, or application authorization changes. This development transport is not a
production authentication solution. It uses a fixed local-development actor. The private
application schema remains outside Supabase's exposed Data API schemas.

## Local startup

The dedicated local container and volume are named supabase_db_material-sourcing-local.
If the existing loopback-bound container is stopped, start it with:

```sh
docker start supabase_db_material-sourcing-local
npm run api
# separate terminal:
npm run dev -- --port 5173 --strictPort
```

If Supabase CLI removed the container, restore its retained volume using the dedicated
project's config with `supabase db start` and immediately run
`python3 scripts/bind-local-db.py`. The CLI on this Mac otherwise publishes the development
database on all interfaces. A Docker bridge host-binding option was tested and did not
prevent that behavior. The helper recreates only this dedicated container with an explicit
127.0.0.1 port mapping, retains the existing volume and rolls back container metadata on
failure. It does not print credentials or change database roles. Verify with
`docker ps --filter name=supabase_db_material-sourcing-local`. Do not expose development
credentials or the API to a network. Use ordinary Docker stop/start on this container
to retain the explicit mapping. Do not change the unrelated Supabase project on 54322.

## Implemented behavior

- Material reads use the existing typed repository and a repeatable-read transaction.
- Create, edit, inline edit, shipping currency, group movement, bulk import, source changes,
  archival and restore use transactional writes. IDs are preserved on edits; duplication
  copies committed source fields and its FX stamp into a new ID, without copying tasks,
  discussions, stars or legacy source identity.
- Every mutation receives the database revision read with the material. Stale writes are
  rejected; an edit draft retains its original revision across reload. To reconcile a stale
  draft, copy or review the draft values, discard it and reopen the latest saved material.
- New materials receive the latest database FX reference snapshot. Existing materials retain
  their snapshot through ordinary edits. Live FX and explicit restamp UI are not in this phase.
- Database-derived numeric costs are returned as exact decimal strings. Existing UI calculation
  uses decimal.js with matching formulas. Inputs beyond the schema's six-decimal scale are
  rejected rather than silently rounded; extremely large JavaScript number limits remain
  a later pricing-integrity concern.
- Tasks, comments, replies, comment edits/tombstones and local-development stars are persisted
  as part of material updates to prevent regression; full collaboration-specific endpoints,
  real actor identity and notifications remain deferred.
- Archive is a soft delete; restore uses the same identity. The latest archive batch's
  revision references are retained in browser-local storage so Undo survives a reload.
- Form input is retained until a successful database response, including creation ID for
  ambiguous acknowledgements. Network/transaction failures show errors; retry is explicit.
  A lost acknowledgement may mean the transaction committed. Refresh and inspect the actual
  data before retrying. Reusing the original creation ID prevents a duplicate insert on retry.
- Existing demo data and drafts are not migrated. Theme, saved views and column preferences
  remain browser-local pending their own integration checkpoint.

## Reproduce acceptance

```sh
npm run build
npm test
npm run test:backend
npm run test:migrations
npm run test:crud
# Optional: actual restart of ONLY the dedicated local PostgreSQL container.
MS_VERIFY_RESTART=1 npm run test:crud
```

The CRUD script creates a uniquely named scratch database within the dedicated container,
applies the two existing migrations, seeds fixtures, starts a temporary API on 5182 and
compiled preview on 4174, runs Chromium, then stops the temporary processes and drops
only its scratch database. With MS_VERIFY_RESTART=1 it restarts the dedicated container
and verifies an actual saved record and exact cost after reconnecting. The main development
fixture database retains seven rows. No test data was inserted into the normal browser
profile or main fixture database.

The previous 23 browser checks can be rerun against the compiled preview at 4173.
The new CRUD suite covers 14 browser/API groups, including outage recovery, stale drafts,
bulk rollback, precision validation and mobile. The restart test is separate.

## Remaining scope

This is a verified local CRUD development integration, not a hosted or production deployment.
The current API returns all active materials in a consistent snapshot for compatibility with
the approved table. Server-side filtering/pagination at scale, revision policies for other
future writers, granular collaboration APIs, authoritative server-cost rendering for extreme
values, live FX, user preferences, historical migration and actual authentication integration
remain separate checkpoints. Undo history is the most recent batch per browser, not a full
archive-management screen. The two prior migration files are unchanged.
