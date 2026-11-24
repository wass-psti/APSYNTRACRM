# CP-OI-NATIVE-03 — Purchase order creation and editing

## Scope
Native create/edit form on existing Order Intake route. Existing modal, signed transport, idempotent create and revision-checked detail update RPCs. No database migrations or policy changes. Production read-only catalog confirms both RPC signatures and authenticated EXECUTE grants; original server-side admin/module/workspace checks remain. Existing production count 909 legacy + 1 archived native QA row. Actual signed production All Orders page observed populated with legacy rows; full CP02G signed acceptance not re-run across all 909 pages.

## Implementation
16 persisted fields, PHP/USD/EUR (current backend-supported currencies), 14 statuses, dates and decimal validation, live exact VAT-exclusive/VAT/profit preview, responsive editor. All authoritative values read back from registry before success, including exact financial fields. Create retries reuse request ID for same payload; acknowledged writes retry readback only. Uncertain create values retained in current in-memory editor scope; no new request for changed payload until original outcome reconciled. Update uses original revision, conflict leaves data intact; lost update response reconciled by revision+field readback. No new restrictions; source historical records remain immutable under existing legacy contract. Closing/navigating away clears scoped editor state as applicable; no durable draft recovery across reload, native normalized PO uniqueness protects duplicate native PO. Historical PO overlap is not a new uniqueness constraint; separate historical edit/reconciliation is outside scope. Post-save refresh uses shared read model and opens saved native record even when filtered or outside first page.

## Verified
- 7 editor tests, 41 focused Order Intake tests. Full regression 3651/3651 before final scope-generation/feedback adjustment; final focused suite passed. Build, configured lint, syntax/check and 308 migration hashes passed.
- Disposable PostgreSQL original create/update/idempotent RPCs, existing workspace/module helper fixtures, actual GoTrue and PostgREST. Create revision 1, exact PHP112/12%/5 expense -> VAT-exclusive100, VAT12, GP95. Replay same request returns same UUID. Changed key and case-insensitive native duplicate PO rejected, edit revision2 -> amount224, GP195, stale revision rejected, two audit activity rows. All 909 legacy payloads preserved. Signed Chromium isolated form harness create/edit, exact two writes, live preview, mobile containment, zero page errors. Existing read browser rehearsal also passed.
- No production write tests performed. Private manifest and evidence excluded from git. Disposable services cleaned up.
- Reproduce: OI_VERIFY_MUTATIONS=1 bash scripts/cp-oi-native-02f-disposable.sh "$HOME/.apsyntra-work/order-intake-evidence-20261124/legacy-compatibility.json"
- Production signed write acceptance remains pending a genuine business order (no synthetic production data authorized). No new dependencies, authorization changes, model training, gradient descent or parameter updates.

## Acceptance
Create/edit candidate verified locally against real signed disposable services. Existing release checks and deployed UI acceptance remain distinct. Future workflow/dashboard/PDF phases do not need another local persistence rehearsal.
