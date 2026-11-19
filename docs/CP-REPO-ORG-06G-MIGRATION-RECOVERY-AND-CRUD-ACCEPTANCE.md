# CP-REPO-ORG-06G — Migration source recovery and board acceptance

**Project:** `jtlusodorfnyzgyuewkz` (existing project). **Disposition:** Migration source reconciliation verified locally; isolated board regression verified; genuine production CRUD remains pending a designated disposable target.

## Authoritative production migration history

A read-only `supabase migration list --project-ref jtlusodorfnyzgyuewkz` comparison identified 254 applied production versions but only 252 committed local versions. The two missing production-applied versions were `20261119030243` and `20261119033532`.

Using Supabase CLI 2.121.0, `supabase migration fetch --project-ref jtlusodorfnyzgyuewkz` recovered the original SQL statements from `supabase_migrations.schema_migrations` into an isolated working tree. The two recovered source files are:

- `20261119030243_cp_crm_conn02f_native_application_contract.sql`
- `20261119033532_cp_crm_conn02f_native_context_compatibility.sql`

The fetch command also rewrote some existing local files; those tracked changes were **restored**. Only the two previously missing, already-applied SQL sources were retained, with their exact byte lengths and SHA-256 hashes registered as forward migrations in `supabase/migration-source-manifest.json`.

Verification: `node scripts/verify-migration-source-manifest.mjs` passes (222 baseline + 32 forward sources); a second read-only `supabase migration list --project-ref jtlusodorfnyzgyuewkz` shows **254 local / 254 remote, zero missing on either side**. No SQL was reapplied; no database ledger, application data, roles, grants, policies or permissions were changed.

## Board CRUD acceptance scope

The existing authenticated production board catalog exposed Contacts, Charter Navigator, Order Intake and Tool Traceability; none was identified as disposable. The previously documented QA workspace had no designated members. Therefore these real boards are **not** acceptable targets for experimental create/update/delete. Production CRUD persistence and independent-session readback remain **PENDING** until an explicitly designated disposable board and test actor are available.

Isolated board regression suites and Chromium fixtures can establish frontend behavior without production writes. They do **not** substitute for a genuine signed production CRUD round trip. No new permission gate or application authorization rule is introduced.

## Release verification

The migration-history source changes should be merged through normal GitHub checks. Following merge, verify the Supabase integration check on the new `main` SHA. A passing local version comparison is not itself proof that the Supabase GitHub integration is healthy.
