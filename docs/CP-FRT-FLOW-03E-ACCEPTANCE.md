# CP-FRT-FLOW-03E — Production Company Profile and Voucher Acceptance

**Project:** APSYNTRA CRM  
**Application:** Fund Release Tracker / Fund Released Tracker  
**Repository:** wass-psti/APSYNTRACRM  
**Supabase project:** jtlusodorfnyzgyuewkz  
**Date:** 2026-11-17

## Scope and implementation baseline

The functional implementation was merged in PR #470 at commit f5613f86 and the migration 20261117060000 was applied to the existing Supabase project. This follow-up records the authoritative production-source findings and acceptance boundaries; it does not create a second company or voucher subsystem.

- Preserve existing WAO, WASS and PSTI company rows, canonical request/item/accounting tables, existing voucher numbering, current RPC contracts, and private frt-attachments storage.
- Persist the optional company TIN in the existing frt_companies row. The existing seven-argument frt_update_company_profile RPC remains available; the additive eight-argument overload accepts the optional TIN.
- Hydrate and verify the TIN through the existing signed frt_bootstrap company projection; render it in the canonical voucher HTML and A4 PDF only when populated.
- Keep the visible address label neutral as Company address. A business/head-office address is not automatically represented as a registered-office address.
- No new project, application, role, approval tier, voucher counter, accounting subsystem, or security redesign.

## Authoritative company source evidence

The following source documents and official websites were inspected during the original CP-FRT-FLOW-03E discovery recorded in PR #470:

1. WASS Corporate Profile Summary PDF, dated July 2026: identifies WASS as a sole proprietorship, WAO as an OPC successor, and PSTI as a sister company; lists the WASS head office as Mactan, Cebu, Philippines, email info@watchdogautomation.com.ph, and mobile numbers +63 917-888-3003 / +63 917-111-8818.
2. WASS quotation Q-011134 dated 2025-12-01: identifies Watchdog Automation Sales & Services, address Bldg. 2, Paseo de Amores, Sergio Osmeña St., Gun-ob, Lapu-Lapu City 6015, Philippines, telephone +63 917 707 3079, email info@watchdogautomation.com.ph, and TIN 211-258-356-00000.
3. WAO quotation Q-011136 dated 2025-12-02: identifies Watchdog Automation OPC, the same Bldg. 2 / Gun-ob / Lapu-Lapu City address, telephone +63 917 888 3003, email sales@watchdogautomation.com.ph, and TIN 010-737-641-000.
4. Current official Watchdog website corroborates the Bldg. 2, Paseo de Amores, Gun-ob, Lapu-Lapu City 6015 office and +63 917 888 3003 contact. It also lists info@plcsystems.com.ph as a group contact. The WAO quotation provides the WAO-specific sales email.
5. Current official PSTI website identifies PLC Systems Technik, Incorporated and lists its office as 2F, Unit No. 4, Apple Town Commercial Bldg., Maximo V. Patalinghug Jr. Ave., Basak, Lapu-Lapu City, Cebu 6015, Philippines; Sales & Marketing +63 947 795 6619 / sales@plcsystems.com.ph; Technical & Engineering +63 917 108 6383 / engg.services@plcsystems.com.ph.
6. Historical Disbursement Voucher - PSTI.pdf dated 2026-02-03 shows TIN 463-678-854-000 for PLC Systems Technik, Inc. It is not authority to overwrite the current CRM PSTI company row while its legal name conflicts with the supplied CRM company name.
7. Existing branded logo source assets were found for WAO, WASS and PSTI. The production database already links three PNG logo objects to the three existing company rows; no generated placeholder logos were used.

## Company-specific data handling

| Company | Authoritative values available | Handling |
|---|---|---|
| WAO | Full office address; +63 917 888 3003; WAO quotation email sales@watchdogautomation.com.ph; TIN 010-737-641-000 | Address and TIN can be populated from the WAO quotation. Preserve the currently saved phone. Use the WAO-specific email from its quotation rather than replacing it with a generic group contact. Existing logo remains linked. |
| WASS | Full office address; corporate profile contacts +63 917-888-3003 / +63 917-111-8818; info@watchdogautomation.com.ph; quotation TIN 211-258-356-00000 | Populate address, corporate-profile phone numbers, email and TIN. The older quotation also lists +63 917 707 3079; retain as source evidence, but prefer the July 2026 corporate profile contacts. Existing logo remains linked. |
| PSTI | Official PLC Systems Technik office/contact details and historical TIN 463-678-854-000 | BLOCKED for profile write: production row name is Process Solutions Technology Inc.; the July 2026 group profile and official website identify PLC Systems Technik, Incorporated; an earlier CRM description used Premier Safety Technologies Inc. Do not change PSTI legal name, address, contacts, TIN, or logo until the intended legal entity is confirmed. |

