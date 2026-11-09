# FuelTrack+ v3 — Recovery retention architecture and policy-evidence gate

Date: 2026-11-10, Asia/Manila
Status: Development-only gate implemented; write-enabled retention architecture NOT APPROVED
Related: PR #185, Issue #189, WatchdogWorkspace recovery policy #76

## Approved baseline

- Continue using the existing WatchdogWorkspace Supabase project.
- No additional hosted Supabase project and no live production restore rehearsal.
- Require whole-Workspace 24-hour RPO, 24-hour RTO and mandatory full recovery rehearsal, including private Storage objects.
- FuelTrack production migrations are authorized; receipt privacy Option A is approved.
- No official provider exception for physical backup rehearsal has been evidenced.

## Proposed architecture — NOT APPROVED

An operational system of durable database plus private Storage backups requires:

1. Explicitly approved encrypted, durable, offsite destination with restricted writes, immutable retention and segregated delete credentials. The current local development Mac archive is not offsite recovery.
2. A trusted backup capture method that includes PostgreSQL, Auth, Storage object bytes and metadata, recording the earliest recoverable point of both subsystems and completeness of every set.
3. A recurring capture cadence and auditable success evidence sufficient to meet the whole-Workspace 24-hour RPO, including failed-job detection.
4. Separately approved retention duration and deletion governance. The gate's default proposal of SEVEN independent daily recovery sets is for testing ONLY, not an authorized retention period. The binding RPO is 24 hours.
5. Actual recovery rehearsal, byte-level checksums, service and Auth restoration and measured 24-hour RTO, with documented operator recovery responsibilities.
6. An explicit decision whether this independently managed LOGICAL backup path may replace the mandatory PROVIDER PHYSICAL-backup rehearsal. No substitution is implied by the development authorization.

No offsite destination, retention rule, deletion operation, new credential, ongoing agent or scheduled backup is installed.

## Implemented evidence-only retention gate

The one-shot, offline script scripts/ft3-recovery-retention-gate.mjs reads a local owner-only JSON index of independently archived database-and-Storage capture sets. For each set, it revalidates the SHA-256 manifest and actual private archived files, rejects missing files or duplicate capture identity, and assesses combined database/Storage timestamps, consecutive gaps, newest age and retained history.

Capture timestamps in this local index are operator-supplied and NOT attested database recovery-point identifiers. The tool cannot enforce offsite immutability, backup scheduling or deletion controls and intentionally returns productionRelease NO_GO even when proposed local history checks pass. It performs no writes, deletes, network connections or production operations.

## Real November 10 archive observation

The authorized Mac contains only ONE verified local independent recovery set from November 9, containing four SQL exports and five actual private Storage files.

- Verified independent recovery sets: 1.
- Proposed minimum set history: 7 independently captured daily sets (NOT APPROVED).
- Combined local archive capture age: 12.86 hours at inspection.
- Database and private Storage capture file evidence ages: 12.83 and 12.86 hours.
- Freshness of this one local set: within 24 hours at inspection.
- Consecutive multi-snapshot coverage: UNAVAILABLE.
- Sufficient retained history: NO.
- Automated recurring capture: NOT ESTABLISHED.
- Offsite immutable retention: NOT ESTABLISHED.
- Provider physical restore, hosted 24-hour RTO and rolling 24-hour RPO: UNVERIFIED.
- Production release: NO_GO.

The private evidence index is owner-only mode 0600 on the Mac, not in GitHub. The capture times are not authoritative Supabase transaction snapshots.

## On-demand verification

From the existing APSYNTRA CRM branch checkout on the authorized Mac:

    INDEX="$HOME/WatchdogWorkspace/.recovery-rehearsal/ft3-integrity-evidence/ft3-retention-observation-index-20261110.json"
    node scripts/ft3-recovery-retention-gate.mjs --index "$INDEX"

The expected outcome is a nonzero release gate exit code 2. Synthetic unit tests run in CI and never use the real private archive.

## Production approval boundary

The backup destination, cost, credentials, cadence, retention duration, permissions and potential substitution for the provider physical-backup rehearsal are material architectural and operational decisions. They require explicit scoped authorization before any write-enabled or scheduled backup changes.

Preserve PR #185 draft and Issue #189 open. Do not deploy the FuelTrack backend in production solely because the local archive is recent.
