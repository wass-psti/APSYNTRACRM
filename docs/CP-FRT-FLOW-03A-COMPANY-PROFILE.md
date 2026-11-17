# CP-FRT-FLOW-03A — Persisted Company Profile Metadata and Voucher Header Integration

## Scope

Add authoritative company profile fields to the three existing Fund Release Tracker company records (WAO, WASS and PSTI), expose profile configuration inside Fund Tracker, and include the saved profile in the existing signed voucher projection, HTML preview and A4 PDF output.

## Data model

- Reuse \`frt_companies.name\` as the legal company name.
- Add nullable \`registered_address\`, \`contact_phone\`, \`contact_email\`, and \`logo_path\` columns to the existing \`frt_companies\` records.
- Reuse the existing private \`frt-attachments\` Storage bucket and workspace-folder policies. Company logos are stored under \`{workspace_id}/company-profiles/{company_code}/{uuid}.{png|jpg|webp}\`.
- Extend \`frt_restricted_request_detail(uuid, uuid)\` in place. Its signature, existing workflow projection, ownership, and grants remain unchanged.
- Add \`frt_update_company_profile\` as the minimal signed write contract. It requires an active existing FRT membership, not a new role or approval tier.

## Application behavior

- Company Profile is available for the currently selected company from the existing Fund Tracker company selector.
- Legal name, registered address, telephone, email, and logo can be saved and reloaded.
- Each profile is keyed by the existing workspace/company record; values do not cross company boundaries.
- Logo uploads are signature-checked PNG/JPEG/WebP files up to 3 MB and use private Storage with short-lived signed reads.
- Existing voucher previews and PDFs consume the saved company profile. Existing voucher numbers and financial request records are unchanged.
- Missing fields remain nullable and are displayed as not configured; no official company details are invented.

## Preserved behavior

- Existing Supabase project and FRT company records.
- Existing request and expense tables.
- Existing voucher numbering and request lifecycle.
- Existing PDF engine, A4 layout, page headers/footers, print, download and reprint behavior.
- Existing FRT membership and signed session model.
- No new Storage bucket, company table, chart-of-accounts mapping, financial transaction, or production request.

## Verification

- Unit coverage for company profile projection, REQUESTOR membership compatibility, save/readback, invalid input, private logo upload/signing, and voucher projection.
- Disposable PostgreSQL acceptance covers all three companies, workspace/company isolation, logo-path validation, signed voucher projection, and unchanged voucher numbers.
- Frontend regression, production build, migration-source manifest validation, and GitHub Pages deployment checks run through GitHub Actions.
- Genuine browser profile editing and voucher output acceptance remain dependent on an interactive signed browser session.
