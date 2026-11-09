# TradeLink rebuild — Phase 3 screenshot reference trace

Scope: user-supplied TradeLink screenshots dated 2026-11-06 23:55–23:57 (18 new screenshots), together with earlier 23:52–23:54 references. Visual references describe intended UI, not proof of backend availability or production data.

## Cross-module visual pattern

- Portal toolbar: Create New, All Documents, User Manual, and company selector; provide a unified, whitespace-led enterprise shell.
- Document editor: title and document action toolbar; six document tabs; Document Information (status/number/date/revision); party details; line items or payment instrument; financial totals when applicable; notes and terms; reviewer responsibility.
- Use compact 2-column text fields and responsive 1-column stacking, restrained dividers, native keyboard/focus behavior and honest empty/loading states.
- Screenshots show generated numbering and review buttons. Current APSYNTRA signed Draft API instead requires an explicit unique document number, and server workflow submission/approval and template/PDF activation remain gated. Do not silently pretend to assign numbers or approve documents.

## New reference details

| Area | Screenshot-derived requirement | Implementation boundary |
| --- | --- | --- |
| Quotation | Payment-term presets (receipt, COD, PDC, advance, net terms), validity options, delivery timing, custom values, VAT, discount, extra notes, Sales Supervisor/management roles | Native editable datalist suggestions implemented; custom strings remain domain-validated; reviewers are informational until signed role checks |
| PO to Suppliers | Supplier name and TIN, purchase references, validity and delivery, money totals, reviewer/approver fields | Existing PO source fields preserved; payment term datalist implemented; new supplier directory would need authoritative lookup |
| Electronic SI | Client identity, itemized quantities/pricing, VAT/discount and bank details, finance reviewer and management approval | Existing signed Draft editor/finance formula retained; actual bank account choice requires authorized company data |
| Packing List | Physical item descriptions, quantities, optional serial identifiers, notes | Existing unpriced item editor and module-specific validation retained |
| Delivery Receipt | Item and serial list, QC and logistics responsibilities, delivery tracking | Existing bounded fields retained; no simulated delivery confirmation |
| Payment AR | Cash/cheque instrument, received amount, creator, finance receiver and verifier | Existing payment form and validations retained; receiving funds is not a frontend-only action |
| All Documents | Document-type tabs, search, workflow/quote status, dates, sorting, horizontal table, per-row actions | Current signed repository lists and filters retained; no fake 100-record count or bulk approval/delete |
| Company selector | Watchdog/PLC company selection, company logo/QR, per-company document imprint | Requires verified company identities, permissions and Storage URLs; do not generate or upload fake branding |
| Admin counter reset | Reset All Counters / Reset PL Counter Only | Destructive numbering operation; explicitly excluded from frontend-only Phase 3 |
| PDF/approval | Print, generation, review, approval, revision, export | Preserve signed server capability gates; no inert-but-enabled controls or invented approval timestamps |

## Acceptance boundaries

Current Phase 3 increment provides native datalist suggestions for commercial terms and preserves all six existing signed Draft module field contracts. It has not implemented company management, source-client lookup, server-generated document numbering, quote-status persistence, workflow status mutations, attachment upload, or new PDF generation.

Do not use screenshots' visible names, bank accounts, company identifiers, document counts or financial amounts as synthetic app data. The existing authorized response remains the sole source of actual records.

## Next frontend increments

1. Reconstruct All Documents table toolbar and responsive read-only filtering while retaining existing data-action hooks and authorized query scope.
2. Add source-led document-specific presentation for receipt, shipment, and invoice fields without changing draft envelope semantics.
3. Verify keyboard and responsive flows in a real signed browser, plus cross-module unsaved-state isolation.
4. Gate subsequent backend work on frontend acceptance; retain production RLS, audit, and recovery constraints.
