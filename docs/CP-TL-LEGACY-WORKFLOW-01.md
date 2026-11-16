# CP-TL-LEGACY-WORKFLOW-01 — Legacy TradeLink parity review

## Source requirements reviewed

The user-supplied legacy workflow defines six document types (ESI, Quotation, Delivery Receipt, Packing List, Payment/AR, PO), Create/Edit, All Documents, Analytics/Dashboards, User Manual, and a Disaster Recovery Console. It also defines sequential numbering, company/vendor defaults, line-level calculations, discounts, VAT, multi-currency, a Draft → Submitted → For Approval → Approved lifecycle, quote outcomes, Letter-size PDF output, and dynamic verification QR codes.

## Existing APSYNTRA functionality retained

- Six source-aligned document editors and company profiles/templates (v1.42.0).
- Persistent signed document records and revisioned Board-item projection.
- Line-item management, terms, discount/VAT calculation and supported currencies.
- All Documents search/filter/pagination, status actions, revision history and saved-document preview.
- Two-stage signed reviewer validation; only the exact Approved revision is printable.
- Activity view and in-app User Manual.

## CP-TL-LEGACY-01 implementation

- Added a TradeLink Analytics portal route and read-only renderer for document counts, quotation outcomes/value by currency, and approved ESI tax totals.
- Added strict normalization for aggregate-only analytics responses; customer-level content is not accepted or rendered.
- Added an additive SQL migration candidate for `tl03_analytics_summary`. It reuses `private.tl03_can_manage`, uses `SECURITY INVOKER`, grants execution only to `authenticated`, and makes no role, RLS, Storage, or document-write changes.
- Analytics remains disabled in the frontend until the migration is separately approved and installed in the existing project.
- Added bounded CSV export for selected visible All Documents rows. Export contains document metadata only and does not mutate records.
- Changed both TradeLink print page declarations from A4 to Letter. The browser's print dialog still controls the final scale; 100% is the intended print setting.
- Expanded the User Manual with the supported currencies and the current save/review/print behavior.

## Source gaps requiring the next implementation

1. **Sequential numbering:** no authoritative reservation/sequence service exists. Starting numbers for each document type are not specified by the supplied workflow; do not infer them from the illustrative `Q-11131` alone.
2. **Submitted lifecycle stage:** current save supports Draft or For Approval; the submit RPC is disabled and the production status transition does not allow Draft → Submitted. The legacy intermediate state is not activated.
3. **Verification QR / electronic PDF issuance:** current output is a saved-revision browser print view, not an electronically issued PDF. No public verification endpoint or signed QR token contract exists.
4. **Aging report:** current persisted documents do not contain due dates, invoice-to-payment allocations, or authoritative outstanding balances. The analytics response reports aging unavailable instead of estimating it.
5. **Bank payment instructions:** company profile data currently includes legal identity/contact/template information, but no verified bank-account instructions were found in the supplied source or current profile model.
6. **Item-level discussions:** generic Board item collaboration RPCs exist, but the collaboration read feature is separately disabled. No new collaboration permission or write path is activated here.
7. **Disaster Recovery Console:** no TradeLink backup/index/restore subsystem or backup tables were found. Restore operations require a defined backup source and rehearsal process before implementation.
8. **Customer/supplier autocomplete:** the current editor has commercial suggestions, but no authoritative customer/supplier directory contract was supplied.

## Activation boundary

No production migration was applied, no production document was created or changed, and no role, RLS, Storage, credential, or backup configuration was changed. The analytics migration is source-only pending separate approval for the new authenticated RPC.
