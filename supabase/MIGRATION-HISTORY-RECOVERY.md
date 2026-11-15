# CP-DB-MIGRATION-HISTORY-01 — Production migration source recovery

**Status:** Recovered and locally reconciled; Supabase Preview PR verification pending.
**Project:** jtlusodorfnyzgyuewkz (existing APSYNTRACRM project only).
**Scope:** Restore the exact applied migration versions and SQL statements to the repository so Git and the production migration ledger describe the same history.

## Production source of truth

The production supabase_migrations.schema_migrations ledger contains 222 distinct applied versions, from 20260917142647 through 20261115132051. Its statements array stores the SQL statements for each applied migration. A read-only catalog query confirmed 290 total SQL statements and no empty statement sets.

The missing source was recovered using Supabase CLI 2.121.0:

    supabase migration fetch --project-ref jtlusodorfnyzgyuewkz --workdir /path/to/isolated-recovery-workdir

The command was run against an isolated temporary directory, not the repository working tree. The recovered 222 SQL files were then compared with the production ledger using:

    supabase migration list --project-ref jtlusodorfnyzgyuewkz --workdir /path/to/isolated-recovery-workdir

All 222 local versions matched all 222 remote versions. The recovered SQL files are the canonical replay sources serialized from the production ledger. The CLI serializes statement arrays with SQL terminators; this can produce a final empty statement delimiter compared with older hand-authored source formatting. Two recovered files also had trailing horizontal whitespace removed for repository hygiene; no SQL tokens or statement order were changed. The manifest hashes the committed, whitespace-normalized recovery files.

## Repository reconciliation

- supabase/migrations/ now contains the 222 production-applied migrations only.
- supabase/migration-source-manifest.json records every version, filename, byte length, and SHA-256 digest.
- supabase/migration-recovery-map.json maps the previous 28 local filenames to their production-canonical filenames.
- The former local 20261113194500_cp_db_perf06_board_list_sql.sql was not present in the production ledger. It is preserved under supabase/migration-candidates/ and is deliberately excluded from the applied migration directory.
- Existing source/test references were updated to canonical production filenames. The CP-DB-PERF-06 candidate test continues to exercise the preserved candidate without treating it as an applied migration.

## Verification

Run the repository manifest check:

    node scripts/verify-migration-source-manifest.mjs

For a live read-only version comparison with the installed CLI 2.x syntax:

    supabase migration list --project-ref jtlusodorfnyzgyuewkz --workdir .

The GitHub Supabase Preview integration is the remaining hosted pipeline acceptance. It must report the same 222 applied versions after this branch is previewed.

## Safety and non-goals

This increment does not execute migration repair, db push, db pull, db reset, or any production DDL. It does not modify supabase_migrations.schema_migrations, application tables, policies, roles, grants, permissions, or user/workspace access. It creates no new Supabase project and introduces no new authorization restrictions.

The production ledger remains unchanged. Future schema changes must be introduced as new, forward-only migrations with their source committed before deployment.