## Production readback — company profiles updated, no financial transaction writes

The WAO and WASS profile records were updated through the signed production Company Profile editor using the source documents listed above. Each save returned “Company profile saved and read back successfully,” and a subsequent read-only Supabase query confirmed the persisted values.

| Company | Persisted address | Telephone | Email | TIN | Existing logo |
|---|---|---|---|---|---|
| WAO | Bldg. 2, Paseo de Amores, Sergio Osmeña St., Gun-ob, Lapu-Lapu City 6015, Philippines | +63 917 888 3003 | sales@watchdogautomation.com.ph | 010-737-641-000 | Signed image loaded, 566 × 548 |
| WASS | Bldg. 2, Paseo de Amores, Sergio Osmeña St., Gun-ob, Lapu-Lapu City 6015, Philippines | +63 917-888-3003 / +63 917-111-8818 | info@watchdogautomation.com.ph | 211-258-356-00000 | Signed image loaded, 580 px wide |
| PSTI | Unchanged | Unchanged | Unchanged | Unchanged | Existing signed image loaded, 473 × 263 |

PSTI remains unchanged because the production row says Process Solutions Technology Inc., while the official current website and historical company documents identify PLC Systems Technik, Incorporated; earlier CRM material also used Premier Safety Technologies Inc. Do not change the PSTI legal name or any associated company details until the intended legal entity is confirmed.

The three existing PNG logo references remain linked to the existing company rows. No replacement or placeholder logos were uploaded.

Production FRT requests: 0. Production expense items: 0. Production accounting lines: 0. No production request, voucher, approval, signature, bank reference, accounting line, or other synthetic financial record was created. Only WAO and WASS company-profile metadata was updated from authoritative company sources.

## Verification evidence

- Full frontend regression on the rebased branch: 2,570/2,570 PASS.
- Focused company-profile and voucher tests: 23/23 PASS.
- Disposable PostgreSQL 17 acceptance: PASS, including WAO/WASS/PSTI profile separation, TIN persistence, backward-compatible seven-argument RPC invocation, exact-cent debit/credit balance, stale revision rejection, and concurrent revision serialization.
- Production Vite build: PASS. Existing non-blocking startup-guard classic-script and large-chunk warnings remain.
- PR #484 accounting-company-profile CI: PASS, including full regression, disposable PostgreSQL acceptance, Chromium voucher PDF/download/print/reprint acceptance, and production build.
- Existing Supabase project confirms migration 20261117060000 is applied.
- WAO and WASS profile saves both returned successful signed readback; the read-only database query confirmed the exact address, contact and TIN values above.
- The signed profile editor successfully loaded the existing private logos for all three companies. No logo replacement or storage cleanup was performed.
- The production Pages deployment for the latest main commit completed successfully.

## Acceptance classification

- VERIFIED: Existing company schema/RPC extension and migration; focused/full frontend tests; disposable PostgreSQL accounting/concurrency acceptance; authoritative WAO/WASS source documents; WAO and WASS production profile saves with signed readback; all three existing private logo images loaded; production request/item/accounting readback.
- IMPLEMENTED-UNVERIFIED: Actual production voucher preview/PDF/print/reprint carrying the saved WAO/WASS details. The code path passes disposable Chromium/PDF acceptance, but production has no genuine voucher to render.
- PENDING: Resolve PSTI legal-entity identity with the user before any PSTI profile mutation; accept a genuine production request through voucher creation, accounting persistence, finance approval, GM verification, bank execution, liquidation, and PDF/print/reprint.
- BLOCKED: Genuine production voucher and full finance/GM/bank/liquidation acceptance because the live FRT database currently has zero requests, expense items and accounting lines. Do not create synthetic production financial data without explicit approval.

No production fund request, voucher, expense item, accounting line, approval, signature, or bank reference was created or modified during this acceptance pass.
