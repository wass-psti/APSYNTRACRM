# CP-FRT-FLOW-03F — Production Voucher and Financial Lifecycle Acceptance

**Project:** APSYNTRA CRM  
**Repository:** wass-psti/APSYNTRACRM  
**Supabase project:** jtlusodorfnyzgyuewkz  
**Date:** 2026-11-17  
**Status:** IMPLEMENTED-UNVERIFIED / BLOCKED for genuine production transaction acceptance

## Baseline and scope

- Starting production branch: `main`
- Starting commit: `7e47b9fa6b7447d1731a674bbe372ed21698553d`
- Development branch: `feat/cp-frt-flow03f-20261117`
- Development worktree: isolated from the older local clone and based exactly on the starting commit.
- The older local clone was 1,273 commits behind `origin/main` and contained untracked `evidence/` and `supabase/.temp/`; it was not reset, cleaned, or modified.
- Preserve the canonical `frt_requests`, `frt_request_items`, `frt_request_accounting_lines`, company rows, voucher counter, signed voucher projection, existing bank/liquidation workflow and private `frt-attachments` bucket.
- No code or database changes were required during this acceptance pass; the existing implementation passed the available technical acceptance suites.

## Local environment and implementation verification

- MacBook Pro Apple Silicon, macOS; Node.js v22.23.4; npm 10.9.2.
- `npm ci`: PASS; 124 packages installed; 0 reported vulnerabilities.
- PDF engine build: PASS.
- Focused accounting/company-profile/voucher tests: **31/31 PASS**.
- Full frontend regression: **2,585/2,585 PASS**.
- Production Vite build: PASS. Existing non-fatal warnings remain for the classic startup-guard script not being bundled as a module and the large PDF-engine chunk.
- `git diff --check`: PASS; implementation worktree clean before this evidence document.

## Disposable PostgreSQL acceptance

- `scripts/cp-frt-flow03c-disposable-acceptance.sh`: PASS on disposable PostgreSQL 17.
- Verified company metadata/TIN separation, backward-compatible profile RPC, private logo references, existing DV number preservation, exact-cent double-entry persistence, canonical projection, stale revision rejection, atomic unbalanced-write rejection, and concurrent revision serialization.
- `scripts/cp-frt-flow03b-disposable-acceptance.sh`: PASS on disposable PostgreSQL 17.
- Verified WF-05A archive retrieval/recovery, WF-05B monthly/company voucher numbering and duplicate guard, and canonical voucher projection.
- Disposable containers were removed by the scripts' cleanup traps. No disposable rows were written to production.

## Chromium voucher/PDF acceptance

Executed `scripts/frt-voucher-browser-acceptance.mjs` against the isolated worktree Vite server on port 5174.

- Chromium: PASS; no page errors.
- Genuine generated PDF: PDF 1.3, 64,159 bytes, seven pages, A4 definition.
- Two persisted-fixture accounting rows; debit and credit reconcile exactly to the request total.
- Accounting editor save/readback contract: PASS.
- PDF preview Blob: PASS.
- Download: PASS.
- Print popup: PASS.
- Reprint popup: PASS.
- This is disposable browser-fixture evidence, not a genuine production voucher or real-user production print acceptance.

## Current production read-only evidence

- Supabase project `jtlusodorfnyzgyuewkz`: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.
- Production company rows WAO, WASS and PSTI exist.
- WAO and WASS company profiles have persisted address, contact details, TIN and linked existing logo references. Their exact profile values were independently read back from `public.frt_companies`.
- PSTI remains `Process Solutions Technology Inc.`; its address, phone, email and TIN remain NULL. Its existing logo reference remains linked.
- Do not alter PSTI legal identity or related profile values until the intended legal entity is confirmed. Existing official/company source evidence conflicts with the production legal name.
- Latest signed production Fund Tracker view reports zero requests.
- Read-only database counts: `frt_requests` 0; `frt_request_items` 0; `frt_request_accounting_lines` 0; `frt_voucher_counters` 0; `frt_bank_executions` 0; `frt_liquidations` 0; `frt_liquidation_items` 0.
- No production request, voucher, accounting entry, approval, bank execution, liquidation or voucher number was created or modified during CP-FRT-FLOW-03F.
- Production signed UI was observed Live synced during inspection. No live mutation was attempted.

## Acceptance classification

- **VERIFIED:** Current main baseline; isolated worktree; 31 focused tests; 2,585 full frontend tests; production build; CP-FRT-FLOW-03B and CP-FRT-FLOW-03C/03E disposable PostgreSQL acceptance; Chromium PDF preview/download/print/reprint fixture; WAO/WASS profile database readback; production database inventory.
- **IMPLEMENTED-UNVERIFIED:** Existing voucher/accounting/PDF code path in actual production, because no genuine production request exists to exercise it.
- **BLOCKED:** Genuine production voucher creation, accounting readback, voucher retrieval/reprint, and the Finance → General Manager → bank execution → liquidation lifecycle because production has no fund request, expense item, accounting line or voucher counter.
- **PENDING:** A legitimate production fund request with real business/payee/expense data; PSTI identity confirmation only if PSTI is the company selected for that transaction.
- **NOT APPLICABLE:** New voucher subsystem, new counter, new storage bucket, or additional role/approval tier.

## Next action

Use an actual business fund request entered through the existing FRT workflow, or identify an already-created legitimate request when one becomes available. Then execute the complete production voucher and financial lifecycle against that record, preserving its generated DV number. Do not create synthetic production financial records or invent company information to force acceptance.
