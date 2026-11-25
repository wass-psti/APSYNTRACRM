# CP-TL-PDF-TEMPLATE-01 — Company-specific quotation print

## Authoritative references

All three supplied quotations use US Letter (612 × 792 pt), Roboto type,
company and document headings, client and commercial fields side by side,
five-column material table, totals, three-column review evidence, terms,
and acceptance lines. WASS uses #ff3d57 / #ffe5e9, OPC #00d748 / #e0f7e9,
and PSTI #009999 / #e0f7f7. Table text uses #1e40af.
The supplied reference files were hash-matched to local copies before
cropping only the company logos (five pixels per point, white paper
background). No customer details, sample document data or complete PDF
reference files are included in the shipped assets.

## Implementation

The saved vendorId/templateId resolver and signed revision/Board
verification stay authoritative. The quotation-specific pure renderer
uses the existing financial engine and saved terms; note rows are unpriced
and unnumbered, descriptions retain line breaks, and prices use the peso
prefix for PHP. The named Letter print page allows browser pagination,
including long rows and repeated table headings. Other five document
module formats remain on their existing A4 paths. The print dialog waits
for available image/font resources before invoking the existing browser
print mechanism.

The commercial/legal content is not replaced by example PDF text.
The saved revision number is used as-is, not the reference's sample Rev 0.
Missing client fields remain blank placeholders. Creator identity is
resolved from the signed current user or existing board member list when
available; otherwise the print explicitly says the name is unavailable.
Reviewer identity is the stored assignment, with a real recorded time
only when present in the revision response. Explicit GM exemptions use
Not Applicable; no additional exemption or automatic approval is added.
The existing browser-copy / non-issued electronic PDF disclosure remains.
Roboto is preferred when installed; Arial/Helvetica is the fallback.
Browser settings and available fonts can change exact pagination; no
pixel-identical or electronic signature guarantee is asserted.

## Reproduce local tests

```sh
node scripts/build-priority5-styles.mjs
node --test frontend/tests/tradelink-*.test.mjs
node scripts/tradelink-historical-reprint-browser-acceptance.mjs
node scripts/cp-tl-quotation-print-browser.mjs
swift scripts/cp-tl-quotation-print-verify.swift /tmp/cp-tl-quotation-print
```

The browser suite generates synthetic WASS, OPC, PSTI and 100-row stress
PDFs. PDFKit on macOS checks actual page dimensions, every priced item
and note marker exactly once, financial total, terms end, approval and
acceptance. Local test outputs are not production business documents.
Use genuine signed approved quotations for final browser acceptance;
no production document should be modified just to exercise print.
