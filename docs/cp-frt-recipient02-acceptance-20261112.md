# CP-FRT-RECIPIENT-02 — Signed saved recipients and private QR retrieval

Date: 2026-11-12. Scope: the existing WatchdogWorkspace FRT, current Supabase project and the FRT New Fund Request recipient step. **No additional project or role.**

## Verified existing contracts

- `frt_create_request(uuid,jsonb)` accepts `recipientName`, `recipientBank` and `recipientAccount` but does not save reusable account-holder metadata or a saved recipient identifier.
- Existing `frt-attachments` storage bucket is **private**, max 15 MiB, and its authenticated Storage object policies require existing active workspace FRT membership. It has SELECT / INSERT / DELETE policies; no storage policies or bucket settings are modified in this increment.
- Existing `frt_register_attachment` applies to *saved Fund Requests* and does not support a reusable recipient QR before a request is submitted. It is not reused incorrectly.
- No existing `frt_saved_recipients` table, saved-recipient list/write RPC, or QR reference RPC is installed. Direct client table operations are not appropriate.

## Proposed additive recipient contract — production activation pending

`sql/cp-frt-recipient02-CANDIDATE.sql` creates a workspace+company+creator scoped private saved-recipient address book with recipient name, account holder, bank, account number, optional QR object path, creator and timestamps. The table is RLS-enabled and directly denied to `anon` and `authenticated`; access is only via three signed RPCs:

- `frt_list_saved_recipients` lists at most 200 creator-owned records for a specific signed workspace/company FRT member, with QR references but no downloadable public link.
- `frt_save_recipient` creates a saved account only in an existing authorized company. Requires bounded, nonblank details; returns just the new ID, not secrets via a broad table grant.
- `frt_set_recipient_qr` atomically registers an explicitly uploaded image for an existing saved recipient owned by the signed user. It validates the exact workspace/recipient path, private bucket, authenticated owner, stored image MIME type and expected previous path. Stale/mismatched writes fail. It does not change the existing Storage membership policies.

The private QR client accepts only PNG/JPEG/WebP under 3 MiB and checks file magic bytes. It uploads under an unguessable path `workspaceId/recipients/recipientId/randomUUID.ext` with upsert disabled, then saves a matching reference via the signed RPC. It independently rereads the saved record before reporting verified success. Private QR viewing requires the same signed scope, a matching database reference and a short-lived Storage signed URL on explicit user interaction; no public QR URLs are emitted or persisted.

## Frontend compatibility and behavior

The three-step wizard includes a saved-account selector, account-holder field, explicit **Save Recipient Account**, optional QR input, **Upload QR**, and **View private QR**. These controls remain disabled if the signed recipient RPC is absent, while the existing manual recipient/bank/account inputs and Fund Request submission continue to work. Company switching clears previously selected account/QR state and retrieves only that company's saved records. No silent account save, no new schema grants, and no fake persisted data.

## Verification / release gates

- Frontend unit/regression and real isolated Chromium navigation, style, startup/privacy acceptance.
- Disposable PostgreSQL 17: table access denials, company-separated read, signed recipient creation, foreign member denial, QR object-required link, stale QR CAS denial, and signed readback with rollback. No real production account or storage object created.
- **Deployment boundary:** frontend-compatible code can ship with recipient capability disabled until verified. Production schema/RPC installation is a separate activation because it introduces a new sensitive bank-data table and new authenticated RPC permissions. Do not claim persistence on production until installed and genuinely signed read/write acceptance is completed.

## Remaining semantics

Saved account holder name and QR belong to the reusable saved recipient. The existing financial request stores the selected recipient name, bank and account number but not a foreign-key link to the saved recipient or QR. Request-linked QR display and any legacy document attachment synchronization would require separately verified contracts. No production approval/status, roles, RLS ceiling, or financial records are altered here.
