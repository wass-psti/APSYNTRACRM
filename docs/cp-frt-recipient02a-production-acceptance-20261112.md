# CP-FRT-RECIPIENT-02A — Genuine signed production activation and QR acceptance

Date: 2026-11-12 (Asia/Manila). Existing Supabase project: `jtlusodorfnyzgyuewkz`. **No new project, role, or Storage policy.**

## Production activation — VERIFIED

Applied the exact merged, creator-only SQL candidate `sql/cp-frt-recipient02-CANDIDATE.sql` to the existing project using a recorded migration named `cp_frt_recipient02_creator_scoped_saved_accounts_private_qr_20261112`. The new `public.frt_saved_recipients` table is RLS enabled with no direct authenticated/anonymous table grants. Authenticated EXECUTE is enabled only for `frt_list_saved_recipients(uuid,text)`, `frt_save_recipient(uuid,text,text,text,text,text)`, and `frt_set_recipient_qr(uuid,text,uuid,text,text)`. Anonymous execution is denied for all three. The read RPC applies `sr.created_by=auth.uid()` as well as existing signed workspace/member and company guards.

Pre-activation: table and RPCs absent; 0 FRT requests, 0 FRT storage objects. Post-activation: all three RPCs installed, original `frt-attachments` bucket remains PRIVATE, original 3 Storage policies unchanged, no direct authenticated bank-table read/update grants.

## Genuine signed Chromium acceptance — PASS

Reused the Mac's already signed Chromium session without exporting access tokens or altering browser settings. Finance navigation and 3-company selector loaded; no browser errors. Created a **clearly synthetic, nonfinancial** QA recipient in company WAO through the live New Fund Request → Recipient UI. The signed API returned a new record, and the UI independently reread it and displayed `Recipient saved and verified.` The Fund Request form itself was **not submitted**, so no financial voucher was generated.

- QA recipient ID: `a603d2a6-71c8-4019-983d-7112b3f1de4a`.
- QA name: `CP-FRT-RECIPIENT-02A-QA-20261112` (synthetic bank/account details only; no genuine payment coordinates).
- Uploaded a generated PNG test graphic of **2,415 bytes** using the signed private QR upload control. Storage object path contains signed workspace and recipient IDs; `frt_set_recipient_qr` performed the atomic reference update. UI reloaded from the authoritative list and displayed `Private QR saved and verified.`
- A full application reload and reopening the creation wizard returned the same QA recipient, account-holder/bank fields and linked private QR reference.
- Independently obtained a 120-second signed PRIVATE URL in the authenticated browser, fetched the real image binary, confirmed `HTTP 200`, MIME `image/png`, valid PNG magic bytes and **2,415-byte** exact size. No token or signed URL was logged or saved to documentation.
- Production company isolation: signed recipient-list counts `WAO=1`, `WASS=0`, `PSTI=0`.
- Production metadata query independently verified the QA row, same company, linked QR path, existing binary object and MIME `image/png`.
- Post-test FRT financial request count **0** and request/filing audit events **0**.

## Verification classification

- Schema/RLS/grants: **VERIFIED**.
- Same-user signed create, reference update, full refresh and reopen: **VERIFIED**.
- Private QR binary upload and download byte round-trip: **VERIFIED**.
- WAO/WASS/PSTI company-scoped reads: **VERIFIED**.
- Foreign-member/creator-denial cases: **VERIFIED in disposable PostgreSQL acceptance**, not yet exercised with a second genuine production FRT session.
- Production test fixture cleanup: **PENDING SEPARATE AUTHORIZATION** for destructive removal of exactly the new QA row and its private QR object. No preexisting financial/customer rows were modified. The QA row/object are intentionally retained pending that authorization; do not accidentally treat them as real bank/payment accounts.

## Follow-on scope, only if requested

`CP-FRT-RECIPIENT-02B — Exact QA Recipient/QR Fixture Cleanup and Second Signed-User Isolation Acceptance` would require explicit deletion authorization and a second genuine permitted FRT member session. No broader FRT role or platform policy change is needed.
