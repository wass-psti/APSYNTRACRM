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
- **VERIFIED (2026-11-06 independent follow-up):** Disposable PostgreSQL 17 CI run #13 (41950802327), job 126994002587 completed successfully; every relevant signed-fixture/CAS/RLS/role/foreign/revoked/expired/audit/emergency-disable step succeeded. Decoded logs and the final Node test summary (16 pass, 0 fail) were inspected. This is synthetic disposable integration evidence, not genuine production signed-user acceptance.
- **PENDING:** Genuine signed production operational acceptance, independent privileged-code security review as required, and the separate Stage B production write-permission approval. Stage A production schema/read activation was already separately approved and installed; no further Stage A application is appropriate.
- **NOT APPLICABLE at this checkpoint:** Production migration/role activation, source document approvals, private file uploads, full TradeLink app workflows.

The **disposable PostgreSQL integration acceptance component is VERIFIED**, as of the independently inspected GitHub Actions run #13 and decoded logs. This does **not** certify production live signed-user acceptance or grant permission for Stage B activation.


## Independent CI acceptance addendum — 2026-11-06

The previously unavailable run-level evidence was recovered from GitHub Actions **run #13** (`41950802327`): https://github.com/wass-psti/APSYNTRACRM/actions/runs/41950802327. Job `126994002587` finished success, with all relevant PostgreSQL 17 synthetic fixture, schema, Stage A deny-write, disposable-only Stage B grant, signed create/retry/CAS/archive/restore, role ceilings, cross-workspace, revoked/expired-session fixture, audit, rollback, and frontend Node regression steps green. Decoded logs explicitly contain the signed draft, negative-role, immutable-audit and emergency-disable PASS notices. Node summary: **16 pass, 0 fail**. Earlier workflow **run #12** (`41883536962`) also finished success. No production schema, permissions or user sessions were changed by this CI evidence inspection.

The separately installed Stage A production migration is `20261105011611` and its read-only contracts were independently reconfirmed by `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql`: **15/15 checks PASS**, with Stage B write access still denied. See `docs/CP-TL-03C-PHASE-1-PRODUCTION-PREFLIGHT-2026-11-06.md`. This appendix supersedes the older unverified-CI disposition above.
