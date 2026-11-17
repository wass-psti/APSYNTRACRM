# CP-FRT-FLOW-03E — Production Company Profile and Voucher Acceptance

**Project:** APSYNTRA CRM  
**Application:** Fund Release Tracker / Fund Released Tracker  
**Supabase project:** jtlusodorfnyzgyuewkz  
**Date:** 2026-11-17

## Scope

Complete the existing company-profile record and canonical Disbursement Voucher output without creating a competing voucher model, changing voucher numbering, inventing accounting mappings, or introducing new roles/approval tiers.

The additive tax_id_number field is nullable. It must remain blank until the value is confirmed from an authoritative company record. The existing seven-argument frt_update_company_profile RPC remains available; the eight-argument overload persists the optional TIN.

## Verified implementation

- Existing frt_companies records are extended additively; no duplicate company records are created.
- Company-profile editor, persisted readback, form hydration, and the existing private logo workflow support TIN as an optional field.
- The canonical voucher projection receives the persisted TIN from the existing signed frt_bootstrap company projection.
- Voucher HTML preview and A4 PDF include the TIN only when present.
- The visible address label is Company address; the existing registered_address column name is retained for compatibility and is not treated as proof of a registered-office address.
- Existing voucher identity, sequential numbering, expense reconciliation, accounting lines, and lifecycle contracts remain unchanged.
- The migration 20261117060000_frt_company_profile_tax_id.sql is applied to the existing Supabase project.

## Test evidence

- Focused company-profile and voucher tests: 23/23 PASS.
- Full frontend regression: 2,563/2,563 PASS.
- Disposable PostgreSQL 17 company-profile/accounting acceptance: PASS, including WAO/WASS/PSTI profile separation, TIN persistence, backward-compatible seven-argument RPC invocation, exact-cent debit/credit balance, stale revision rejection, and concurrent revision serialization.
- Production Vite build: PASS. Existing non-blocking warnings remain for the startup-guard classic script and large bundled chunks.

## Production readback — no business writes

The live company records were inspected read-only:

| Company | Existing contact/address state | Logo object | TIN |
|---|---|---|---|
| WAO | Phone and email already populated; address blank | Existing object reference | Blank |
| WASS | Address, phone and email blank | Existing object reference | Blank |
| PSTI | Address, phone and email blank | Existing object reference | Blank |

The WASS corporate profile PDF in the user's local documents identifies its head office as Mactan, Cebu, Philippines and lists info@watchdogautomation.com.ph and +63 917-888-3003 / +63 917-111-8818. This supports WASS profile completion after the updated signed UI is deployed. It does not provide a verified TIN or a full street-level registered-office address. The document does not provide sufficient contact/address data to populate WAO or PSTI. Existing WAO values are preserved.

The live FRT database currently contains 0 requests, 0 expense items, and 0 accounting lines. No genuine production voucher or eligible end-to-end finance/GM/bank/liquidation lifecycle is available for acceptance. No synthetic transaction, approval, signature, bank reference, or accounting record was created.

## Acceptance classification

- VERIFIED: Additive database schema and RPC deployment; focused and full frontend tests; disposable PostgreSQL accounting/concurrency acceptance; production company/request readback.
- IMPLEMENTED-UNVERIFIED: Updated profile editor and TIN rendering until the rebased frontend change is merged, deployed, and rechecked in the signed production browser session.
- PENDING: Populate WASS's sourced head-office/contact details through the deployed profile editor; inspect all three existing logo objects in the signed runtime; obtain authoritative WAO/PSTI address/contact/TIN details; accept a genuine production request through voucher creation, accounting persistence, approval, GM verification, bank execution, liquidation, and PDF/print/reprint.
- NOT APPLICABLE: No new project, application, voucher counter, accounting subsystem, role, approval tier, or security redesign.

Production business records were not created or modified during this acceptance pass.
