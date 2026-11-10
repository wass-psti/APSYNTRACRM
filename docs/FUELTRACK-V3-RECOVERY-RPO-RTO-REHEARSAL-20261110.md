> **Superseded recovery policy — 2026-11-10:** The owner retired mandatory
> 24-hour RPO/RTO, disaster-recovery rehearsal and AWS/offsite backup
> release gates across WatchdogWorkspace/APSYNTRA CRM. References below
> to their mandatory status are historical only. Existing backups,
> authentication, RBAC/RLS, audit and signed acceptance remain required.
> See [current owner decision](RECOVERY-POLICY-RETIREMENT-20261110.md).

# FuelTrack+ v3 — RPO/RTO Measurement and Local Recovery Rehearsal

Date: 2026-11-10. Status: LOCAL REHEARSAL VERIFIED; PRODUCTION NO-GO.
Related: PR #185, recovery issue #189.

## Rehearsal design

The operator verified the private November 9 archive SHA-256 manifest, then
started a disposable PostgreSQL 17.11 container with network disabled and no
published ports. The runner restored local roles, full schema, base data and
remaining data into a fresh disposable database and checked record totals.
It copied the five actual private Storage files to a restricted temporary
directory, verified SHA-256 digests against the manifest, and removed the
temporary files and container afterward.

The on-demand runner is scripts/ft3-recovery-rto-rehearsal.mjs.
The restored archive is private and is not uploaded to CI or GitHub.
No production Supabase project, schema, Storage, authentication, roles, or
permissions were modified. No background agent or monitoring was installed.

## Measured local results

- First successful full local rehearsal: 4.87 seconds.
- Successful rehearsal after startup hardening: 6.45 seconds.
- Final recorded successful rehearsal: **8.43 seconds**.
- Evidence retained only on the authorized Mac at the existing owner-only
  recovery evidence directory, file
  ft3-local-restore-measurement-20261110-17227.json, mode 0600.
- Restored counts: 41 profiles, 4 workspaces, 42 workspace members,
  42 Auth users, 5 Storage metadata rows.
- Five private Storage object files copied and SHA-256 verified.
- All disposable containers and temporary recovery copies were removed.
- The runner requires four successive stable PostgreSQL readiness checks
  because the Supabase image can restart its initialization server.
- Synthetic unit tests reject altered expected counts, invalid elapsed
  measurements, missing private Storage, and any attempt to convert a local
  restore into production readiness.

## Strict measurement boundary

Elapsed local timing **includes** disposable container startup with the
PostgreSQL image already cached on the owner's Mac, database initialization,
SQL restore, record checks, temporary private Storage copy and SHA-256
verification. It **excludes** backup creation, ongoing backup cadence,
offsite transfer, provider physical-backup restoration, hosted Auth/API/Edge
services and application startup, DNS, operator response and recovery routing.

Therefore local elapsed time does not prove the full production RTO.

## RPO assessment

The archived source is from November 9. Recoverability of that historical
snapshot does not establish a repeating <=24-hour database and Storage
backup cadence, nor an assured recovery point relative to future live writes.

- Local logical database plus Storage recovery rehearsal: VERIFIED.
- Actual provider physical-backup restore: UNVERIFIED.
- Continuous/rolling database 24-hour RPO: UNVERIFIED.
- Continuous/rolling private Storage 24-hour RPO: UNVERIFIED.
- Hosted end-to-end 24-hour RTO: UNVERIFIED.
- Production FuelTrack activation: NO-GO.

## Reproduction

Run on the authorized Mac, from the APSYNTRA CRM checkout. Never paste
or upload the private archive or evidence manifest.

    export FT3_RECOVERY_ARCHIVE="$HOME/WatchdogWorkspace/.recovery-rehearsal/ws02d-20261109"
    export FT3_RECOVERY_MANIFEST="$HOME/WatchdogWorkspace/.recovery-rehearsal/ft3-integrity-evidence/ws02d-20261109-sha256.json"
    export FT3_RECOVERY_EVIDENCE_DIR="$HOME/WatchdogWorkspace/.recovery-rehearsal/ft3-integrity-evidence"
    node scripts/ft3-recovery-rto-rehearsal.mjs

The runner performs a single isolated local operation and cleans resources.
GitHub CI tests only the synthetic measurement classifications, never the
private user archive or database.

## Next release gate

The previously required physical provider restore exception or an explicit,
separately approved change to the recovery architecture is still necessary.
The full Workspace 24-hour RPO/RTO objectives must be evidenced before
applying the already-authorized production FuelTrack migrations.
