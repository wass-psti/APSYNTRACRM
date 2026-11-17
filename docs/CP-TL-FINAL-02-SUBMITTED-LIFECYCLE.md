# CP-TL-FINAL-02 — Legacy Submitted workflow / six-module acceptance

**Date:** 2026-11-17. **Base:** current APSYNTRA CRM `main`. **Application:** TradeLink.

## Canonical behavior preserved

Normal Save remains For Approval by default; Draft must be explicitly selected. The existing revision-bound two-reviewer approval and historical Approved revision/PDF workflow are not reinterpreted or disabled. The legacy source's **Submit Draft** path is distinct: ESI, Quotation, Supplier PO, Delivery Receipt and Payment AR enter `Submitted`, while Packing List enters `Completed` directly. An Approved document cannot use Submit Draft to bypass `Revise Approved`.

## Implemented in this increment

- All Documents renders its staged Submit action only for unarchived `Draft` and `Revision Required` documents, never for `For Approval`, `Approved`, `Submitted` or terminal records. It remains visibly disabled until the backend is activated.
- The synthetic UI acceptance iterates all six document types across nine states, verifying exact submission eligibility; unauthorized accounts remain denied by the existing UI contract.
- The existing PostgreSQL 17 disposable submission test now includes successful ESI, Delivery Receipt, Payment AR and Supplier PO signed submissions in addition to previously tested Quotation and Packing List. For each fixture, check persisted workflow state, revision, content, Board item and transition event.
- The existing PostgreSQL 17 workflow is now eligible to run on scoped pull requests rather than waiting for a merge-to-main workflow invocation.

## Production deployment boundary

The existing guarded SQL candidate `sql/tradelink-document-submit-candidate.sql` is source-only and **not installed in production**. Read-only catalog inspection confirmed `public.tl03_document_submit(uuid,uuid,bigint)` is absent; the legacy event-operation CHECK still has only create/update/archive/restore entries. `TL03_WORKFLOW_SUBMIT_ENABLED=false` must remain unchanged until reviewed SQL is activated and signed runtime acceptance passes. Do not execute this SQL against production just to complete tests. Existing `TL03_WORKFLOW_REVIEW_ENABLED`, `TL03_WORKFLOW_DECISION_ENABLED` and `TL03_WORKFLOW_OPERATIONAL_ENABLED` also remain false: these are independent lifecycle candidates, not authorized automatic production activations.

The candidate is integrated with the repository's existing signed Board, workspace and session checks. No additional role, approval layer, RLS policy or alternative document engine is introduced.

## Pending genuine parity acceptance

1. Verify the production SQL candidate's compatibility with the latest canonical revision snapshots, audit and current Save RPC, using a PostgreSQL 17 source-faithful disposable environment; the older synthetic fixture alone is not full production-source replay.
2. Obtain the separate production schema/write-activation authorization when appropriate, then apply only the reviewed migration, verify the exact RPC contract, and enable the Submit feature only after activation.
3. Execute actual signed-user ESI, PL, DR, AR, Quotation and PO submissions with permitted real business records, verifying Board and All Documents readback and exact revisions. Do not fabricate production documents.
4. Retain the existing For Approval two-reviewer path; verify no Submitted state is mistakenly treated as Approved or print-eligible. Follow-on legacy Review/Decision/Operational transition features require their corresponding reviewed backend activations.
5. Genuine post-approval supersession and historical PDF comparison remain a separate outstanding CP-TL-FINAL gate.

**Status:** Scoped UI parity and six-type disposable acceptance IMPLEMENTED; production Submitted workflow **PENDING** and must not be described as live.
