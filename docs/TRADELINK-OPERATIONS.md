# TradeLink — Current operations and release status

**Updated:** 2026-11-08 (Asia/Manila). **Project:** APSYNTRA CRM, existing shared WatchdogWorkspace Supabase. This is the single active TradeLink release-status summary. Historical checkpoint evidence remains in Git history and merged PRs.

## What we are building

Enable an authorized user to **create, save, reopen and preview a real Draft**, synchronizing the same persisted record with its **Board item** and **All Documents**. A local preview must not be reported as a database save.

The guarded Draft and document/Board integration code already exists. `sql/cp-tl03-staged-domain.sql` models the atomic document, Board row and audit transaction, with revision and retry protection. See [persistent document implementation](TRADELINK-PERSISTENT-DOCUMENT-OPERATIONS-INTEGRATION-20261107.md). Full submission, approval, legal PDF and attachment workflows remain separate functionality.

## Actual technical state

- **Stage A:** The source-controlled `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` previously passed 15/15 live read-only checks. Historical signed manager/employee and one revoked TL03 read report are bounded user-provided evidence, not proof of production document writes.
- **Legacy sessions:** The 11-function guard candidate is merged as source in `sql/cp-tl03e-legacy-session-hardening-candidate.sql`. Isolated PostgreSQL 17 [CI run 42395359606](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42395359606) passed all 11 exact-cause revoked-session denials and positive role/ACL scenarios. **The guards are not installed in the live database.**
- **Draft activation:** The last verified production state denied authenticated EXECUTE on both document commit functions. The frontend constants `TL03_DOMAIN_READS_ENABLED` and `TL03_DOMAIN_WRITES_ENABLED` both remain `false`. Real saved Draft → Board → All Documents acceptance has not occurred.
- **Review:** The project owner waived the optional independent review for the source candidate ([issue #75](https://github.com/wass-psti/APSYNTRACRM/issues/75)); this was not an independent security attestation or an authorization to apply SQL.

## Practical recovery constraints

The owner specified whole-project **RPO <= 24 hours** and **RTO <= 24 hours**, and **requires a demonstrated genuine restore rehearsal with no waiver**. They also restricted this work to the existing single Supabase project. These are targets, not verified recovery metrics.

The provider last reported **8 completed physical backups** (latest `2026-11-07T17:18:39.359Z`, or November 8 at 1:18 AM PHT), with WAL-G enabled and **PITR disabled**. Daily snapshots do not prove a worst-case 24-hour RPO or measured RTO. The last aggregate Storage inspection found seven private buckets and zero object-metadata rows; database backups **do not include actual Storage file bodies**. A provider in-place restore disrupts the shared production project. No supported isolated physical restore was verified without creating another project. The isolated synthetic `pg_dump`/`pg_restore` [test PR #81](https://github.com/wass-psti/APSYNTRACRM/pull/81) is regression evidence **not a real physical-backup restoration**.

This is **one real unresolved recovery limitation**, not a reason to create more approval/checkpoint documents. Do not fabricate a restoration or a waiver. Provider confirmation of a viable rehearsal path or explicit owner revision of constraints must precede any risky restore. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Direct path to working TradeLink documents

1. Keep actual data and permissions unchanged while the genuine restore-rehearsal constraint is unresolved. Avoid repeat synthetic tests and administrative review loops.
2. When a viable recovery decision and a **separate exact-scope production SQL approval** exist, execute only the reviewed 11-function session hardening with fresh source/owner/ACL preflight, a controlled operator/window and positive/negative signed-session checks. The candidate uses `psql` directives; do not paste it unchanged into the SQL editor.
3. Separately approve exactly the two Draft write grants in `sql/cp-tl03c-write-permission-candidate.sql`, with narrow rollback in `sql/cp-tl03c-stage-b-write-revoke-candidate.sql`, frontend activation and any real QA record.
4. Run **one end-to-end genuine authorized acceptance**: save/retry/update → persisted Draft → correctly linked Board item → All Documents → refresh/reopen, plus denied employee, foreign-workspace and revoked access. Fix any functional defects directly rather than inventing more milestone gates.

**Current status: The user-facing Draft persistence remains inactive in production.** Merged code, passing CI and a backup inventory do not change that. Unnecessary historical checkpoint documents have been removed from the active tree, with their contents retained in Git history.
