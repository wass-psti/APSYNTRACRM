# CP-TL-FINAL-08 — Five-module readiness and advisory Submit preflight

**Date:** 2026-11-17. **Project:** APSYNTRA CRM / TradeLink. **Production Supabase project:** `jtlusodorfnyzgyuewkz`.

## Source-backed gap and implementation

The installed signed Submit RPC validates source-required data for each module, but All Documents previously offered Submit Draft without any nonmutating way to see which fields need correction. This can lead to avoidable rejected submission attempts. The new **Check readiness** control is an explicitly advisory, read-only action beside Submit Draft on unarchived, currently eligible Draft or Revision Required records. It does not create a record, persist content, invoke a mutation RPC, or change the signed Submit behavior.

The host checks the existing authorized All Documents session and Board-manager context, reads the exact signed document through the existing `tradeLinkDraftWorkspace.read`, and verifies that ID, revision, source type, document number, Board item, workflow state, and archive status still match the signed list before displaying advisory results. Errors never turn into a success message. The source-specific readiness module `frontend/tradelink-submit-readiness.js` reports missing *field labels*, never user-entered or customer data.

The advisory covers ESI TIN / verification / approval; DR shipment reference / checked-by / delivered-by; Packing List shipment reference; Payment AR amount / particulars / receipt / verification / cheque details; PO delivery date / terms / verification / approval; Quotation contact / validity / delivery / terms / approval; all applicable modules additionally require identity consistency, customer/supplier and line-item completeness. Expected destinations: five types `Submitted`, Packing List `Completed`.

The final signed PostgreSQL function remains authoritative. `Check readiness` is not a server-success prediction, never disables Submit Draft, and cannot override server checks or create new privileges. Existing Save → For Approval → independent two-reviewer approval and Approved-only PDF are unchanged. This introduces no new database migration, RPC grant, RLS, role or operational feature flag.

## Live business acceptance boundary

Read-only production inventory: three active Quotations (one Approved, one Draft, one Submitted); one genuine Quotation Submit event/immutable revision 6 and exact Board readback; five other modules have zero active records and two archived QA Drafts each. The archived test records remain untouched. Hence genuine live business acceptance is **1/6**, pending real business data and document-specific submission approvals. No synthetic invoice, cash receipt, shipment, PO or other production transaction was made for this implementation.

## Verification criteria

- Six module valid and missing-field fixtures; source-specific destination; cheque amounts; incomplete line items; stale document-number identity; no raw private values in UI message.
- Readiness action visible only for current eligible manager-list rows and never for archived, Approved, Submitted or unassigned rows.
- The host action always uses the signed exact document read and refuses stale revision/state identity; no submit/save/commit/RPC inside its code path.
- Full TradeLink regression, frontend suite and production build; PR CI and exact GitHub Pages deployment.
- After deployment, signed All Documents should show Check readiness and Submit Draft for an active eligible Draft. A refreshed read-only preview must leave the document unchanged. Do not claim six-module production acceptance from local fixture coverage.

**Expected status:** functional advisory implementation VERIFIED after CI + signed read-only browser acceptance; five-module business submission acceptance remains PENDING.
