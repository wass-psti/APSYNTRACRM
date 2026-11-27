# CP-TL-OPT-03A - Supabase Preview Migration Parity and Applied-Only Compatibility

## Objective

Make the production-applied TimeTracker QA retirement migration discoverable by Supabase GitHub branching without replaying production-only cleanup against a Preview database that has no production QA fixture.

## Source classification

- Production ledger version: 20261126044952.
- Original applied-only SQL: supabase/applied-only/20261126044952_retire_apsyntra_timetracker_qa_account.sql.
- Original source length: 5,658 bytes.
- Original SHA-256: 26f2050fdbb2c74147545ec9c35c525b20647d6cd7ea69b7a73f0b9c2160939c.
- Replay-compatible source: supabase/migrations/20261126044952_retire_apsyntra_timetracker_qa_account.sql.

The archived production source is not modified. The replayable source has a separate checksum and is registered in forward_migrations. The manifest compatibility_pairs entry links both source paths and hashes.

## Replay behavior

The replayable source checks the complete known production QA fixture footprint.

1. If the exact QA account is absent and no related fixture records remain, it emits a notice and performs no data changes.
2. If the target identity is mismatched, or partial fixture records remain without the exact account, it raises an exception.
3. If the exact account exists, it executes the original cleanup preconditions and cleanup statements. Changed or incomplete fixture data aborts the migration transaction.
4. The immutable TimeTracker OT audit trigger is disabled only for the exact audit-row deletion and is restored before completion.

The original production cleanup statements remain intact inside the guarded replayable source.

## Manifest and verifier

The manifest retains 222 recovered baseline entries and registers the new replayable source in forward_migrations. The original SQL remains in applied_only. The compatibility_pairs entry links both sources.

The verifier checks exact directory contents, byte lengths, SHA-256 hashes, unique replayable versions, and explicit one-to-one forward/applied-only pairs. Any unpaired duplicate or duplicate pair is rejected.

## Acceptance

The CP-TL-OPT-03A GitHub Actions workflow uses an isolated PostgreSQL 17 service and six disposable databases. It verifies:
- clean Preview skip with no data mutation;
- unrelated-only Preview data remains unchanged when the QA fixture is absent;
- mismatched QA identity abort with data preserved;
- partial fixture abort with data preserved;
- exact identity with incomplete fixture abort with data preserved;
- exact historical fixture cleanup while unrelated records remain unchanged and the immutable audit trigger is restored;
- source manifest and archive/replay hashes.

## Deployment boundary

No production Supabase SQL was executed. The production migration ledger was not repaired, deleted, or rewritten. This change does not alter application permissions, RLS, roles, or unrelated TradeLink behavior. No training, retraining, fine-tuning, gradient descent, or model-parameter update path was introduced.

The migration timestamp is later than the recovered production ledger baseline but earlier than some forward migration files. Supabase GitHub branching documents that an older timestamped migration can still run with a warning when it is not yet applied.

## References

- Supabase GitHub integration: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase branching: https://supabase.com/docs/guides/deployment/branching
