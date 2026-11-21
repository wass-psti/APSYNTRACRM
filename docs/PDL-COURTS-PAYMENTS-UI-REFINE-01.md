# PDL-COURTS-PAYMENTS-UI-REFINE-01 — QR asset presentation recovery

## Scope
The three existing GCash, Maya and BPI administrator cards now use a consistent payment-method heading, saved/unsaved state, contained QR media frame and explicit loading, missing and broken-image fallbacks. Failed image loads no longer display raw browser broken-image glyphs and enlarged alt text. Selecting a new file previews it without implying it is already persisted.

The existing JPEG/PNG validation, 2 MB limit, upload endpoint, recipient field, saved-configuration readback and errors remain unchanged. No backend, database, RLS, roles, financial-state or recipient data were modified.

## Acceptance
- Native Paseo TypeScript/Vite production build: PASS.
- Isolated Chromium full Paseo flow: PASS, including new broken saved-image fallback, replacement preview, successful QR save and deliberate false-positive write acknowledgement denial.
- New QR presentation contract tests: 3 PASS.
- Full CRM tests: 3,276 PASS, 0 FAIL.
- Existing lint and diff whitespace checks: PASS.
- Chromium verified responsive cards at 1440px (three columns), 768px (two), and 390px (one), with no horizontal overflow.
- Broken saved image status is labelled unavailable rather than incorrectly presented as successfully displayed.

## Limitation
The browser acceptance uses synthetic API fixtures and does not verify that every live payment QR URL resolves. When a live image URL fails, the card now presents an intentional recovery state rather than browser error chrome. Correcting a stale or inaccessible stored QR URL requires a legitimate replacement upload through the existing workflow.
