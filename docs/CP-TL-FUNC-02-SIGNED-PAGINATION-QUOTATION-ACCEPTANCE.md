# CP-TL-FUNC-02 — Signed All Documents and Quotation Draft acceptance

Date: 2026-11-12 (Asia/Manila). Project: existing Supabase project and TradeLink Board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`.

## Verified production activation

Applied the existing, disposable-PostgreSQL-tested `sql/tradelink-documents-page-candidate.sql` migration as `cp_tl_func_02_signed_documents_page_activation`. Result: success. New signed `public.tl03_documents_page` is SECURITY INVOKER, EXECUTE granted to authenticated and denied to anon, with the existing `private.tl03_can_manage` Board/workspace/session guard and table RLS retained. Original list/read/commit RPCs unchanged. No new roles or separate login.

A genuine authenticated Chromium session reloaded All Documents and displayed **server-wide search, filtering and keyset-pagination controls** instead of a missing-RPC fallback. Initial authorized response had one active document; disposable PostgreSQL 17 tests verify cursor boundaries, archival filters, invalid-input denials, manager denial and foreign-workspace isolation. Do not claim a real 50+ document paging test.

## Genuine signed quotation creation — VERIFIED

Created exactly one clearly synthetic QA quotation through the signed UI: `Q-CP-TLFUNC02-20261112-01`, customer `CP-TL-FUNC02 Synthetic QA`, payment Net 30, validity 30 days, delivery commitment 14 days, quantity 2, price 125.50. No matching document existed beforehand. The browser navigated to All Documents, listing the new document and the previous authorized record.

Independent read-only PostgreSQL verified record UUID `87a18c01-a2f1-4f7f-ac9d-a898ecdd152f` in Draft state at revision 1, exact values and matching Board item `15be7d84-99ec-48ce-bbfe-edd7d2c4bd41`. Board count increased from 7 to 8. No other operational item was changed.

## Confirmed frontend blocker correction

The existing PostgreSQL `private.tl03_validate_draft` permits incomplete quotation content at Draft save. The separate future submission function checks required commercial readiness. The frontend previously prevented **Save Draft** until submission-readiness fields and a complete priced line were filled.

The targeted frontend fix adds `purpose:'save'` to quotation Draft parsing, allowing only omitted commercial readiness fields and an untouched placeholder line. Nonempty malformed email, invalid quantities/prices, incomplete item rows, bad currency, oversized payloads and server-controlled properties remain rejected. Preview retains its strict default parser and `reportValidity`. The quotation form alone uses `novalidate` to prevent native submission validation from blocking a legitimate partial Draft; the other five modules are unchanged. No additional permissions or authority checks.

## Verification

- Quotation full Draft creation: live signed user, persisted content and Board projection VERIFIED.
- Server-wide pagination: live activation and signed UI VERIFIED; disposable signed keyset and denial acceptance previously PASS.
- Four new frontend unit cases, 274 TradeLink tests and 1,853 complete frontend tests PASS.
- Post-deployment partial quotation edit and refreshed signed persistence: **LIVE SIGNED VERIFIED** (details below).
- Workflow submit/review/approval, PDF and attachments remain independently unactivated, and were not bypassed or changed.

## Final post-deployment signed runtime closeout — VERIFIED

- PR #269 merged as `a3f453c6e6bfb6af12fd0730667561b53c1d382d`; GitHub Pages deployment and main-branch frontend validation both PASS. Independently fetched deployed source and confirmed `incompleteQuotationSave` with `purpose:'save'`.
- Used the already-authenticated Chromium profile to reopen the exact synthetic quotation at its signed Edit Draft route. Confirmed the new quotation-only `novalidate` form, clear Draft-save guidance, and unchanged normal line item/identity.
- Deliberately cleared `paymentTerms`, `validity`, and `deliveryCommitment`, leaving the item and document number intact. HTML `checkValidity()` was **false** due to submission-readiness fields, but the legitimate **Save Draft** action was enabled and the signed server accepted the edit. All Documents showed revision **2**, with the same document and Board item IDs.
- Independent read-only PostgreSQL confirmed revision 2, Draft state, matching item title, omitted three commercial terms, the preserved line item and synthetic remarks, and **2 signed domain events** (create and update).
- Reloaded the signed browser, retrieved All Documents anew, observed revision 2, and reopened the exact Draft. Fields persisted empty and Save Draft remained enabled. Clicking **Preview** still yielded `invalid` with **“Check Payment terms. Nothing saved or transmitted.”** This demonstrates readiness is enforced only when relevant, and no additional document mutation occurs during Preview.
- This acceptance used exactly **one** existing synthetic TradeLink QA document across create and edit. No real customer, operational document, credential, module role, RLS policy, external attachment or production workflow state was modified.

**Disposition:** CP-TL-FUNC-02 complete within scoped acceptance. A real greater-than-50-document signed pagination session was not run because the authorized listing has only two active records; disposable PostgreSQL tests cover actual multi-page keyset behavior. Submit/Review/Approval/Completion/PDF/Attachments remain separate unactivated functionality, not part of this release.
