# CP-TL-FINAL-04 — Frontend Submit activation and runtime acceptance

Date: 2026-11-17. Existing Supabase project `jtlusodorfnyzgyuewkz`.

## Activation evidence and exact scope

The previously approved production migration `20261117060100_tradelink_submitted_workflow_activation.sql` is recorded in migration history and `public.tl03_document_submit(uuid,uuid,bigint)` is installed. Authenticated EXECUTE is present, anon EXECUTE is absent. Production read-only baseline before this frontend release: three active documents, one Approved document and fifteen immutable revision snapshots. No production document modification has been authorized or performed for this release.

Frontend `TL03_WORKFLOW_SUBMIT_ENABLED` is now true. No other TradeLink workflow flag is activated; the existing Save to For Approval default and two assigned reviewer approvals remain unchanged. The existing delegated Submit handler requires a signed manager, current authorized All Documents view, unarchived Draft/Revision Required record, confirmation, exact revision-bound RPC receipt and read-after-write reconciliation of document, All Documents and Board projection. Pending or uncertain commits never claim success.

Original-source module transitions for the separate legacy Submit path:

| Module | Submitted action result |
| --- | --- |
| ESI, Quotation, Purchase Order, Delivery Receipt, Payment AR | Draft / Revision Required -> Submitted |
| Packing List | Draft / Revision Required -> Completed |

The UI manual now distinguishes this path from the default For Approval review route. Other staged legacy Review/Decision/Operational and PDF-issuance/automatic-numbering flags remain off.

## Acceptance boundaries

- Verified: installed production RPC contract, migration and grant readback from prior CP-TL-FINAL-03; CI PostgreSQL 17 exact migration with six-module signed synthetic fixture, snapshot and Board projection.
- Verified: frontend RPC transport and exact receipt; rejected invalid inputs and denied manager session; user-visible Submit affordance only for active Draft/Revision Required and manager context; source manual updated.
- Pending: actual signed production *write* acceptance. User's general authorization does not authorize manufacture of accounting, commercial or delivery history. Do not submit a genuine business document without a legitimate authorized document-specific action. Use existing signed browser for nonmutating UI checks, and verify real submissions only when justified business records exist and owner accepts their state changes.
- Preserve current production document counts, approval evidence and snapshot integrity until any legitimate business transaction occurs. A build/Pages deployment and a synthetic browser/SQL test do not certify real signed production submission.

## Rollback and operation

The frontend Submit feature is isolated to a single constant; a focused frontend rollback can restore the disabled affordance without changing the installed backend migration or destroying persisted records. Do not reverse live schema or erase a submitted record to simulate rollback. The signed backend retains existing role and workspace checks; no new authorization system was added.

## Completion boundary

CP-TL-FINAL-04 frontend implementation/build/deployment may be VERIFIED once CI and Pages pass, but genuine six-module signed-user production write acceptance remains PENDING until real approved business actions can be observed and read back.
