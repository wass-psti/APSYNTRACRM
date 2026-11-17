# CP-TL-FINAL — Legacy workflow parity checkpoint (2026-11-17)

## Baseline and acceptance boundary

Compared the existing CRM TradeLink native integration with the source-derived contracts in `docs/CP-TL-WF01.md`, `docs/CP-TL-APP02-SOURCE-AUDIT.md`, `docs/CP-TL-LEGACY-WORKFLOW-01.md` through `03.md`, and `docs/CP-TL-NATIVE-01-TRADELINK-INTEGRATION.md`. This is not a blanket certification of legacy parity. No production document writes, migration, grants or role changes are part of this increment.

## Supported product contract

| Capability | Current evidence | Classification |
| --- | --- | --- |
| Six document forms, line items, commercial calculations and company templates | Existing native host, editors and focused regressions | IMPLEMENTED; full real six-type production acceptance pending |
| Persistent create, exact read, revision and All Documents | Existing signed RPCs, Board linkage and previous production checks | VERIFIED for historical quotation path; other document types pending |
| Save defaults to For Approval, Draft is explicit | Current UI and two-review contract | VERIFIED in existing tests |
| Two separate reviewer validations, then Approved | Approved quotation revision 2 has two distinct reviewer records | VERIFIED for historical quotation |
| Approved-only print and immutable revision snapshot | Canonical historical PDF tests and installed snapshot RPC | VERIFIED in disposable tests; genuine new supersession PDF pending |
| Read-only analytics | Installed signed aggregate RPC; frontend enabled | IMPLEMENTED; genuine signed-browser visual acceptance pending |
| Automatic numbering for six types | Installed migration `20261116070000`, tested disposable sequence; frontend flag false | IMPLEMENTED-NOT ACTIVATED for production creation |
| Original Submitted stage and its source-specific per-module transitions | Staged client/read-only reference, backend mutation flags false | PENDING; not equivalent to default For Approval dual-review path |
| Dynamic QR verification and electronically issued PDF | Print/Save-as-PDF is browser output, not a signed electronic issuance | PENDING independent issuer/verification contract |
| Disaster Recovery Console | No source-backed backup/restore contract or rehearsed restore | PENDING; do not invent restore features |
| Payment bank instructions and supplier/customer directory | No confirmed authoritative profile/directory data contract | PENDING external business-data contract |
| Item-level discussions | Existing Board collaboration contract separate from TradeLink | PENDING separate integration decision |

## Scoped defect corrected

The editable manual document-number input previously told users the *database migration* was awaiting activation, even though the additive sequence migration is installed. The new help text distinguishes the installed database capability from the disabled production automatic-create feature. The manual-number field, signed save path, numbering flag, and persisted values remain unchanged. A focused render regression now preserves this distinction.

## Genuine final acceptance criteria still outstanding

1. On a legitimately authorized business revision, retain and compare the existing approved revision and its historical PDF, then save a changed For Approval revision, obtain two fresh signed reviews and compare the new approved PDF. No test-only alteration to a real Approved document.
2. Reopen both revisions, refresh the signed All Documents list and Board item, and verify document number, company, actor, revision, approval status and business/financial content against persisted snapshots.
3. Verify all six module-specific source fields and lifecycle transitions using nonproduction source-derived fixtures; treat intentionally disabled Submitted/automatic-number/QR/recovery features as explicit parity gaps until separately implemented and activated.
4. For production automatic numbering and legacy Submitted mutations, first verify the exact installed server RPC contract and conduct disposable transaction/concurrency acceptance. Enabling new production write behavior requires distinct operational authorization; do not flip flags merely to pass parity.
5. Do not claim signed-browser acceptance from the available read-only browser tab, mock DOM tests or a successful CI build.

## Decision

This increment does not claim CP-TL-FINAL closure. Existing production functionality was preserved and a misleading activation message was corrected. Remaining items are product parity and genuine acceptance gaps, not a reason to replace the established TradeLink architecture or introduce new authority controls.
