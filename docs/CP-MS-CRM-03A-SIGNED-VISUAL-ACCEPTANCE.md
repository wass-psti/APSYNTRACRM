# CP-MS-CRM-03A — signed runtime and visual acceptance

## Scope and evidence
The original CP03 deployment succeeded; full post-merge CRM frontend, native, contract, and preserved standalone workflows passed. The recovered React source remains the visual reference, not the authoritative operational data source. CP03A restores interactive Local/Import metric cards, Unspecified source filtering, the source-count donut (not financial data), and the shared dashboard on Add Material. The existing atomic create form, signed commercial reader, details/tasks/activity handlers, current roles and schema remain unchanged. Source cards are non-interactive in Add Material to avoid discarding an unsaved form.

The signed commercial reader distinguishes an authorized empty receipt from a denied/unavailable read. No sample or zero monetary values are invented. Derived totals, FX snapshots and bulk import remain backend-dependent. Existing public CSV follows the same Unspecified filter.

## Repository-only verification
The native CI tests use synthetic records and simulated signed API responses, never real production credentials. The visual artifact contains synthetic native desktop/mobile light and dark, Add Material light and dark, and screenshots captured by running the untouched standalone reference test in the GitHub runner. The existing live Pages smoke test now includes exact-byte hash checks for native-screen.js, native-screen.css and reconcile.js.

## Genuine production acceptance (not certified by CI)
Use an already signed CRM session in Work Management, open Material Request Hub > Material Tracker (existing route).
1. Confirm real row count and sample identities against Main table. If no records exist, record an empty board, not a passed item read.
2. Select Load costs on one existing material. A successful response reports Stored values loaded or Signed read verified; no stored commercial values. Unavailable/Retry is not acceptance. Compare the displayed values with the existing Details drawer; historical values are not calculated totals.
3. Open Details, Tasks and Activity; verify that selected item's records are shown; no operational mutation required for this read-only closeout.
4. Open Add Material and verify form availability under current permissions; return without submitting. Confirm source filters, list sorting, mobile layout and CRM theme. Use the visual artifact to compare structure; intentionally different CRM shell, group names, stored amounts and controls requiring CP04 are not pixel parity.
5. Return a redacted pass/fail checklist; never share credentials, commercial values or personal data.

The signed browser connector was unavailable during CP03A. Genuine signed production acceptance and subjective visual review remain pending until an existing session is inspected. Do not create accounts, change authorization, populate production test fixtures, or claim that synthetic Chromium checks prove production signed access.
