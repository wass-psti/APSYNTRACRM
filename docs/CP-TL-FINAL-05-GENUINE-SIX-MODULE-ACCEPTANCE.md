# CP-TL-FINAL-05 — Genuine signed six-module business acceptance

**Date:** November 17, 2026 | **Project:** APSYNTRA CRM / TradeLink
**Production Supabase project:** `jtlusodorfnyzgyuewkz`

## Source of truth and production preflight

Read-only production inspection established exactly three current, nonarchived documents, all **Quotation**: one Approved at revision 2 and two Drafts at revisions 2 and 5. All three have exactly one current matching immutable snapshot and one matching current Board item. The database holds 15 revision snapshots and zero genuine `submitted` / `completed` event operations. Production migration `20261117060100` and the authenticated Submit RPC are installed. The live frontend Submit activation was verified in CP-TL-FINAL-04; a previously opened signed browser tab still displayed old guide text, so that tab is *not* refreshed-runtime acceptance evidence.

No ESI, Delivery Receipt, Payment AR, Purchase Order or Packing List document is present among active production records. The two existing Draft Quotations might be business records; do not assume either is a disposable acceptance fixture. No production document was created, edited, submitted, or archived for this milestone.

## Acceptance matrix

| Module | Legacy Submit destination | Live document evidence | Genuine signed transition + revision / Board readback |
| --- | --- | --- | --- |
| ESI | Submitted | 0 current | PENDING |
| Quotation | Submitted | 3 current; 2 Drafts | PENDING (no Submit events) |
| Purchase Order | Submitted | 0 current | PENDING |
| Delivery Receipt | Submitted | 0 current | PENDING |
| Payment AR | Submitted | 0 current | PENDING |
| Packing List | Completed | 0 current | PENDING |

**Production business acceptance coverage: 0/6.** This is a coverage denominator, not an implementation quality percentage. All six paths have already passed signed disposable PostgreSQL 17 acceptance in CP-TL-FINAL-03/04 CI; that is not proof of genuine real-business production transitions.

## Read-only repeatable post-event verification

`sql/tests/cp-tl-final05-production-readonly.sql` is a transaction-level READ ONLY audit. It reports per-module historical event acceptance, immutable revision snapshot consistency and current Board item identity. It deliberately compares historical event snapshots to the **historical revision**, not the current document content, which can legitimately change after supersession. The second result summarizes snapshot and Board mismatches and verifies the Submit RPC grants. The audit neither creates evidence nor submits documents.

When legitimate business records are ready, have the signed current manager execute the intended Submit Draft action, then verify *each* of the six module outcomes through signed browser readback (document, All Documents, Board) and this read-only SQL audit. Confirm UI confirmation, stable document numbers, revision +1, correct from/to event and actor, immutable source snapshot, post-refresh persistence, stale/duplicate rejection, and Approved-only print gating. Keep normal Save → For Approval → two distinct validations → Approved separate. Do not treat Packing List Completed as Approved or as financial settlement.

## Remaining proof and boundary

- **VERIFIED**: prior merged and deployed Submit RPC/frontend, six-module signed disposable fixtures, and three existing production document/snapshot/Board identity projections.
- **PENDING**: refreshed signed browser readback on the current release; real business Submit action for each source module; independent signed post-write evidence; historically approved PDF supersession acceptance where applicable.
- **BLOCKED by missing real business evidence**: five modules have zero active production records, and existing Draft Quotations were not authorized for conversion solely for testing.
- **NOT REQUIRED**: new role restrictions, a second document engine, another database project or a new production migration.

Do not classify CP-TL-FINAL-05 as full production business acceptance until the six independent real outcomes exist and can be audited. If a genuine business transaction later fails, open a narrow defect based on its precise signed RPC response and authoritative document/Board state.
