# TradeLink AR activation package

The workflow `.github/workflows/cp-tl-gm-04c-ar-package.yml` generates a versioned migration with the pinned Supabase CLI, copies the certified candidate byte-for-byte, rehearses it with synthetic PostgreSQL and uploads the package. No production credentials or production deployment are used.

Before authorized activation, run `sql/candidates/cp-tl-gm-04c-ar-production-preflight.sql` on the intended production database. If any check fails, stop and reassess. Apply the generated migration only through the established production migration procedure after approval. Verify both clearance RPCs and analytics, then perform signed acceptance with legitimate financial records. Roll back using the supplied rollback SQL if necessary; retain clearance evidence. The preflight is intentionally separate from the migration because synthetic fixtures do not have the production function fingerprint. The package does not enter the active migrations directory automatically.

## Ordered activation candidate

- Production and repository migration high-water mark observed: `20261126093000`.
- Original CLI-generated unapplied version: `20261126030848`.
- Ordered staged filename: `sql/candidates/activation/20261126093001_cp_tl_gm_ar_reconciliation.sql` (explicit rename of the unapplied generated migration, not a new CLI-generated timestamp).
- Certified SQL Git blob: `3c5c6adfac8de33d3fc76cb784b3988f1aee442c`.
- Certified SQL SHA-256 from runner: `bd3786d469ddf5637b711c666e5d70fa5c6ba59f905b268198a1bf0a6f5ac133`.
- Regression: https://github.com/wass-psti/APSYNTRACRM/actions/runs/45746963624.
- Production preflight passed in a read-only transaction. Recheck migration high-water mark and preflight immediately before activation.

The staged file is intentionally outside `supabase/migrations`. Do not use an endpoint that generates an earlier migration version; the available apply_migration API accepts name and SQL but no explicit version. Use the existing authorized deployment mechanism capable of preserving the ordered version, or wait until the service-generated version exceeds the current high-water mark and record the actual version returned. Do not manually edit migration history. Production activation and signed acceptance remain pending.
