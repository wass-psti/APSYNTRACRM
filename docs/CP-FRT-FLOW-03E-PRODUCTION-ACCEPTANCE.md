# CP-FRT-FLOW-03E — Genuine Production Company Profiles and Voucher Acceptance

## Baseline and scope

- Repository: `wass-psti/APSYNTRACRM`
- Base commit: `e8ab5debaa81fdfed38a1946d6e06315bd385904` (`main` after CP-FRT-WF-05 / FLOW-03D)
- Existing Supabase project: `jtlusodorfnyzgyuewkz`
- Existing workspace: `00000000-0000-4000-8000-000000000001`
- Preserve the canonical `frt_requests` / `frt_request_items` / `frt_request_accounting_lines` source of truth, existing DV number, company rows, existing `frt-attachments` bucket, and current RPC contracts.
- Do not create synthetic production fund requests, accounting lines, voucher numbers, company details, or placeholder logos.

## Genuine source evidence found on the authorized MacBook

1. `OVERALL OLD/OLD/WASS Corporate Profile Summary.pdf` — local file metadata shows creation/modification on 2026-07-24. OCR of its 30 pages identifies WASS as a sole proprietorship established in 2009, WAO as an OPC and designated successor entity, and PSTI as PLC Systems Technik, Inc. It describes the three as sister companies with separate legal identities and shared management/resources. Page 30 lists WASS contact email `info@watchdogautomation.com.ph`, mobile numbers `+63 917-888-3003` and `+63 917-111-8818`, and Mactan, Cebu as location.
2. `OVERALL OLD/OLD/Done/WASS.pdf` — quotation Q-011134 dated 2025-12-01 identifies `Watchdog Automation Sales & Services` and the Bldg. 2, Paseo de Amores, Sergio Osmeña St., Gun-ob, Lapu-Lapu City 6015 address.
3. `OVERALL OLD/OLD/Done/WAO.pdf` — quotation Q-011136 dated 2025-12-02 identifies `Watchdog Automation OPC` and the same Bldg. 2 / Gun-ob / Lapu-Lapu City address. Its telephone is `+63 917 888 3003` and its quoted email is `sales@watchdogautomation.com.ph`.
4. The current official WAO website, `https://watchdogautomation.com.ph/`, lists `Watchdog Automation OPC`, address Bldg. 2, Paseo De Amores, Gun-ob, Lapu-Lapu City 6015, telephone `+63 917 888 3003`, and email `info@plcsystems.com.ph`.
5. The current official PSTI website, `https://plcsystems.com.ph/contact/`, identifies `PLC Systems Technik Inc.` as PSTI and lists its current Basak, Lapu-Lapu City office, main telephone `+63 32 495 5566`, Sales & Marketing telephone `+63 947 795 6619`, and `sales@plcsystems.com.ph`.
6. `OVERALL OLD/OLD/Documents/DONE FILES/Disbursement Voucher - WASS.pdf` and `.../Disbursement Voucher - PSTI.pdf` are historical document examples. The WASS PDF uses an older variant of the WASS legal name; the PSTI PDF identifies PLC Systems Technik, Inc. and is not authoritative for a different legal entity name.
7. Local logo assets found: current WAO logo downloaded from its official website (`WAWithoutText2.png`); WASS logo `watchdog-logo.png` in the downloaded WatchdogWorkspace TradeLink assets; PSTI logo `PSTI_Logo-removebg-preview.png` in the old company documents. These are source assets, not generated placeholders.

## Identity discrepancy requiring resolution

The production FRT company row currently says `Process Solutions Technology Inc.` for code PSTI. The current official PSTI website and the July 2026 WASS Corporate Profile Summary identify PSTI as `PLC Systems Technik, Inc.`. Do not overwrite the production PSTI legal name until the user confirms which name must appear on the voucher. Do not attach the PLC Systems logo to a differently named legal entity before that confirmation.

## Implementation changes in this milestone

- Prevent browser-restored/autofilled legal-name, address, phone, or email values from being mistaken for persisted company profile data. The editor disables autocomplete and explicitly hydrates every field from the signed company-profile readback before accepting edits. A focused regression test covers this behavior.
- Use the neutral label `Company address` in the editor, voucher preview, and PDF. The discovered source documents establish office/head-office addresses, not a certified registered-office address; do not mislabel those addresses as legally registered without proof.
- Preserve the existing profile RPC, private logo upload/retrieval path, request-scoped accounting RPCs, and voucher/PDF architecture.

## Production baseline readback (2026-11-17)

- Supabase project: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.
- Three existing company rows: WAO, WASS, PSTI.
- Company address, phone, email, and logo references were NULL for all three companies at the initial CP03E readback.
- Existing `frt-attachments` object count: 0.
- Production FRT requests: 0.
- Production FRT request items: 0.
- Production accounting lines: 0.
- No production voucher or request was created/modified during discovery.

## Verification baseline before production profile updates

- Migration source manifest: PASS — 222 recovered baseline files and 16 forward migration files match SHA-256.
- Full frontend regression after CP03E changes: **2,545/2,545 PASS**.
- Focused company-profile regression: **10/10 PASS**, including persisted-profile hydration overriding browser-restored values.
- CP-FRT-FLOW-03C disposable PostgreSQL 17 acceptance: **PASS**, including company metadata, private logo path, exact-cent accounting, canonical voucher projection, stale revision conflict, atomic rejection, and concurrent revision serialization.
- Chromium voucher acceptance: **PASS** — genuine 7-page `%PDF-1.3`, two persisted accounting rows in the test fixture, exact-cent balance, PDF preview Blob, download, print and reprint controls; zero page errors.
- Production build: **PASS**. Existing non-fatal startup-guard script warning and large PDF chunk warning remain.

## Remaining genuine acceptance

- Configure WAO and WASS from the source-backed company profile information and logo assets.
- Resolve the PSTI legal-name discrepancy before saving its profile or associating its logo.
- Confirm all three profile reads return exact persisted values and logo retrieval returns validated private image bytes.
- Wait for a genuine production fund request; production currently has zero requests. Once one exists, save its actual manual accounting lines, close/reopen the voucher, verify balanced readback, then accept preview/download/print/reprint against the unchanged original DV number.
- No synthetic production financial data is permitted to bypass the missing request.
