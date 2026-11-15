# Unapplied migration candidates

SQL files in this directory are retained development candidates that are not recorded as applied in the production supabase_migrations.schema_migrations ledger.

They are intentionally outside supabase/migrations/, so Supabase CLI migration discovery and Supabase Preview do not attempt to apply them. Do not move a candidate into the applied migration directory until its deployment is explicitly completed and its exact version appears in the production ledger.
