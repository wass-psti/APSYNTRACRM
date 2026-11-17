# CP-FRT-FLOW-03C — Persistent Manual Accounting and Company Profile

## Architecture

CP-FRT-FLOW-03C extends the canonical voucher implementation from PR #455 and CP-FRT-FLOW-03B.

- Existing frt_requests remains the financial request and DV-number source of truth.
- Existing frt_request_items remains the expense itemization source.
- frt_companies receives nullable legal address, contact and logo metadata.
- New frt_request_accounting_lines stores only request-scoped manual debit/credit entries. It is not a voucher document table and does not allocate voucher numbers.
- Existing frt_restricted_request_detail(uuid,uuid) remains the voucher projection and now includes company profile and accounting snapshots.
- Existing private frt-attachments storage remains the company-logo bucket.
- Existing A4 PDF engine and preview/download/print/reprint path remain in use.
- The existing Content Security Policy allows only blob-backed frames for the in-memory PDF preview; it does not enable external frame origins.

No frt_vouchers, frt_voucher_accounting_lines, frt_company_profiles, new counter, new storage bucket, new authentication model or new role hierarchy is introduced.

## Accounting behavior

Each request has 2–100 manually entered accounting lines. Each line contains account code, account name, optional description and one positive debit or credit amount.

- Client validation parses decimal strings into integer cents.
- The server accepts integer-cent values, validates them again and stores exact numeric(14,2) amounts.
- Debit total = credit total = the existing request total.
- Saves lock the existing request row and atomically replace the full line set.
- Every save increments a request-scoped revision.
- A stale expected revision returns SQLSTATE 40001; no rows are replaced.
- Invalid/unbalanced submissions fail before replacement.
- Successful saves write the existing FRT audit log and return the persisted snapshot.
- Preview, download, print and reprint remain disabled while entries are invalid or unsaved.
- PDF generation revalidates persisted debit, credit and request totals before producing output.
- Optional reusable templates are manually authored and stored locally per workspace/company. They store account labels and debit/credit side only; amounts are never prefilled.

The application does not invent chart-of-accounts mappings or account names.

## Company profile behavior

The additive company metadata migration adds nullable fields to the existing WAO, WASS and PSTI rows:

- registered_address
- contact_phone
- contact_email
- logo_path

The profile editor uses the existing active FRT membership and company context. It does not add a company-admin role or a role-specific profile gate. Logo upload/retrieval uses the existing private frt-attachments bucket and existing workspace membership storage policies. Empty company values remain unconfigured; disposable fixtures are not production company data.

## Migrations

Applied to the existing production Supabase project after explicit user approval:

1. 20261117051021_frt_company_profile_metadata.sql
2. 20261117051040_frt_flow03c_request_accounting_lines.sql

These filenames and SHA-256 entries match the exact versions recorded in production migration history. The already-applied 20261116172414 voucher projection is not reapplied. Existing TradeLink versions 20261117020000 and 20261117045417 are preserved and recorded in the branch migration manifest; neither was reapplied. The already-installed WF-05A version 20261116104500 and WF-05B version 20261117010000 migration sources were restored byte-for-byte from their original feature branch to reconcile Supabase migration history; neither was reapplied. They are not part of the isolated CP-FRT-FLOW-03C acceptance harness. The experimental FRT persisted-voucher prototype from a local stash is not used or imported.

The new accounting table has RLS enabled and no direct table grants. Existing authenticated FRT members use the two narrowly scoped signed RPCs:

- frt_request_accounting_snapshot(uuid,uuid)
- frt_save_request_accounting_lines(uuid,uuid,bigint,jsonb)

Both use the existing FRT membership context; neither introduces a new role tier.

## Acceptance

scripts/cp-frt-flow03c-disposable-acceptance.sh creates disposable PostgreSQL 17 from an isolated FRT schema fixture, applies the already-established voucher projection and the two CP-FRT-FLOW-03C migrations only. It does not reapply the already-installed WF-05A or WF-05B migrations.

It verifies:

- all three company profiles persist independently;
- logo object reference uses the existing private bucket;
- original monthly DV numbering remains unchanged;
- balanced accounting entries persist and are returned by the canonical voucher projection;
- exact cents and request totals reconcile;
- stale revisions fail without overwriting;
- unbalanced, negative and two-sided line values fail atomically;
- two concurrent saves against the same revision serialize to exactly one success and one stale-revision conflict.

The SQL fixtures use an existing FRT REQUESTOR membership, not a new administrator role. Test rows are rolled back or contained inside the disposable PostgreSQL container.

The Chromium acceptance script exercises the actual accounting editor, save/readback, exact-cent balance, A4 PDF, download, print and reprint.

## Production status after approved migration activation

Read-only inspection on 2026-11-17 found:

- production Supabase project jtlusodorfnyzgyuewkz ACTIVE_HEALTHY;
- existing voucher projection migration 20261116172414 already applied;
- WF-05A archive and WF-05B monthly voucher migrations already applied; their exact source files are now restored to this repository;
- migration 20261117020000 applied as TradeLink immutable revision snapshots (not an FRT migration);
- company profile migration 20261117051021 and accounting migration 20261117051040 applied and verified;
- zero production FRT requests and expense lines;
- zero voucher counter rows;
- existing private frt-attachments bucket and membership-based storage policies.

Only the two approved additive CP-FRT-FLOW-03C migrations were applied. Existing WAO/WASS/PSTI names, company profile values, logos, fund requests, voucher numbers and financial records remain unchanged. The previously remote-only TradeLink and FRT WF-05A/WF-05B migration sources were restored byte-for-byte and reconciled into the branch manifest without modifying or reapplying their SQL. Genuine production request-level acceptance remains pending because the signed production view and database currently contain zero FRT requests.

## Acceptance classification

- IMPLEMENTED: Company profile editor, upload/readback integration, manual accounting editor, exact-cent calculations, reusable manual templates, revisioned persistence RPC, canonical voucher projection, PDF accounting section.
- VERIFIED: Disposable PostgreSQL migrations and business rules; frontend unit tests; Chromium editor/PDF acceptance; production build and CI after completion.
- VERIFIED: Both additive CP-FRT-FLOW-03C migrations are installed in production; exact migration versions, RPC grants, RLS state, and unchanged business-record counts were read back.
- PENDING: Main merge/Pages deployment and live signed profile/accounting transaction acceptance when a genuine FRT request and company profile details are available.
- NOT APPLICABLE: New voucher document table, new DV counter, new storage bucket or new approval hierarchy.
