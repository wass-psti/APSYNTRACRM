# CP-TL-FINAL-09 — Source parity and controlled automatic-numbering activation candidate

**Date:** November 17, 2026. **Project:** APSYNTRA CRM / TradeLink. **Existing Supabase:** `jtlusodorfnyzgyuewkz`.

## Production preflight (read only)

- Existing migration `20261116070000` is already installed. The production `public.tl03_document_create(uuid,uuid,jsonb,text)` and `private.tl03_create_document(uuid,uuid,jsonb,text)` functions exist.
- `authenticated` has EXECUTE on the public wrapper; `anon` does not. The private sequence table is installed and contained **zero rows** at inspection. No new project, DDL, RLS or grants required.
- The server allocates per-board/workspace/type source-derived prefixes `ESI-`, `PL-`, `DR-`, `AR-`, `Q-`, `PO-` starting at `011130`, reconciles existing documents under a sequence lock, and uses the existing transactional TradeLink save. It preserves existing assigned numbers during revisions. Those behaviors have disposable database acceptance but not genuine production-create acceptance.

## Implemented in this **unmerged** candidate

- Switch only `TL03_AUTOMATIC_NUMBERING_ENABLED` to true. All six unsaved create forms display an initially blank read-only document number and instruct that the server assigns it when the first save succeeds.
- New creates use the already implemented signed `tl03_document_create` RPC with one stable document ID and no client-supplied number; updates remain on existing revision-aware save.
- Keep the original manual-number create path testable under an explicit disabled client override. Existing source-document numbers and all previous revisions are untouched.
- Update the in-app user manual to reflect the candidate mode rather than claiming manual numbering remains active.
- Keep default Save → For Approval, the two-reviewer workflow, source Submit action, Approved-only PDF, independent other legacy feature flags and current role/session/workspace checks unchanged.

**Important operational boundary:** This branch/PR is a **production-write-path activation candidate**, not a deployed feature. Merging it would change document creation to server-assigned numbers. It must remain a draft PR until the user explicitly approves production automatic-number activation after CI and a signed nonproduction acceptance plan. The current production frontend flag stays OFF. No commercial records should be created solely to manufacture acceptance evidence.

## Independent remaining acceptance

1. Verify all six source type prefixes, stable create retries and no number consumed on failed create in disposable PostgreSQL; verify concurrent uniqueness and existing-number reconciliation.
2. Confirm end-to-end actor/session, workspace, Board and current signed create flows in the isolated browser. Check after-refresh All Documents and Board persistence, document number and revision, and old document preservation.
3. On separate operational approval, merge the tested candidate with normal checks, confirm exact commit Pages deployment and signed UI. A real first production create requires a separate document-specific business basis and post-write audit.
4. Other genuinely untested production source transitions remain PENDING: ESI, Delivery Receipt, Packing List, Payment AR and Purchase Order. All five have zero active production business records. Archived QA fixtures are preserved and not silently restored or submitted.

**Status:** code candidate IMPLEMENTED-UNVERIFIED for real signed create, local and CI checks required; production automatic numbering NOT ACTIVATED, genuine six-module business acceptance remains **1/6**. Other legacy parity gaps (electronic QR issuance, disaster recovery, customer/vendor directory, bank instruction contracts, operational workflow state toggles) remain separate and unverified.
