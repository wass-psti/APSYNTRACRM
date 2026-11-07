# CP-TL-03D — Reference-Led TradeLink Portal Redesign

**Reference authority:** 20 TradeLink screenshots supplied November 7, 2026 (captured November 6, 2026). **Scope:** APSYNTRA CRM TradeLink frontend only. **Production API activation:** NO-GO.

## Reference mapping

| Reference element | Implemented surface |
| --- | --- |
| White brand/nav header, blue TradeLink logo, workspace selector-like label | `tl-reference-topbar` with signed-workspace indicator; no second login or fabricated workspace selector |
| Create New / All Documents | Existing signed routes (`#/boards/:id/tradelink/drafts/quotation`, `/documents`) |
| User Manual / Disaster Recovery | Functional local help disclosure; Recovery explicitly unavailable until supported |
| Document title and actions | Per-module white toolbar card with local status, working Validate locally and disabled Save/PDF/Templates |
| Six document tabs | Horizontal source-aligned route links, selected state and keyboard focus |
| Document Information / Client Information | White card, amber field labels, rounded native form inputs, local state and required validation |
| Line items | Source-supported single-item Draft editor, no fake multi-line persistence |
| Discount/currency/VAT totals | Existing source calculator, disabled remote FX lookup, right-aligned estimate panel |
| Terms and conditions / verification | Existing remarks, local reviewer/assignee readiness; never an authoritative approval |
| Authorized documents | Signed server-only list remains gated, in a collapsible section beneath editor |

## Functional/security invariants

- Central APSYNTRA authentication, signed workspace identity, board ID, route conventions, role ceilings, and existing domain RPC contracts are unchanged.
- Both `TL03_DOMAIN_READS_ENABLED` and `TL03_DOMAIN_WRITES_ENABLED` remain **false**. No browser-only persistence, synthetic saved documents, direct table writes, or production grants were added.
- Existing source envelope validation, one-item restriction, amount calculation, currency and explicit-FX handling, discount, VAT, domain documentation, and authorized-list filters remain intact.
- Tab changes use existing signed routes. `app.js` retains the existing module-change clearing and in-memory draft capture behavior; no cross-module sensitive fields are copied.
- Browser action labels are explicit: Save, Submit for Review, Templates, and Generate PDF are unavailable, rather than made clickable without server contracts. The visible Validate locally action uses the existing preview path.

## Visual validation

A dedicated nonproduction GitHub Actions workflow renders **synthetic, nonauthenticated** source HTML in headless Chromium and checks DOM geometry, card ordering and page-level horizontal overflow. It captures representative desktop, tablet, and mobile snapshots for comparison against the supplied screenshots. This does not constitute genuine signed-browser acceptance of the deployed UI.

Reference-design features intentionally not simulated: a live client directory, server-assigned numbering and revision, document attachments, payment bank-account directory, multiple line-item persistence, approver directory, workflow approval, PDF generation, and Disaster Recovery. Unsupported reference-only fields such as Plant Address and Contact Person were not fabricated into the domain envelope.

Pixel-perfect equivalence is further limited by the fact that the screenshot shows a standalone TradeLink portal, while APSYNTRA CRM retains its own parent application shell, board tabs and signed workspace navigation.

## Acceptance evidence

- Six-module target regression and full frontend regression: PASS at [Actions run #42324524836](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42324524836).
- First screenshot pass found inherited column layout in secondary navigation; corrected by explicit `flex-direction:row` and a regression assertion.
- After correction: synthetic screenshots and desktop/tablet/mobile geometry checks: PASS at [Actions run #42324707900](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42324707900).
- The later source-aligned repositioning of quotation, invoice and supplier contact/term fields requires the latest-head workflow results; consult PR checks rather than treating earlier runs as final.

## Deployment and next gates

Keep PR in draft pending owner visual review, genuine signed workspace UI acceptance and unchanged-code security regression evidence. Do not merge/release as authorization to activate TradeLink reads, writes, PDF or invitation/workflow transitions. No new Supabase project or production schema modification is requested.