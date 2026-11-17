# CP-TL-REVISION-HISTORY-04 — Signed Runtime Acceptance Evidence

**Date:** 2026-11-17 (Asia/Manila)
**Scope:** TradeLink only, existing production Board and Supabase project.
**Baseline:** PR #456, merged as `7cfcf7c2ab2c09a09c4aab4c93ebd1e818497ac5`.

## Production database (read-only acceptance)

- `20261117020000_tradelink_immutable_revision_snapshots` installed once.
- 15 current TradeLink document rows, 15 immutable baseline snapshots, none missing.
- No post-activation captured snapshots and no snapshot with a revision earlier than the current revision. These figures are an actual database observation, not a completion claim for historical reprinting.
- Do not manufacture production edits or approvals merely to create historical acceptance data.

## Genuine signed Chromium — current Approved revision

- Signed APSYNTRA CRM session, `All Documents`, existing Approved QA Quotation `CP-TL-08C-QA-20261112-01`.
- Read-only preview showed revision 2 as Approved/current, one saved revision, and the explicit warning that earlier revisions were not retained before activation.
- `Print PDF` successfully opened the official print preview; Chromium `Save as PDF` generated a local QA PDF (not an electronic PDF issue event).
- PDFKit inspection: 3 pages, A4 (594 × 841 PDF points); client/company header page 1, commercial content including subtotal PHP 1.00, VAT PHP 0.12, total PHP 1.12 and Approved reviewer responsibility page 2, terms page 3.
- Three-page structure is intentional for the recovered v1.42.0 Sales & Services Quotation template (see `docs/tradelink-official-template-integration.md`). Do not collapse it without reference evidence.
- Legacy company-default warning was visible and no company assignment was changed.
- Chrome's default **Headers and footers** option appended browser metadata to the PDF. The updated print preview instructs the user to disable this option and enable **Background graphics** for the intended official output. The application does not silently alter browser settings.

## Genuine signed Chromium — Analytics

- On the Analytics route, Chrome DevTools Network captured a `tl03_analytics_summary` preflight and actual fetch, both returning HTTP 200.
- The signed dashboard displayed 3 active documents, 3 Quotations, 0 Won, 0 Lost. Refresh analytics produced a subsequent successful fetch and updated generation timestamp without duplicating visible totals.
- These observations establish a real signed browser RPC and rendered aggregate. Missing tax/aging sources remain separate from actual zero-value transactions.

## Acceptance classification

| Criterion | Status |
| --- | --- |
| Production migration, schema, current baseline coverage | VERIFIED |
| Analytics signed RPC and dashboard rendering | VERIFIED |
| Analytics manual refresh | VERIFIED |
| Approved current revision preview and PDF save | VERIFIED |
| A4/template/revision/commercial figures | VERIFIED for the existing QA Quotation |
| Earlier revision absence disclosed | VERIFIED |
| Historical Approved revision reprinting in production | PENDING: no actual earlier snapshot exists |
| Reprinting older saved revision in disposable PostgreSQL and frontend tests | VERIFIED in automated tests, not a substitute for signed browser acceptance |
| Two independently signed reviewers on new post-activation document | PENDING: no such new document created |
| Cross-browser physical printer output | NOT APPLICABLE to browser Save as PDF acceptance |

**Closeout:** Code and deployment are complete; genuine historical reprinting remains **PENDING**, not a failed implementation. Final evidence requires the first authentic post-activation approved revision that is subsequently revised, using normal business workflow, or an isolated signed disposable browser environment. No production document creation, revision, review event, or permission change was performed for this acceptance.
