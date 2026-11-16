# Unapplied migration candidates

SQL files in this directory are retained development candidates that are not recorded as applied in the production supabase_migrations.schema_migrations ledger.

They are intentionally outside supabase/migrations/, so Supabase CLI migration discovery and Supabase Preview do not attempt to apply them. Do not move a candidate into the applied migration directory until its deployment is explicitly completed and its exact version appears in the production ledger.

## CP-BOARD-TRASH-PERMANENT-DELETE-01

20261116005252_cp_board_trash_permanent_delete_01.sql is a pending feature migration. It replaces the legacy permanent-delete RPC body with signed-session, board-manager, trashed-state, protected-board and Storage-reference checks, then grants EXECUTE only to the existing authenticated role. The function never deletes Storage objects or bypasses the existing board-manager capability.

This migration is deliberately kept outside supabase/migrations/ until the production permission change is explicitly approved. The frontend implementation and tests can be reviewed independently; permanent deletion will return an authorization error until the migration is applied to the existing Supabase project.
