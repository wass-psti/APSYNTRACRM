# CP-TL-03B — Disposable PostgreSQL authorization and transaction acceptance

**Date:** 2026-11-05 (Asia/Manila)  
**Target:** existing APSYNTRA CRM TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Production change:** NONE. **Do not activate** `sql/cp-tl03-staged-domain.sql` on the existing Supabase project until the separate production-approval gate.

## Scope and current evidence

This checkpoint supplies a purpose-built CI workflow `.github/workflows/cp-tl03b-disposable-postgres.yml`:
- GitHub Actions `ubuntu-latest` runner and **PostgreSQL 17** service, with transient local credentials and a dedicated database `tradelink_disposable`.
- Read-only GitHub token permission; SHA-pinned `actions/checkout` with `persist-credentials: false`.
- Explicit local database hostname/database assertions before executing any SQL; no Supabase secrets or service-role credentials are referenced.
- Synthetic `auth.users`/`auth.sessions`/board/membership fixture; **never** production user data or production board records.
- Apply the previously staged CP-TL-03 SQL **only inside that disposable container**.
- Execute signed-fixture transactions, negative role/workspace/session cases, RLS/grants/audit checks, and existing Node regression tests.

## Exact CI acceptance sequence

1. Verify PostgreSQL 17 service and disposable database identity.
2. `psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-tl03-disposable-setup.sql`
3. `psql -X -v ON_ERROR_STOP=1 -f sql/cp-tl03-staged-domain.sql`
4. `psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-tl03-disposable-acceptance.sql`
5. `psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-tl03-postactivation-readonly.sql`
6. `node --test frontend/tests/tradelink-domain-client.test.mjs frontend/tests/tradelink-domain-sql-contract.test.mjs`

Use `https://github.com/wass-psti/APSYNTRACRM/actions/workflows/cp-tl03b-disposable-postgres.yml` for GitHub's authoritative run status and per-step logs. Do not infer PASS from a committed workflow alone.

## Expected checks (must be backed by actual logs)

| Check | Disposition required |
|---|---|
| Signed General Manager create | One authoritative Draft and one linked board item |
| Repeated identical create | Idempotent receipt; zero duplicate items/events |
| Draft CAS update | Revision advances 1 -> 2 and updates board Item title atomically |
| Stale expected revision | Denied with SQLSTATE 40001 |
| Foreign workspace | Read denied |
| Module User even with board owner | Domain access denied |
| General Manager module role but board editor | Domain access denied |
| No TradeLink module-role assignment, even with board owner | Explicit FALSE guard, RLS read denied, RPC mutation denied |
| Expired/revoked session | Read/write denied |
| Archive/restore | Reversible, board projection matches, audit revisions monotonic |
| Immutable event table | UPDATE/DELETE fails |
| Restricted grants | No anonymous reads or writes and no direct authenticated table mutations |
| Invalid draft fields, forged workflow, untrimmed number | Rejected without partial writes |
| Frontend stage gate | Reads/writes disabled until approved activation |

## Blocker found and corrected during 03B setup

The staged SQL in `main` had a malformed number regex and a duplicated tail with **two** `COMMIT;` statements, caused by unsafe replacement-string interpolation of a literal `$'` substring. Reconstructed the migration from the last intact revision (post NULL-role-hardening) and reapplied canonical document-number validation with a callback-based replacement. The staged migration now contains exactly one `BEGIN;`, one `COMMIT;`, and one list-RPC definition. Added `frontend/tests/tradelink-domain-sql-contract.test.mjs` coverage to prevent recurrence.

## Evidence classification

- **VERIFIED:** Existing GitHub `main` contains the CI workflow and intact staged SQL; the workflow configuration explicitly targets disposable local PostgreSQL; no production activation was requested or attempted in this checkpoint.
- **IMPLEMENTED-UNVERIFIED:** Runtime SQL/RLS/CAS acceptance workflow and synthetic tests committed; full CI completion, job logs and PostgreSQL results not independently available through the connected GitHub interface.
- **PENDING:** Actual CI run result, signed browser production acceptance, independent privileged-code security review and separate production schema/permission approval.
- **NOT APPLICABLE at this checkpoint:** Production migration/role activation, source document approvals, private file uploads, full TradeLink app workflows.

This gate is **not accepted** until the disposable PostgreSQL acceptance job has a confirmed successful outcome with matching logs and denial evidence.
