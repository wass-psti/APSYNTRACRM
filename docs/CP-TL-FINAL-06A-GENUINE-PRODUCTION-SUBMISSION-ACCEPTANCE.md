# CP-TL-FINAL-06A — First Genuine Signed Production Submission Acceptance

**Date:** 2026-11-17, 14:33 Philippine time (UTC+08)
**System:** APSYNTRA CRM — TradeLink
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`
**Scope:** Explicitly approved production QA Quotation `Q-QA-20261108-01` only.

## Owner authorization

The operator gave explicit document-specific approval to submit `Q-QA-20261108-01`, revision 5, for the CP-TL-FINAL-06 acceptance. This authorization did not include submitting other records, creating synthetic commercial documents or modifying roles/security/grants. Existing production migration `20261117060100` and Submit frontend were already deployed before this acceptance.

## Signed production transaction — VERIFIED

- **Document ID:** `17fb2227-a0b0-4ff0-9e58-105640d719a7`
- **Board ID:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`
- **Board item ID:** `8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10`
- **Transition:** `draft`, revision 5 → `submitted`, revision 6
- **Production committed at:** `2026-11-17 06:33:26.09138+00` (14:33:26 Philippine time)
- **Transport:** Exact `public.tl03_document_submit(uuid,uuid,bigint)` Supabase REST RPC called once from the authorized signed Chromium browser session with its already authenticated access token retained inside that browser. HTTP 200. The server's existing session/board/workspace/manager/CAS enforcement remained authoritative; no direct SQL DML or service-role credential was used.
- **Server receipt:** `documentId` unchanged; `boardItemId` unchanged; `revision=6`; `state=submitted`; `operation=submit`; `from=draft`.
- **Audit:** Exactly one `submitted` event for document revision 6, matching `actor_id=updated_by`, `metadata.action=submit`, `metadata.from=draft`, `metadata.to=submitted`.
- **Immutable history:** Exactly one matching revision 6 snapshot (content, document identity/number/type, Board identity, state). Revision 5 Draft snapshot retained.
- **Board projection:** Exactly one current Board item with matching ID, number/title, update timestamp and actor.
- **Signed UI readback:** After refreshing the authenticated All Documents tab, the row displays `Submitted`, revision `6`; Submit Draft is no longer offered and Print PDF remains disabled, consistent with Approved-only printing.
- **Production baseline after change:** Three active documents, sixteen immutable snapshots and one legacy Submit event. The two other current Quotations remain unchanged: `CP-TL-08C-QA-20261112-01` Approved revision 2 and `Q-CP-TLFUNC02-20261112-01` Draft revision 2. All three retain matching current snapshots/Board projections.

## Acceptance distinctions and follow-ups

The native Chromium confirmation dialog could not be reliably accepted through remote AppleScript automation on initial UI click attempts. Those attempts made **no database changes**. The single successful transaction was the exact authenticated RPC from the same signed browser session, followed by an independent production database and signed UI readback. Therefore the **signed backend lifecycle and refreshed UI readback are VERIFIED**, while an uninterrupted mouse-click → browser confirmation → UI commit path is **NOT INDEPENDENTLY VERIFIED** and should not be misrepresented as such.

Running `sql/tests/cp-tl-final05-production-readonly.sql` as a production read-only query (matching its source) now reports **Quotation TRUE**, and ESI/DR/Payment AR/PO/Packing List FALSE. Genuine six-module business coverage is **1/6**, not 6/6; the five remaining modules have no current active production documents. No additional code migration, new role, or security controls are indicated by this successful transaction.

A legitimate future record for each remaining module can be submitted through normal business operations, with each event verified using the read-only acceptance audit, immutable revision, Board projection, and refreshed authorized All Documents view. Do not create commercial documents solely to manufacture acceptance history.

**Milestone classification:** CP-TL-FINAL-06A — **VERIFIED** for the approved Quotation's signed Submit transaction and post-commit lifecycle readback. Complete six-module production acceptance — **PENDING (1/6)**.
