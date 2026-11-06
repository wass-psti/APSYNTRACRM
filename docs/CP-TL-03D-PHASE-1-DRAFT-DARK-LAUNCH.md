# CP-TL-03D / Phase 1 — TradeLink Draft interface integration and controlled dark launch

**Date:** 2026-11-06 (Asia/Manila)  
**Target:** APSYNTRA CRM existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`, existing WatchdogWorkspace project `jtlusodorfnyzgyuewkz`.  
**Disposition:** **IMPLEMENTED / automated frontend acceptance VERIFIED (1,097 PASS / 0 FAIL).** Deployed authenticated browser UX acceptance remains separate. **Domain reads and Draft writes are not activated in production**; Stage B EXECUTE grants are not authorized by this milestone.

## Completed frontend integration

The existing TradeLink application shell `frontend/tradelink-application.js` now accepts `drafts` as a route section and adds **Draft workspace · Staged** to its scoped application navigation. The route is:

`https://wass-psti.github.io/APSYNTRACRM/#/boards/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/tradelink/drafts`

This route must be entered with an existing properly signed APSYNTRA CRM account authorized for the board. It is not an independent authentication system. The UI does not fabricate persisted Drafts or redirect to an unrelated board.

The new `frontend/tradelink-draft-workspace.js` provides:

- A source-aligned draft preparation form for **Electronic SI, Packing List, Delivery Receipt, Payment AR, Quotation and PO to Suppliers**.
- Controlled `documentNumber`, customer/supplier, reference, currency, VAT, remarks and a bounded optional single line item. Fields correspond to the existing SQL Draft envelope. Full original TradeLink source form / finance / attachments / approval steps are deliberately outside this Phase 1 subset.
- A working **Validate locally** button that parses FormData, rejects invalid document identifiers/currency/VAT/line-item values, and explicitly says **nothing saved or transmitted**.
- A disabled **Create Draft / Save revision** button while the production write flag remains false, with no local-storage/IndexedDB fallback or false success message.
- A non-fabricated **Authoritative Draft records** area that will only list server-authorized documents when the existing `TL03_DOMAIN_READS_ENABLED` flag becomes approved; it displays no synthetic records in the current dark launch.
- Future row-bound **Read / Archive / Restore** controls guarded by server-authorized list data, current signed workspace and board ownership, authoritative revision/CAS, and the existing domain client's own server-facing contract. They are inaccessible or disabled under the current dark-launch flags, and hidden on role-loss.
- An in-memory, session-scoped `pendingCreateId` to retry a revision-zero Draft with its original ID after an uncertain response, using the server's create-idempotency guard instead of allocating duplicate IDs.

The existing `frontend/app.js` mounts the draft view only for the genuine TradeLink board, ties state to the current signed user, workspace and route, clears it on signed-identity changes and route reload, and handles local validation and future approved create/update/archive/restore through `TradeLinkDraftWorkspace`. The wrapper calls the existing `TradeLinkDomainClient`, not a new endpoint, second role store, service-role key, or local cache. `frontend/tradelink-application.css` provides responsive, accessible scoped form layout.

## Technical security and activation boundaries

`frontend/tradelink-domain-client.js` still defines:

```js
export const TL03_DOMAIN_READS_ENABLED=false;
export const TL03_DOMAIN_WRITES_ENABLED=false;
```

These flags are **defense-in-depth UX release controls**, not database authorization. In production, `authenticated` still lacks EXECUTE on both `private.tl03_commit(uuid,uuid,bigint,text,jsonb)` and `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)`. Existing Stage A read/list and RLS contracts remain the only active TradeLink domain APIs. No SQL migration, GRANT/REVOKE, RLS policy, account, role, membership, audit row, document, or record was modified by this frontend milestone.

All requests to open/list/commit must pass through the existing signed user's API and the server's `private.tl03_can_manage` guard, including valid current auth session, module General Manager role, board `manage`, same workspace and exact board. Server Draft commits use revision/CAS, append-only audit and linked board projection. The app does not claim live Create/Edit/Archive/Restore behavior until the Stage B permission and signed production write acceptance gates pass.

The user previously directed the Stage B workstream forward and attested that the backup concerns are acceptable. That did not independently establish a restorable backup, named incident/change owner, or verified fresh source-integrity pregrant check. The separate production Stage B authorization and recovery decision are tracked in `docs/CP-TL-03C-PHASE-3B-RECOVERY-AND-PERMISSION-DECISION-2026-11-06.md` and remain distinct from this **frontend-only dark launch**.

## Acceptance evidence

New focused regression suite: `frontend/tests/tradelink-draft-workspace.test.mjs`. It verifies:

1. Route mounting in the existing TradeLink signed shell and disabled record persistence.
2. Rejection of foreign workspace and wrong board.
3. **Zero auth/RPC invocations** when production domain flags are false, including list/read/create/archive denial.
4. Source Draft enum and numeric/payload validation.
5. Redaction of stale selected document data when source reads are disabled.
6. Route, session reset, ephemeral state and absence of browser persistence/privileged credentials.

Original local validator initially missed an invalid currency; this was reproduced as one CI test failure and fixed by enforcing the server currency and VAT enums. A later test was corrected after the new role-loss/redaction behavior made stale document content invisible entirely. The latest accepted **GitHub Actions frontend job** for commit `46b7a87e1e92fd63f1d033513b04f967e61d822b`, run `42196153273`, job `127819788934`, showed **1,097 total / 1,097 pass / 0 fail**; PostgreSQL/OT/collaboration jobs in the same workflow succeeded. Evidence: https://github.com/wass-psti/APSYNTRACRM/actions/runs/42196153273. Earlier failing intermediate runs are superseded only by this complete green head.

**Deployment:** GitHub Pages build/deploy must be checked independently at the final document/implementation HEAD; a successful CI build does not prove signed-user browser functionality. The actual deployed signed Draft form, keyboard accessibility, refresh/session-loss behavior and future authorized server write path remain runtime acceptance steps and are **not claimed as completed** here.

## Next required gate

**CP-TL-03D / Phase 2 — Deployed signed Draft dark-launch UI acceptance and authorization-denial regression.** With the current Manager and HR accounts, verify the Draft route renders only for the correct TradeLink board, local validation sends no server write, disabled Create/Update/Archive/Restore cannot call domain commit, and navigating/switching identity discards unsaved state. Record nonsecret evidence; do not collect JWTs or document contents. Maintain both flags OFF and SQL write grants withheld.

Separately, Stage B controlled production activation remains subject to accountable change ownership, approved recovery posture, the full fresh source-integrity preflight and separate production permission/data-operation approvals. **Do not use this UI gate to bypass production security controls.**
