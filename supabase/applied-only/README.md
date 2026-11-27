## Applied-only production maintenance

This directory preserves exact production-ledger SQL for data-specific maintenance that must not be replayed blindly against a fresh Preview database. Archive files remain byte-preserved and are never executed from this directory.

A source may have an explicitly registered compatibility pair in supabase/migration-source-manifest.json. The original production source remains here and a separately reviewed replay-compatible source with the same version and name is registered under supabase/migrations/. The manifest records both hashes and the pair relationship.

The replayable source must skip only when the complete production-only fixture is absent and must abort on partial or mismatched fixture data. Never copy the archived SQL into the replay directory or execute the archive directly.

For production ledger reconciliation, compare the union of files, forward_migrations, and applied_only by migration version, accounting only for explicit compatibility pairs. Native Supabase CLI migration discovery reads the migrations directory, not this archive. Do not repair, delete, or reapply production ledger entries merely to suppress a source-classification difference. For restoration of a production backup, retain the actual migration ledger and data together.
