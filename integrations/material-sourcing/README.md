# Material Sourcing

Standalone, frontend-only reconstruction using React, TypeScript and Vite. This application uses seven local demo materials and reference-snapshot exchange rates. It is not connected to Monday.com, Supabase, CRM, or a live exchange-rate provider.

## Start

```sh
npm ci
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/ on this Mac.

## Verify

```sh
npm test
npm run build
npm run test:browser
```

The browser test requires the development server to be running. It uses the locally installed Chromium binary (override with CHROMIUM_PATH) and an isolated browser context. APP_URL can override the preview URL. Captures are written to tests/desktop-preview.png, tests/detail-preview.png, and tests/mobile-preview.png.

## Scope and conventions

- src/components: dashboard, material table, forms, import, detail drawer.
- src/utils/material.ts: domain types, deterministic calculations and validation.
- src/utils/storage.ts: browser storage hook and persistence error reporting.
- src/data/demo.ts: sample records, not migrated production data.
- src/styles/app.css: responsive light and dark styles.
- tests: pricing/validation tests and Chromium smoke acceptance.

Per-unit currency conversions are rounded to cents before landed cost and markup. This matches the screenshot fixture (PHP 9,046.20 landed per unit and PHP 36,184.80 total for four units). Local markup is 30%, import markup is 1.30 × 1.30, VAT is 12%. Unknown source has no assumed selling markup.

Browser storage is local to the current origin/browser profile, not a shared database. The activity stream, task list, preferences, and saved views are local simulations. Undo restores the most recent removal within the active session. The original checkpoint exported CSV and print output; CP-MS-FRONTEND-02 adds native XLSX and PDF. No authentication, live collaboration, or model training is included.

CP-MS-FRONTEND-02 implements advanced table controls, windowed rows, local threaded comments, mention UI, and native reports. Backend integrations are separate.

## CP-MS-FRONTEND-02 — Advanced frontend

The accepted visual baseline and the original material and preference storage keys are retained.

- Table: fixed-height virtual window, Shift+click multiple sort keys, draggable column headers, pointer/keyboard width resizing, keyboard column ordering in the Columns menu, sticky part numbers, group reordering, row actions, and validated inline editing. Select-all covers all matching records, not just the rendered window.
- Navigation: focus the part number and use Up/Down to navigate, F2 to edit; Ctrl/Cmd+K opens the fuzzy-search command palette.
- Drafts: add form and per-material edit drafts recover after reload or reopening. Saving or explicit discard clears the corresponding draft. Closing a drawer preserves unsaved input.
- Activity: local threaded replies, comment edit/delete with a tombstone to retain replies, and demo mention suggestions. No actual notification delivery or shared multi-user synchronization.
- Reports: native XLSX with material and numeric summary worksheets; landscape PDF catalog with a repeating header, page numbers and calculated totals. CSV remains available. Both native reports use selected matching records when selection is nonempty, otherwise all filtered records, independent of the virtual window. Unknown-source items contribute landed cost but are excluded from VAT-in totals. PDF uses built-in fonts; full Unicode glyph coverage is not certified.
- Exports are loaded on demand. The browser-only writer is write-excel-file 4.1.1; jsPDF 4.2.1 and AutoTable 5.0.9 create PDFs. Vite was patched to 6.4.6 within the existing major/minor line.
- Test-only generated records are isolated in fresh Chromium contexts; no production or user-profile data is seeded.

### Additional acceptance commands

```sh
npm run test:advanced
npm exec -- tsc --noEmit --noUnusedLocals --noUnusedParameters
npm audit
```

For compiled-build acceptance, start `npm run preview -- --port 4173` then run:

```sh
APP_URL=http://127.0.0.1:4173/ npm run test:browser
APP_URL=http://127.0.0.1:4173/ npm run test:advanced
```

Remaining limitations: historical trend data, live FX discovery/rate syncing, actual presence, notification delivery, multi-user persistence/conflict resolution, and historical record migration require a separately authorized integration phase. Browser storage is quota-limited and not a database. Safari/iOS and other browser engines have not been certified by the automated Chromium suite.

## CP-MS-BACKEND-01 — Local backend foundation

The approved frontend remains browser-local while the isolated PostgreSQL backend foundation
is prepared. See [backend checkpoint documentation](docs/CP-MS-BACKEND-01.md) for schema,
migration verification, the repository contract and the next integration milestone.

## CP-MS-BACKEND-02 — Database-backed Material Sourcing

Open http://127.0.0.1:5173/?mode=database to use the local PostgreSQL application;
the original demo remains at http://127.0.0.1:5173/?mode=demo. See
[CP-MS-BACKEND-02 documentation](docs/CP-MS-BACKEND-02.md) for startup, verification,
transactional CRUD, failure recovery, and remaining scope.

## CP-MS-BACKEND-04 — Dedicated collaboration operations

Database mode now supports transactional task and discussion commands, persistent task
ordering and browser-local discussion drafts. The server generates activity events,
preserves concurrent additions and rejects stale edits. See
[CP-MS-BACKEND-04](docs/CP-MS-BACKEND-04.md) for the contract and verification evidence.
Run `npm run test:collaboration` against an isolated scratch database.
