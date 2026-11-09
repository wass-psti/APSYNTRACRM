# FuelTrack+ v3 — On-demand rolling RPO observation

Date: November 10, 2026 (Asia/Manila)
Classification: POINT-IN-TIME OBSERVATION; NOT SUSTAINED RPO ASSURANCE
Related: PR #185, recovery issue #189, WatchdogWorkspace recovery issue #76.

## Implementation and limits

The new one-shot command at scripts/ft3-rpo-observation.mjs reads the real
Supabase CLI physical backup inventory from standard input and verifies
the existing owner-only local SQL/Storage archive against its SHA-256
manifest. It inspects filesystem birth timestamps as **local capture-file
time metadata**, *not* authoritative database snapshot timestamps.
No production reads, Storage file downloads, backup writing, scheduled
agent, remote restore, email, user record output, or persistent logs are
performed by this tool.

Optional live Storage metadata counts and aggregate sizes may be passed
from an independently authorized read-only SQL inventory. Such a match
does not prove that contents/permissions have remained unchanged.

The tool computes physical backup observation interval gaps, newest completed
physical backup age, ages of locally archived SQL/Storage files, the
number of independent local snapshots in evidence, and metadata coverage.
It categorically refuses to infer an ongoing 24-hour RPO or a provider
physical restore from matching metadata or one local snapshot. Every
successful observation still reports productionRelease=NO_GO and returns
exit status 2.

## Actual November 10 observation (one execution)

- Project: existing WatchdogWorkspace (no new Supabase project).
- Completed physical backup timestamps in CLI inventory: 8.
- Latest listed completed physical backup: 2026-11-09T17:17:15.136Z.
- Newest completed physical backup age at observation: **0.77 hours**.
- Maximum observed interval between listed physical backup completions:
  **24.03 hours** across 7 measured intervals, narrowly exceeding 24 hours.
  A nominal daily schedule does not guarantee a strictly <=24-hour RPO.
- Oldest local SQL export file birth age: **12.70 hours**.
- Oldest local private Storage file birth age: **12.73 hours**.
  These are local *file age* measurements; the actual underlying live data
  capture point may be earlier and exports need not be transactionally
  consistent across schemas/Storage.
- Archived private Storage bytes: 5 objects, 114,010 bytes.
- Separate read-only live Storage aggregate: account-avatars 5 objects,
  114,010 metadata bytes; all other buckets empty at inspection.
- Metadata counts/bytes matched, but live object content comparison was
  not performed. File identities/paths were not published in the report.
- Independent local snapshot sets evidenced: **1** (November 9 archive).
- Actual provider physical-backup restoration: **UNVERIFIED**.
- Rolling database and Storage 24-hour RPO: **UNVERIFIED**.
- Full hosted production 24-hour RTO: **UNVERIFIED**.
- Production activation: **NO-GO**.

## On-demand invocation (no monitoring, no new snapshots)

From the APSYNTRA CRM branch checkout on the authorized Mac:

    ARCHIVE="$HOME/WatchdogWorkspace/.recovery-rehearsal/ws02d-20261109"
    MANIFEST="$HOME/WatchdogWorkspace/.recovery-rehearsal/ft3-integrity-evidence/ws02d-20261109-sha256.json"
    set -o pipefail
    supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json |
      node scripts/ft3-rpo-observation.mjs --archive "$ARCHIVE" --manifest "$MANIFEST" --live-storage-count 5 --live-storage-bytes 114010

Replace the optional live count and byte values only after a current
authorized read-only SQL inventory. Otherwise, omit both parameters and
the script explicitly leaves live Storage metadata coverage unverified.
The command deliberately exits 2 for NO-GO. Never commit manifests,
private backup files, service-role keys or actual user identifiers.

## Requirements still open

To establish a continuously met 24-hour RPO across the entire
WatchdogWorkspace, the project must separately authorize and implement
a durable recurring database and private Storage backup approach with
backup completeness, secured remote retention and recovery rehearsals.
No background agent or ongoing monitoring has been installed.

The previously binding physical provider backup recovery rehearsal and
complete hosted 24-hour RTO are still unresolved. Ask Supabase Support for
an acceptable non-disruptive physical restore method, or separately approve
a recovery architecture exception. Existing migration authorization and
receipt privacy Option A remain in force; production SQL was not applied.
