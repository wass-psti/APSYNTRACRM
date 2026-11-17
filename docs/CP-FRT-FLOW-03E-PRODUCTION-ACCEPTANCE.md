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
2. OVERALL OLD/OLD/Done/WASS.pdf — quotation Q-011134 dated 2025-12-01 identifies Watchdog Automation Sales & Services, address Bldg. 2, Paseo de Amores, Sergio Osmeña St., Gun-ob, Lapu-Lapu City 6015, telephone +63 917 707 3079, email info@watchdogautomation.com.ph, and TIN 211-258-356-00000.
3. OVERALL OLD/OLD/Done/WAO.pdf — quotation Q-011136 dated 2025-12-02 identifies Watchdog Automation OPC, the same Bldg. 2 / Gun-ob / Lapu-Lapu City address, telephone +63 917 888 3003, email sales@watchdogautomation.com.ph, and TIN 010-737-641-000.
4. The current official Watchdog website, watchdogautomation.com.ph, corroborates the Bldg. 2, Paseo De Amores, Gun-ob, Lapu-Lapu City 6015 office and +63 917 888 3003 contact. Its current site also lists info@plcsystems.com.ph as a group contact. The WAO quotation retains the WAO-specific sales address sales@watchdogautomation.com.ph.
5. The current official PSTI website, plcsystems.com.ph/contact, identifies PLC Systems Technik, Incorporated as PSTI and lists its current office as 2F, Unit No. 4, Apple Town Commercial Bldg., Maximo V. Patalinghug Jr. Ave., Basak, Lapu-Lapu City, Cebu 6015, Philippines; Sales & Marketing +63 947 795 6619 / sales@plcsystems.com.ph; and Technical & Engineering +63 917 108 6383 / engg.services@plcsystems.com.ph.
6. OVERALL OLD/OLD/Documents/DONE FILES/Disbursement Voucher - PSTI.pdf is a historical document example dated 2026-02-03. It identifies PLC Systems Technik, Inc. and shows TIN 463-678-854-000; it is not authority to overwrite the current PSTI company row while its legal name conflicts with the supplied CRM company name.
7. Local logo assets found: WASS watchdog-logo.png and WAO watchdog-opc-logo.png in the downloaded WatchdogWorkspace TradeLink assets; PSTI PSTI_Logo-removebg-preview.png in the old company documents. These are existing company-branded source assets, not generated placeholders.

## Identity discrepancy requiring resolution

The production FRT company row currently says Process Solutions Technology Inc. for code PSTI. The current official PSTI website, the July 2026 WASS Corporate Profile Summary, and the 2026-02-03 historical voucher identify PLC Systems Technik, Incorporated; the earlier supplied CRM description also used Premier Safety Technologies Inc. The PLC Systems logo asset is already linked to the existing PSTI row, while its legal name remains unchanged. Do not change the PSTI name or TIN, replace its logo, or treat the identity as resolved until the user confirms the intended legal entity.

## Implementation changes in this milestone

- Prevent browser-restored/autofilled legal-name, address, phone, or email values from being mistaken for persisted company profile data. The editor disables autocomplete and explicitly hydrates every field from the signed company-profile readback before accepting edits. A focused regression test covers this behavior.
- Use the neutral label `Company address` in the editor, voucher preview, and PDF. The discovered source documents establish office/head-office addresses, not a certified registered-office address; do not mislabel those addresses as legally registered without proof.
- Preserve the existing profile RPC, private logo upload/retrieval path, request-scoped accounting RPCs, and voucher/PDF architecture.
- Add a persisted company TIN field to the existing frt_companies record and expose it in the profile editor, signed company-profile readback, voucher projection, HTML preview, and A4 PDF. The existing seven-argument frt_update_company_profile RPC remains intact for deployed clients; the new eight-argument overload adds TIN support without adding a role or approval tier.
- Correct private-storage cleanup to use the Supabase Storage object-removal endpoint and a single workspace/company-scoped object prefix. Only a newly uploaded, still-unlinked object is eligible for best-effort cleanup after a failed profile save.

## Production baseline readback (2026-11-17)

- Supabase project: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.
- Three existing company rows: WAO, WASS, PSTI.
- Initial CP03E readback showed no saved company profile metadata. Current production readback now shows linked WAO, WASS, and PSTI logo references; WAO also has phone +63 917 888 3003 and email info@plcsystems.com.ph. Company addresses remain NULL; WASS/PSTI phone and email remain NULL; TIN has not yet been added.
- The first signed WAO profile attempt exposed the upload-before-link readback defect. Two unlinked WAO logo objects remain from earlier attempts. Three later logo objects are now linked to WAO, WASS, and PSTI rows; the PSTI identity mismatch remains pending confirmation.
- Current company-profile storage contains 5 objects: 3 linked logo objects (WAO, WASS, PSTI) and 2 unlinked WAO objects from earlier failed/abandoned attempts. Both unlinked objects are preserved pending explicit cleanup approval.
- Production FRT requests: 0.
- Production FRT request items: 0.
- Production accounting lines: 0.
- No production voucher or request was created/modified during discovery.

## Verification baseline before production profile updates

- Migration source manifest: PASS — 222 recovered baseline files and 16 forward migration files match SHA-256.
- Full frontend regression after CP03E and TIN changes: **2,563/2,563 PASS**.
- Focused company-profile and voucher regression: **23/23 PASS** after the TIN projection, PDF display, signed readback, and logo cleanup API corrections.
- CP-FRT-FLOW-03C/03E disposable PostgreSQL 17 acceptance: **PASS**, including all three company TIN writes, backward-compatible seven-argument RPC behavior, private logo reference, exact-cent accounting, canonical voucher projection, stale revision conflict, atomic rejection, and concurrent revision serialization.
- Chromium voucher acceptance: **PASS** — genuine seven-page PDF, two persisted accounting rows in the disposable browser fixture, exact-cent balance, PDF preview Blob, download, print and reprint controls; zero page errors.
- Production build: **PASS**. Existing non-fatal startup-guard script warning and large PDF chunk warning remain.

## Remaining genuine acceptance

- Merge the updated implementation, apply the additive TIN migration to the existing Supabase project, then complete WAO and WASS address/contact/TIN fields and verify their existing linked logos by signed readback.
- Resolve the PSTI legal-name discrepancy before changing its legal name, TIN, address, contact details, or replacing its currently linked logo. The production row is Process Solutions Technology Inc.; official current/historical records identify PLC Systems Technik, Incorporated; the earlier CRM description says Premier Safety Technologies Inc.
- Confirm WAO/WASS profile reads return exact persisted values and their existing logo retrieval returns validated private image bytes. Leave the two unlinked WAO objects untouched unless cleanup is separately approved.
- Production currently has zero requests. Genuine voucher acceptance therefore remains blocked until a real production fund request exists or the user explicitly authorizes one clearly marked synthetic acceptance request. Once permitted, use balanced persisted accounting lines, close/reopen the voucher, and verify preview/download/print/reprint against its unchanged DV number.
- Do not create synthetic production financial data without explicit approval.
