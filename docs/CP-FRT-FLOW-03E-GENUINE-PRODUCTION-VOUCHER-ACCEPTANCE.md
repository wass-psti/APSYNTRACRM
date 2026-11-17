# CP-FRT-FLOW-03E — Genuine Production Voucher Acceptance and Authoritative Company Profile Completion

**Project:** APSYNTRA CRM
**Application:** Fund Release Tracker / Fund Released Tracker
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `e8ab5debaa81fdfed38a1946d6e06315bd385904`
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Scope:** Correct the signed company-profile/logo persistence sequence, complete company metadata only from authoritative sources, and accept a genuine production voucher when a legitimate request is available.

## 1. Baseline and production evidence

- CP-FRT-FLOW-03D is merged and deployed.
- Existing company-profile, accounting, monthly voucher, duplicate guard, and archive migrations are present in the existing production project.
- Production currently contains three companies and zero FRT requests, voucher counters, or accounting lines.
- No production request, voucher, or financial transaction is to be fabricated for acceptance.

## 2. Production defect reproduced

A signed WAO company-profile save with a real official-site logo reproduced two issues:

1. The frontend uploaded the logo, then attempted to read the private logo before saving the logo path into `frt_companies`. The signed logo read correctly rejected the unlinked path, so the UI reported failure even though the upload had succeeded.
2. The subsequent profile readback could race a signed workspace-context generation change. The profile RPC had already persisted the submitted fields, but the readback could report `Signed workspace context changed during loading.`

The failed logo attempts created two unlinked objects in the existing private `frt-attachments` bucket. Neither is referenced by a company profile. They are tracked for cleanup after the corrected flow is deployed.

## 3. Implementation in this milestone

- Added `saveFRTCompanyProfileWithLogo` to orchestrate upload → company-profile save and authoritative readback → signed logo readback.
- The logo is now linked to the selected company before the app requests its signed preview.
- If the profile save fails after upload, cleanup removes only the newly uploaded, still-unlinked object within the selected workspace/company path.
- A single retry is allowed for the exact transient `Signed workspace context changed during loading.` condition, only while the signed user remains the same. The workspace and company are still revalidated after retry.
- The UI now reports a successful persisted profile separately from an unavailable logo preview.
- No new role, approval stage, workspace authority, authentication system, or database project was introduced.

## 4. Authoritative company source findings

### WAO — Watchdog Automation OPC

The official Watchdog Automation website footer identifies Watchdog Automation OPC. Its contact section publishes:

- Phone: `+63 917 888 3003`
- Email: `info@plcsystems.com.ph`
- Office address: `Bldg. 2, Paseo De Amores, Gun-ob, Lapu-Lapu City, Philippines, 6015`
- Official logo source: `https://watchdogautomation.com.ph/assets/images/WAWithoutText2.png?v=1`

The phone and email were saved through the existing signed Company Profile interface and verified in production. The website labels the address as its address, not as a registered SEC address; therefore `registered_address` remains blank. The official logo is staged locally and awaits the corrected deployed upload flow.

### WASS — Watchdog Automation Sales & Services

The signed 16 November 2026 BIOTECH FM1 proposal identifies the provider as `Watchdog Automation Sales & Services`, Cebu, Philippines, trading as Watchdog Automation. This supports the existing CRM company name. The proposal does not provide a registered street address, company telephone, or company email. The older 13 November FRT design document uses a different expansion for WASS and is treated as superseded for legal-name purposes. No WASS metadata is fabricated.

### PSTI — legal-name discrepancy

The official PSTI website identifies the current corporation as **PLC Systems Technik, Incorporated (PSTI)** and states that it formerly operated as Watchdog Automation Sales and Service (WASS). Its official contact page publishes:

- Main telephone: `+63 32 495 5566`
- Sales telephone: `+63 947 795 6619`
- Sales email: `sales@plcsystems.com.ph`
- Office address: `2F, Unit No. 4, Apple Town Commercial Building, Maximo V. Patalinghug Jr. Avenue, Basak, Lapu-Lapu City, Cebu, Philippines 6015`

The CRM currently stores `Process Solutions Technology Inc.` for PSTI. The older FRT requirements document uses yet another expansion, `Premier Safety Technologies Inc.`. The official website is the strongest current source, but the production legal name has not been changed pending confirmation because it prints on financial documents. The published office address is not represented as a registered address.

## 5. Production profile state

- WAO legal name preserved; official contact phone and email saved and verified.
- WAO registered address remains blank; logo path remains unlinked pending corrected deployment.
- WASS legal name preserved; address, contact details, and logo remain blank pending authoritative source data.
- PSTI legal name and profile remain unchanged pending confirmation of the legal-name correction; official source details are documented above.
- Two unlinked WAO logo objects from the reproduced defect remain pending deletion through the Storage API after corrected deployment.
- No production FRT request, accounting line, voucher counter, or official voucher was created.

## 6. Acceptance evidence

The 12 focused company-profile tests cover:

- Existing signed company-profile read/save contracts.
- Private logo upload signature validation and existing bucket use.
- Logo linking before signed readback.
- Cleanup of a newly uploaded unlinked logo when profile save fails.
- One retry for a transient signed-context generation change.
- Voucher projection and PDF use of persisted company metadata.

Verified on the CP-FRT-FLOW-03E working tree:

- Focused company-profile suite: **12 passed, 0 failed**.
- Full frontend regression: **2,547 passed, 0 failed**.
- Production build: **PASS**; the existing large PDF-engine chunk warning remains non-blocking.
- CP-FRT-FLOW-03B disposable PostgreSQL acceptance: **PASS**.
- CP-FRT-WF-05A/05B disposable PostgreSQL acceptance: **PASS**.
- CP-FRT-FLOW-03C disposable PostgreSQL 17 acceptance: **PASS**, including concurrent revision serialization.
- TimeTracker browser regression: **PASS**.
- Chromium voucher acceptance: **PASS**; PDF 1.3, 7 pages, 2 accounting rows, exact-cent balance, preview/download/print/reprint, zero page errors.
- Migration manifest: **PASS**, 222 recovered baseline and 16 forward migration files match SHA-256.
- JavaScript syntax and Git diff checks: **PASS**.

## 7. Remaining production acceptance

- Deploy the corrected profile/logo flow and verify the live Company Profile editor.
- Upload and link the official WAO logo; verify signed readback and voucher rendering.
- Remove only the two unlinked WAO logo objects created by the failed attempts.
- Confirm PSTI's correct legal name before changing the production legal-name field; then apply official contact data and logo.
- Obtain authoritative registered addresses for WAO, WASS, and PSTI. Published office addresses must not be relabeled as registered addresses.
- Obtain WASS official contact details and logo from an authoritative source.
- Use a legitimate production FRT request to verify monthly DV numbering, accounting persistence, exact-cent balance, signed voucher projection, PDF generation, printing, and historical reprint.

**No synthetic production financial records are permitted.**
