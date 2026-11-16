# CP-FRT-WF-05 — Fund Release Tracker functional integration

## CP-FRT-WF-05A — Archive Storage and soft recovery

- Adds a signed, company-scoped archive-list RPC returning bounded request metadata.
- Adds an indexed archive lookup by workspace, company and archive timestamp.
- Adds a transactional restore RPC that locks the archived request, reuses the existing General Manager role check, clears only `archived_at`, and appends `REQUEST_RESTORED`.
- Activates the Archive Storage interface and verifies restore readback before refreshing the active tracker.
- Reuses the existing `archive` request action and workflow preview.

## CP-FRT-WF-05B — Monthly voucher numbering and duplicate detection

- Converts the existing atomic voucher counter from annual to company/workspace/month scope.
- Allocates `DV-[COMPANY]-[YYYYMM]-[SEQ]` using the request date.
- Uses one PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` allocation, preserving concurrency safety.
- Adds a transaction-scoped advisory lock around the company/payee/amount duplicate key.
- Blocks matching submissions within ten minutes by default, including simultaneous submissions.
- Returns a specific duplicate warning so the existing request wizard can require an explicit second submission to confirm an intentional duplicate.
- Requires a beneficiary name and destination bank or GCash account in both the wizard and authoritative request RPC.
- Keeps recipient bank optional for supported wallet destinations.

## Preserved architecture and behavior

- Existing APSYNTRA repository, Supabase project, FRT tables, DomainApi and signed-session contracts.
- Existing FRT roles and workflow actions; no new role, authentication framework, approval stage or permission hierarchy.
- Existing request creation RPC privileges are preserved by `CREATE OR REPLACE FUNCTION`.
- No production fund requests, voucher counters, bank executions, liquidations or other financial records are created by acceptance.
- The monthly-counter migration fails safely if legacy annual counter rows exist; the production counter table was observed empty during read-only inspection.
- Production migrations have not been applied.

## Automated acceptance

- Full frontend regression suite.
- FRT JavaScript syntax checks.
- Disposable PostgreSQL 17 archive, recovery, monthly sequence, duplicate-block, explicit-override, beneficiary validation and expense-item persistence tests.
- Production frontend build.
- Migration source manifest byte-count and SHA-256 registration.

## Remaining CP-FRT-WF-05 scope

Double-entry voucher editor and PDF generation, management-review lifecycle alignment, bank/receipt attachment UI, PO synchronization, intercompany auto-detection and bilateral settlement workflow, historical archived OPEX continuity, and full signed browser acceptance remain to be verified or implemented separately.
