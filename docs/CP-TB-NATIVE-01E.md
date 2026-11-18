# CP-TB-NATIVE-01E — Authenticated source export and read-only reconciliation

## Source evidence — November 18, 2026

Authenticated existing Brave browser session, original monday board 18370784140, native board Excel export with Updates and Subitems toggled on.

- Private local evidence copy outside repository: ~/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01E-authenticated-source.xlsx
- SHA-256: fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a
- Workbook sheets: talkbox, updates, Time tracking.
- Source board: 87 item rows with 87 distinct nonempty Item ID (auto generated) identifiers; 0 duplicate item IDs.
- Status values: Done 66; Working on it 12; Stuck 9.
- Updates: 1,129 records with 1,129 distinct post IDs, spanning 82 source issues. 5 source issues have no update records. All referenced parent item IDs occur among the 87 source issues.
- The included Subitems option did not yield an independent source-subitem-ID sheet and displayed null subitem column values; do not infer complete subtask lineage or equate CRM board ID 18370784141 to source subitem board ID 18371220520.

## CRM destination — non-mutating admin SQL inspection

- Existing public.toolbox_issues rows: 2, ids 1 and 2; neither includes a source-identity key in the inspected payload fields.
- Read-only issue planner over the 87 source IDs and these 2 destination records: matched 0, source unmapped 87, destination unlinked 2, orphan source references 0; status BLOCKED because a complete *genuine signed-user CRM pagination* snapshot has not yet been performed.
- This SQL inspection is NOT genuine signed-user RPC acceptance, and matching by title is prohibited. No production data writes or imports were performed.

## Focused correction and checks

- Reconciliation counts now explicitly include unlinkedCRM for CRM issues lacking a source identity.
- Added regression coverage that source-unmapped and destination-unlinked remain distinct and never authorize writes.
- Local focused TalkBox tests: 14 PASS, 0 FAIL.
- Local Vite production build: PASS. git diff --check: PASS.
- No changes to roles, permission policies, RLS, credentials or Supabase schema.

## Final acceptance outstanding

1. Authenticated native TalkBox disposable CRUD execution and independent signed readback after reload.
2. Complete subitem source identity/parent and thread lineage evidence, or verified evidence that no subitems exist.
3. Authorized non-destructive import/backfill design with idempotency and preserving the two existing destination records; actual production writes require applicable approval.
4. PR chain CI, merge, deployment and signed browser regression before operational activation.

The private source workbook is NOT committed or published.
